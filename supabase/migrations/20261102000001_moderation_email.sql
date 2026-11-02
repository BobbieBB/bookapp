-- E-mail for moderation (docs/DECISIONS.md: Moderation in v1). Reports and author removal requests
-- reach the PO at once (Apple expects action on reports within 24 hours); feedback and chapter-count
-- requests come as one daily digest. Sent by the database through Resend (pg_net); the API key lives
-- only in Supabase Vault. Off until the project is set up for it.

-- One row: where the mail goes, who it is from, and whether sending is on.
create table public.moderation_email_settings (
  id           boolean primary key default true check (id),
  enabled      boolean not null default false,
  to_address   text not null default 'support@livami.app',
  from_address text not null default 'Livami <moderation@livami.app>',
  constraint moderation_email_settings_to check (to_address ~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$'),
  -- "name <address>" or a bare address (Resend accepts both); no line breaks or second recipients
  constraint moderation_email_settings_from check (
    from_address ~ '^[^<>@,;[:cntrl:]]*<[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+>$'
    or from_address ~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$')
);
insert into public.moderation_email_settings default values;
alter table public.moderation_email_settings enable row level security;
-- Admins can see it; only migrations or the service role change it (a hijacked admin account must not
-- be able to send reporters' and authors' details to another address).
-- Supabase's default privileges grant every role everything on new tables: take that back first.
revoke all on public.moderation_email_settings from public, anon, authenticated;
grant select on public.moderation_email_settings to authenticated;
create policy moderation_email_settings_admin_read on public.moderation_email_settings for select to authenticated
  using (public.is_admin());

-- Send one plain-text e-mail through Resend, with the API key from Supabase Vault (`resend_api_key`).
-- Does nothing while sending is off, without pg_net or Vault (plain Postgres), and warns when the key
-- is not stored yet. pg_net sends after the transaction commits.
create or replace function public.send_moderation_email(p_subject text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  settings public.moderation_email_settings;
  api_key text;
begin
  select * into settings from public.moderation_email_settings;
  if not coalesce(settings.enabled, false) or to_regproc('net.http_post') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into api_key using 'resend_api_key';
  if api_key is null then
    raise warning 'moderation e-mail not sent: no resend_api_key in Vault';
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    using 'https://api.resend.com/emails',
          jsonb_build_object('from', settings.from_address, 'to', jsonb_build_array(settings.to_address),
                             'subject', p_subject, 'text', p_text),
          jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
          10000;
end $$;
revoke execute on function public.send_moderation_email(text, text) from public, anon, authenticated;

-- A new report: what kind, why, where, and the reporter's own words. Never who reported it, and no
-- reader's e-mail address.
create or replace function public.reports_send_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target text;
  story text;
begin
  -- A failure to send must never lose the report.
  begin
    select case when new.comment_id is not null then 'comment'
                when new.review_id is not null then 'review' else 'reader' end,
           coalesce(
             (select s.title from public.comments c join public.discussions d on d.id = c.discussion_id
                join public.stories s on s.id = d.story_id where c.id = new.comment_id),
             (select s.title from public.reviews v join public.stories s on s.id = v.story_id where v.id = new.review_id))
      into target, story;
    perform public.send_moderation_email(
      '[Livami] New report: ' || new.reason,
      concat_ws(E'\n',
        'Report on a ' || target || '. Reason: ' || new.reason || '.',
        case when story is not null then 'Story: ' || story end,
        case when nullif(btrim(new.details), '') is not null then 'Reporter says: ' || left(btrim(new.details), 500) end,
        '',
        'Open Moderation in the app to hide it or dismiss the report.'));
  exception when others then
    -- (sqlstate only: an error text could echo the request headers, and the API key with them)
    raise warning 'e-mail for report % not sent (%)', new.id, sqlstate;
  end;
  return new;
end $$;
revoke execute on function public.reports_send_email() from public, anon, authenticated;

create trigger reports_send_email after insert on public.reports
  for each row execute function public.reports_send_email();

-- A new author removal request. The author wrote in good faith and expects an answer, so the e-mail
-- carries the link to the work and the contact the author gave (the PO replies to them herself).
create or replace function public.removal_requests_send_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  story text;
  link text;
begin
  begin
    select s.title, s.source_url into story, link from public.stories s where s.id = new.story_id;
    perform public.send_moderation_email(
      '[Livami] Author removal request',
      concat_ws(E'\n',
        'An author asks for their fic to be removed.',
        case when story is not null then 'Story: ' || story end,
        case when coalesce(new.story_url, link) is not null then 'Link: ' || coalesce(new.story_url, link) end,
        'Contact: ' || btrim(new.contact),
        case when nullif(btrim(new.message), '') is not null then 'Message: ' || left(btrim(new.message), 500) end,
        '',
        'Reply to the contact above. Open Moderation in the app to hide the fic or dismiss the request.'));
  exception when others then
    raise warning 'e-mail for removal request % not sent (%)', new.id, sqlstate;
  end;
  return new;
end $$;
revoke execute on function public.removal_requests_send_email() from public, anon, authenticated;

create trigger removal_requests_send_email after insert on public.removal_requests
  for each row execute function public.removal_requests_send_email();

-- The daily digest: open feedback and chapter-count requests from the last 24 hours, in one e-mail.
-- Nothing is sent on a quiet day.
create or replace function public.moderation_digest()
returns void language plpgsql security definer set search_path = public as $$
declare
  feedback_lines text[];
  count_lines text[];
begin
  select array_agg('- ' || f.kind || ': ' || left(replace(f.body, E'\n', ' '), 160) || case when char_length(f.body) > 160 then '…' else '' end
                   order by f.created_at)
    into feedback_lines
  from public.feedback f
  where f.status = 'open' and f.created_at > now() - interval '24 hours';

  select array_agg('- ' || s.title || ': ' || x.proposed || ' chapters (now ' || coalesce(s.total_sections::text, 'not set') || ')'
                   order by x.created_at)
    into count_lines
  from public.chapter_count_requests x
  join public.stories s on s.id = x.story_id
  where x.status = 'open' and x.created_at > now() - interval '24 hours';

  if feedback_lines is null and count_lines is null then
    return;
  end if;
  perform public.send_moderation_email(
    '[Livami] Moderation digest: ' || coalesce(cardinality(feedback_lines), 0) || ' feedback, '
      || coalesce(cardinality(count_lines), 0) || ' chapter-count requests',
    concat_ws(E'\n',
      'Open in the last 24 hours.',
      case when feedback_lines is not null then E'\nFeedback (' || cardinality(feedback_lines) || '):' end,
      array_to_string(feedback_lines, E'\n'),
      case when count_lines is not null then E'\nChapter-count requests (' || cardinality(count_lines) || '):' end,
      array_to_string(count_lines, E'\n'),
      E'\nOpen Moderation in the app.'));
end $$;
revoke execute on function public.moderation_digest() from public, anon, authenticated;

-- pg_net makes the HTTP call after the transaction commits; pg_cron sends the digest every day at
-- 07:00 UTC (Supabase only).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('moderation-digest', '0 7 * * *', 'select public.moderation_digest()');
  end if;
end $$;
