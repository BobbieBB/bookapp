-- Feedback can ask for a reply (docs/DECISIONS.md, "PO testing round on iPhone", C). An unticked box,
-- "I'd like a reply by e-mail": when ticked, the daily digest to the PO's support mailbox shows the
-- account's e-mail address under that feedback, and she replies from support@livami.app. Nothing new is
-- collected: the address is the one the reader signed up with. Unticked feedback stays as before: no
-- address anywhere in the e-mail.
alter table public.feedback add column wants_reply boolean not null default false;

-- The daily digest (20261102000001_moderation_email.sql), unchanged but for the reply line.
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
                   -- Only when the reader ticked "I'd like a reply by e-mail": their account's address.
                   || case when f.wants_reply and u.email is not null
                        then E'\n  Reply to: ' || public.moderation_email_clean(u.email) else '' end
                   order by f.created_at)
    into feedback_lines
  from public.feedback f
  left join auth.users u on u.id = f.user_id
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
