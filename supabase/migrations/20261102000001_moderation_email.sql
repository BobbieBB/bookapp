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
  -- how far the daily digest has sent: each run covers what came after this, so nothing is mailed twice
  -- and a skipped day is caught up (null: the last 24 hours)
  digest_sent_through timestamptz,
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

-- One row per e-mail handed to pg_net. pg_net sends after the transaction commits, so a refusal from
-- Resend (a key without a verified domain, an used-up quota) shows up only in net._http_response, which
-- pg_net empties after a few hours. moderation_email_check copies the answers here, and the Moderation
-- screen warns the PO when they are bad. A report's mail names its report, so a later report on the same
-- target knows the PO has been told.
create table public.moderation_email_log (
  id          bigint generated always as identity primary key,
  request_id  bigint not null,
  kind        text not null check (kind in ('report', 'removal', 'digest', 'other')),
  created_at  timestamptz not null default now(),
  checked     boolean not null default false,
  status_code int,
  report_id   uuid references public.reports (id) on delete set null
);
create index moderation_email_log_unchecked_idx on public.moderation_email_log (created_at) where not checked;
create index moderation_email_log_report_idx on public.moderation_email_log (report_id) where report_id is not null;
alter table public.moderation_email_log enable row level security;
revoke all on public.moderation_email_log from public, anon, authenticated;

-- Reader-written text goes into a plain-text mail: a line break could forge a "Link:" or "Reply to"
-- line, so every control character becomes a space.
create or replace function public.moderation_email_clean(p_text text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(p_text, '[[:cntrl:]]+', ' ', 'g'))
$$;
revoke execute on function public.moderation_email_clean(text) from public, anon, authenticated, service_role;

-- Send one plain-text e-mail through Resend, with the API key from Supabase Vault (`resend_api_key`).
-- Does nothing while sending is off, without pg_net or Vault (plain Postgres), and warns when the key
-- is not stored yet. Returns whether it was handed to pg_net. pg_net sends after the transaction commits.
-- `p_report` is the report a report's mail is about (logged with it).
create or replace function public.send_moderation_email(p_subject text, p_text text, p_kind text default 'other',
                                                        p_report uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  settings public.moderation_email_settings;
  api_key text;
  request bigint;
begin
  select * into settings from public.moderation_email_settings;
  if not coalesce(settings.enabled, false) or to_regproc('net.http_post') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into api_key using 'resend_api_key';
  if api_key is null then
    raise warning 'moderation e-mail not sent: no resend_api_key in Vault';
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)' into request
    using 'https://api.resend.com/emails',
          jsonb_build_object('from', settings.from_address, 'to', jsonb_build_array(settings.to_address),
                             'subject', p_subject, 'text', p_text),
          jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
          10000;
  insert into public.moderation_email_log (request_id, kind, report_id) values (request, p_kind, p_report);
  return true;
end $$;
revoke execute on function public.send_moderation_email(text, text, text, uuid) from public, anon, authenticated, service_role;

-- Copy Resend's answers from pg_net into the log (hourly: pg_net keeps them only a few hours). A request
-- with no answer after 2 hours counts as lost; a timeout as no answer. Log rows are kept 30 days.
create or replace function public.moderation_email_check()
returns void language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('net._http_response') is not null then
    execute $q$
      update public.moderation_email_log l
      set checked = true, status_code = case when r.timed_out then null else r.status_code end
      from net._http_response r
      where r.id = l.request_id and not l.checked
    $q$;
  end if;
  update public.moderation_email_log set checked = true where not checked and created_at < now() - interval '2 hours';
  delete from public.moderation_email_log where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.moderation_email_check() from public, anon, authenticated, service_role;

-- For the Moderation screen (admins only): how many e-mails failed in the last 24 hours, and with what
-- status code (null: no answer). Zero while sending is off, so a switched-off setup never warns. Only
-- failures sent after the latest mail that went through (2xx) count: once the key or the domain is
-- fixed, the warning goes with the first good send instead of hanging on for a day.
create or replace function public.moderation_email_health()
returns table (failures int, last_status int, to_address text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select case when s.enabled then count(f.id)::int else 0 end,
           case when s.enabled then (array_agg(f.status_code order by f.created_at desc, f.id desc))[1] end,
           s.to_address
    from public.moderation_email_settings s
    left join public.moderation_email_log f
      on f.checked and (f.status_code is null or f.status_code not between 200 and 299)
         and f.created_at > now() - interval '24 hours'
         and f.created_at > coalesce((select max(ok.created_at) from public.moderation_email_log ok
                                      where ok.checked and ok.status_code between 200 and 299), '-infinity')
    group by s.enabled, s.to_address;
end $$;
revoke execute on function public.moderation_email_health() from public, anon;
grant execute on function public.moderation_email_health() to authenticated;

-- A new report: what kind, why, where, and the reporter's own words. Never who reported it, and no
-- reader's e-mail address.
create or replace function public.reports_send_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target text;
  story text;
begin
  -- One e-mail per target is enough: a pile-on (or one reader filing many) must not eat Resend's quota
  -- or bury the PO. The queue shows how many reported it. Only an open report that was really mailed
  -- counts: one filed while sending was off, or whose mail Resend refused, told the PO nothing. (A log
  -- row still waiting for Resend's answer counts as mailed. Log rows go after 30 days, so a report open
  -- that long no longer keeps the target quiet: the next one is a reminder.)
  if exists (select 1 from public.reports o
             join public.moderation_email_log l on l.report_id = o.id
             where o.id <> new.id and o.status = 'open'
               and (not l.checked or l.status_code between 200 and 299)
               and (o.comment_id = new.comment_id or o.review_id = new.review_id or o.reported_user_id = new.reported_user_id)) then
    return new;
  end if;
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
        case when story is not null then 'Story: ' || public.moderation_email_clean(story) end,
        case when nullif(public.moderation_email_clean(new.details), '') is not null
             then 'Reporter says: ' || left(public.moderation_email_clean(new.details), 500) end,
        '',
        'Open Moderation in the app to hide it or dismiss the report.'),
      'report', new.id);
  exception when others then
    -- (sqlstate only: an error text could echo the request headers, and the API key with them)
    raise warning 'e-mail for report % not sent (%)', new.id, sqlstate;
  end;
  return new;
