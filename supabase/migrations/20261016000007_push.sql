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

-- The Expo push messages for one notification: one per device of the recipient. Never comment text.
create or replace function public.push_messages(p_notification uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'to', t.token,
      'title', 'Fictionally',
      'body', format(
        case
          when n.type = 'reply' and t.language = 'bg' then '%s ти отговори в %s · %s'
          when n.type = 'reply' then '%s replied to you in %s · %s'
          when t.language = 'bg' then '%s те спомена в %s · %s'
          else '%s mentioned you in %s · %s'
        end,
        coalesce(a.username, '…'), s.title,
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
revoke execute on function public.push_messages(uuid) from public, anon, authenticated;

-- Send as soon as a notification is created (only when switched on and pg_net is available).
create or replace function public.notifications_send_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  settings public.push_settings;
  messages jsonb;
begin
  select * into settings from public.push_settings;
  if not coalesce(settings.enabled, false) or to_regproc('net.http_post') is null then
    return new;
  end if;
  messages := public.push_messages(new.id);
  -- Expo takes at most 100 messages per request. A failure to send must never lose the comment.
  begin
    for i in 0 .. (jsonb_array_length(messages) - 1) / 100 loop
      exit when jsonb_array_length(messages) = 0;
      execute 'select net.http_post(url := $1, body := $2, headers := $3)'
        using settings.url,
              (select jsonb_agg(m) from jsonb_array_elements(messages) with ordinality as e(m, k) where k > i * 100 and k <= (i + 1) * 100),
              '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
    end loop;
  exception when others then
    raise warning 'push for notification % not sent: %', new.id, sqlerrm;
  end;
  return new;
end $$;

create trigger notifications_send_push after insert on public.notifications
  for each row execute function public.notifications_send_push();

-- pg_net makes the HTTP call after the transaction commits (Supabase only).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;
