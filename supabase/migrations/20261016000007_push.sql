-- Push notifications (docs/DECISIONS.md, MVP v1; Spoiler Safe Mode 5: notifications follow the
-- same rule and never contain comment text). Replies and @mentions buzz the reader's devices with
-- who, which story and which chapter, in the device's language; tapping opens the room, which
-- checks the spoiler wall again. Sent through Expo's push service from the database (pg_net).

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  language   text not null check (language in ('en', 'bg')),
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  constraint push_token_format check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$')
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
-- Readers see and remove their own devices; adding one goes through claim_push_token only.
grant select, delete on public.push_tokens to authenticated;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Register this device for the signed-in reader. A phone can change hands, so the device moves to
-- whoever signs in on it now.
-- At most 10 devices per reader: the ones not seen for longest are forgotten.
create or replace function public.claim_push_token(p_token text, p_language text, p_platform text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_tokens (token, user_id, language, platform)
  values (p_token, auth.uid(), p_language, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, language = excluded.language,
    platform = excluded.platform, updated_at = now();
  delete from public.push_tokens
  where user_id = auth.uid()
    and token not in (select token from public.push_tokens where user_id = auth.uid() order by updated_at desc, token limit 10);
$$;
revoke execute on function public.claim_push_token(text, text, text) from public, anon;
grant execute on function public.claim_push_token(text, text, text) to authenticated;

-- Forget a device by its token, also from a signed-out phone (the token itself is the secret).
create or replace function public.release_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token
$$;
revoke execute on function public.release_push_token(text) from public;
grant execute on function public.release_push_token(text) to anon, authenticated;

-- One row: where pushes go and whether sending is on (off until the project is set up for it).
create table public.push_settings (
  id      boolean primary key default true check (id),
  enabled boolean not null default false,
  url     text not null default 'https://exp.host/--/api/v2/push/send',
  constraint push_settings_url check (url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/[^[:space:]]*$')
);
insert into public.push_settings default values;
alter table public.push_settings enable row level security;
-- Admins can see it; only migrations or the service role change it (where pushes go is not an app
-- setting: a hijacked admin account must not be able to redirect every reader's device tokens).
grant select on public.push_settings to authenticated;
create policy push_settings_admin_read on public.push_settings for select to authenticated
  using (public.is_admin());

-- When a push went out, so replies close together can wait and go out as one (PO, 18 Oct 2026).
alter table public.notifications add column pushed_at timestamptz;
create index notifications_push_group on public.notifications (user_id, discussion_id, type, pushed_at);

-- The Expo push messages for one notification: one per device of the recipient. Never comment text.
-- With p_count > 1 it stands for that many replies (or mentions) in the same room: "3 new replies in …".
create or replace function public.push_messages(p_notification uuid, p_count int default 1)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'to', t.token,
      'title', 'Fictionally',
      'body', format(
        case
          when p_count > 1 and n.type = 'reply' and t.language = 'bg' then '%s нови отговора в %s · %s'
          when p_count > 1 and n.type = 'reply' then '%s new replies in %s · %s'
          when p_count > 1 and t.language = 'bg' then '%s нови споменавания в %s · %s'
          when p_count > 1 then '%s new mentions in %s · %s'
          when n.type = 'reply' and t.language = 'bg' then '%s ти отговори в %s · %s'
          when n.type = 'reply' then '%s replied to you in %s · %s'
          when t.language = 'bg' then '%s те спомена в %s · %s'
          else '%s mentioned you in %s · %s'
        end,
        case when p_count > 1 then p_count::text else coalesce(a.username, '…') end, s.title,
        case
          when d.kind = 'epilogue' and t.language = 'bg' then 'Епилогът'
          when d.kind = 'epilogue' then 'The Epilogue'
          when t.language = 'bg' then 'Глава ' || d.section_number
          else 'Chapter ' || d.section_number
        end),
      'sound', 'default',
      'data', jsonb_build_object('url', '/room/' || s.id || '/' || coalesce(d.section_number::text, 'epilogue'))
    )), '[]'::jsonb)
  from public.notifications n
  join public.discussions d on d.id = n.discussion_id
  join public.stories s on s.id = d.story_id and not s.is_hidden
  left join public.profiles a on a.id = n.actor_id
  join public.push_tokens t on t.user_id = n.user_id
  where n.id = p_notification and n.type in ('reply', 'mention')
    -- only rooms the reader can open now (they may have moved their progress back since)
    and public.user_can_access_section(n.user_id, d.story_id, d.kind, d.section_number)
$$;
revoke execute on function public.push_messages(uuid, int) from public, anon, authenticated;

-- Hand messages to Expo (at most 100 per request). pg_net sends after the transaction commits.
create or replace function public.send_push_messages(p_url text, p_messages jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  for i in 0 .. (jsonb_array_length(p_messages) - 1) / 100 loop
    exit when jsonb_array_length(p_messages) = 0;
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using p_url,
            (select jsonb_agg(m) from jsonb_array_elements(p_messages) with ordinality as e(m, k) where k > i * 100 and k <= (i + 1) * 100),
            '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
  end loop;
end $$;
revoke execute on function public.send_push_messages(text, jsonb) from public, anon, authenticated;

-- A reply or mention buzzes at once, unless the reader got a push of the same kind about the same room
-- in the last 10 minutes: then it waits for send_held_pushes, which bundles it with the others.
create or replace function public.notifications_send_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  settings public.push_settings;
begin
  select * into settings from public.push_settings;
  if new.type not in ('reply', 'mention') or not coalesce(settings.enabled, false) or to_regproc('net.http_post') is null then
    return new;
  end if;
  if exists (select 1 from public.notifications n
             where n.user_id = new.user_id and n.discussion_id = new.discussion_id and n.type = new.type
               and n.pushed_at > now() - interval '10 minutes') then
    return new;
  end if;
  update public.notifications set pushed_at = now() where id = new.id;
  -- A failure to send must never lose the comment.
  begin
    perform public.send_push_messages(settings.url, public.push_messages(new.id));
  exception when others then
    raise warning 'push for notification % not sent: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- Every minute (pg_cron): replies and mentions that waited go out as one push per reader, room and
-- kind once 10 minutes have passed since that room's last push. Ones older than 30 minutes (sending
-- was off, or pg_cron was down) are marked as sent without a push, so turning sending on never floods.
create or replace function public.send_held_pushes()
returns void language plpgsql security definer set search_path = public as $$
declare
  settings public.push_settings;
  g record;
begin
  select * into settings from public.push_settings;
  update public.notifications set pushed_at = now()
  where pushed_at is null and type in ('reply', 'mention') and created_at < now() - interval '30 minutes';
  if not coalesce(settings.enabled, false) or to_regproc('net.http_post') is null then
    return;
  end if;
  for g in
    select n.user_id, n.discussion_id, n.type, count(*)::int as held,
           (array_agg(n.id order by n.created_at desc, n.id))[1] as latest
    from public.notifications n
    where n.pushed_at is null and n.type in ('reply', 'mention')
      and not exists (select 1 from public.notifications p
                      where p.user_id = n.user_id and p.discussion_id = n.discussion_id and p.type = n.type
                        and p.pushed_at > now() - interval '10 minutes')
    group by n.user_id, n.discussion_id, n.type
  loop
    update public.notifications set pushed_at = now()
    where user_id = g.user_id and discussion_id = g.discussion_id and type = g.type and pushed_at is null;
    begin
      perform public.send_push_messages(settings.url, public.push_messages(g.latest, g.held));
    exception when others then
      raise warning 'bundled push for notification % not sent: %', g.latest, sqlerrm;
    end;
  end loop;
end $$;
revoke execute on function public.send_held_pushes() from public, anon, authenticated;

create trigger notifications_send_push after insert on public.notifications
  for each row execute function public.notifications_send_push();

-- pg_net makes the HTTP call after the transaction commits; pg_cron sends the bundles (Supabase only).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('send-held-pushes', '* * * * *', 'select public.send_held_pushes()');
  end if;
end $$;