end $$;
revoke execute on function public.reports_send_email() from public, anon, authenticated, service_role;

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
        case when story is not null then 'Story: ' || public.moderation_email_clean(story) end,
        case when coalesce(new.story_url, link) is not null then 'Link: ' || public.moderation_email_clean(coalesce(new.story_url, link)) end,
        'Contact: ' || public.moderation_email_clean(new.contact),
        case when nullif(public.moderation_email_clean(new.message), '') is not null
             then 'Message: ' || left(public.moderation_email_clean(new.message), 500) end,
        '',
        'Reply to the contact above. Open Moderation in the app to hide the fic or dismiss the request.'),
      'removal');
  exception when others then
    raise warning 'e-mail for removal request % not sent (%)', new.id, sqlstate;
  end;
  return new;
end $$;
revoke execute on function public.removal_requests_send_email() from public, anon, authenticated, service_role;

create trigger removal_requests_send_email after insert on public.removal_requests
  for each row execute function public.removal_requests_send_email();

-- The daily digest: open feedback and chapter-count requests that came after the last digest (the first
-- time: the last 24 hours), in one e-mail. Nothing is sent on a quiet day, nothing is mailed twice, and a
-- skipped day is caught up. The window moves on in the same transaction as the send, and only when the
-- mail was really handed over (or sending is on and there was nothing to say).
create or replace function public.moderation_digest()
returns void language plpgsql security definer set search_path = public as $$
declare
  settings public.moderation_email_settings;
  since timestamptz;
  upto timestamptz := now();
  feedback_lines text[];
  count_lines text[];
  sent boolean := false;
begin
  select * into settings from public.moderation_email_settings for update;
  if not coalesce(settings.enabled, false) then
    return;
  end if;
  since := coalesce(settings.digest_sent_through, upto - interval '24 hours');

  select array_agg('- ' || f.kind || ': ' || left(public.moderation_email_clean(f.body), 160)
                   || case when char_length(public.moderation_email_clean(f.body)) > 160 then '…' else '' end
                   order by f.created_at)
    into feedback_lines
  from public.feedback f
  where f.status = 'open' and f.created_at > since and f.created_at <= upto;

  select array_agg('- ' || public.moderation_email_clean(s.title) || ': ' || x.proposed || ' chapters (now '
                   || coalesce(s.total_sections::text, 'not set') || ')' order by x.created_at)
    into count_lines
  from public.chapter_count_requests x
  join public.stories s on s.id = x.story_id
  where x.status = 'open' and x.created_at > since and x.created_at <= upto;

  if feedback_lines is not null or count_lines is not null then
    sent := public.send_moderation_email(
      '[Livami] Moderation digest: ' || coalesce(cardinality(feedback_lines), 0) || ' feedback, '
        || coalesce(cardinality(count_lines), 0) || ' chapter-count requests',
      concat_ws(E'\n',
        'New since the last digest.',
        case when feedback_lines is not null then E'\nFeedback (' || cardinality(feedback_lines) || '):' end,
        array_to_string(feedback_lines, E'\n'),
        case when count_lines is not null then E'\nChapter-count requests (' || cardinality(count_lines) || '):' end,
        array_to_string(count_lines, E'\n'),
        E'\nOpen Moderation in the app.'),
      'digest');
  end if;
  if sent or (feedback_lines is null and count_lines is null) then
    update public.moderation_email_settings set digest_sent_through = upto;
  end if;
end $$;
revoke execute on function public.moderation_digest() from public, anon, authenticated, service_role;

-- pg_net makes the HTTP call after the transaction commits; pg_cron sends the digest every day at
-- 07:00 UTC and reads back Resend's answers every hour (Supabase only).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('moderation-digest', '0 7 * * *', 'select public.moderation_digest()');
    -- Resend's answers are copied out of pg_net's short-lived table every hour
    perform cron.schedule('moderation-email-check', '17 * * * *', 'select public.moderation_email_check()');
  end if;
end $$;
