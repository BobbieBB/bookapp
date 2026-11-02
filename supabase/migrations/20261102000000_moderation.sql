-- The admin Moderation screen and "Wrong chapter count?" (docs/DECISIONS.md: Moderation in v1).
-- One queue of everything waiting for a moderator, and one function to resolve each item.

-- ---------------------------------------------------------------------------
-- Feedback gets a status so it can leave the queue. Readers never change it: the only way is
-- moderation_resolve (there is no update policy, and the function is security definer).
-- ---------------------------------------------------------------------------
alter table public.feedback add column status public.report_status not null default 'open';

drop policy feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');

-- A reader files reports and removal requests as open: one filed already dismissed or actioned would
-- never reach the queue (nor trigger the e-mail). Same policies as before, plus the status.
drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    and public.is_active_user()
    -- the subqueries run under the comments/reviews read policies: locked or hidden ones don't count
    and (comment_id is null or exists (select 1 from public.comments c where c.id = comment_id and c.author_id is distinct from auth.uid()))
    and (review_id is null or exists (select 1 from public.reviews r where r.id = review_id and r.user_id is distinct from auth.uid()))
    and (reported_user_id is null or reported_user_id <> auth.uid())
  );

drop policy removal_insert on public.removal_requests;
create policy removal_insert on public.removal_requests for insert to authenticated
  with check (requester_id = auth.uid() and status = 'open');

-- ---------------------------------------------------------------------------
-- Chapter-count requests: once a book has a count only a moderator changes it, so a reader who
-- sees a wrong one asks. Own rows only; no update or delete (moderation_resolve closes them).
-- ---------------------------------------------------------------------------
create table public.chapter_count_requests (
  id           uuid primary key default gen_random_uuid(),
  story_id     uuid not null references public.stories (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  proposed     int not null check (proposed between 1 and 5000),
  status       public.report_status not null default 'open',
  created_at   timestamptz not null default now()
);

create unique index chapter_count_one_open on public.chapter_count_requests (requester_id, story_id) where status = 'open';
create index chapter_count_requests_open_idx on public.chapter_count_requests (created_at) where status = 'open';

alter table public.chapter_count_requests enable row level security;
revoke all on public.chapter_count_requests from anon, authenticated;
grant select, insert on public.chapter_count_requests to authenticated;

-- The subquery runs under the stories and library read policies: a hidden book does not count.
create policy chapter_count_requests_insert on public.chapter_count_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'open'
    and public.is_active_user()
    and exists (
      select 1
      from public.stories s
      join public.library_entries le on le.story_id = s.id and le.user_id = auth.uid()
      where s.id = chapter_count_requests.story_id
        and s.kind = 'book' and s.has_chapters
        and s.total_sections is not null
        and s.total_sections <> chapter_count_requests.proposed
    )
  );
create policy chapter_count_requests_read on public.chapter_count_requests for select to authenticated
  using (requester_id = auth.uid() or public.is_admin());

-- At most 10 a day per reader (the same trigger as reports and feedback).
create constraint trigger chapter_count_requests_rate after insert on public.chapter_count_requests
  for each row execute function public.limit_rate('requester_id', '10', '1 day');

-- ---------------------------------------------------------------------------
-- The queue: every open item, newest first, in one shape so one screen renders all of it.
--   subject         comment author / review author / reported reader / the reader who asked for a count
--   excerpt         comment, review, removal message or feedback text, cut at 280 characters
--   reason          report reason, or the feedback kind
--   reporter_count  open reports on the same comment, review or reader (this one included)
-- ---------------------------------------------------------------------------
create or replace function public.moderation_queue()
returns table (
  kind text, id uuid, created_at timestamptz,
  story_id uuid, story_title text, subject text, excerpt text, reason text, details text,
  contact text, story_url text, current_count int, proposed_count int, reporter_count int
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can see the moderation queue' using errcode = '42501';
  end if;

  return query
  select q.* from (
    select 'comment_report'::text, r.id, r.created_at,
           d.story_id, s.title, p.username,
           left(c.body, 280) || case when char_length(c.body) > 280 then '…' else '' end,
           r.reason::text, r.details, null::text, null::text, null::int, null::int,
           (select count(*)::int from public.reports o where o.comment_id = r.comment_id and o.status = 'open')
    from public.reports r
    join public.comments c on c.id = r.comment_id
    join public.discussions d on d.id = c.discussion_id
    join public.stories s on s.id = d.story_id
    left join public.profiles p on p.id = c.author_id
    where r.status = 'open'
    union all
    select 'review_report', r.id, r.created_at,
           v.story_id, s.title, p.username,
           left(v.body, 280) || case when char_length(v.body) > 280 then '…' else '' end,
           r.reason::text, r.details, null, null, null, null,
           (select count(*)::int from public.reports o where o.review_id = r.review_id and o.status = 'open')
    from public.reports r
    join public.reviews v on v.id = r.review_id
    join public.stories s on s.id = v.story_id
    left join public.profiles p on p.id = v.user_id
    where r.status = 'open'
    union all
    select 'user_report', r.id, r.created_at,
           null::uuid, null::text, p.username, null::text,
           r.reason::text, r.details, null, null, null, null,
           (select count(*)::int from public.reports o where o.reported_user_id = r.reported_user_id and o.status = 'open')
    from public.reports r
    join public.profiles p on p.id = r.reported_user_id
    where r.status = 'open'
    union all
    select 'removal_request', q.id, q.created_at,
           q.story_id, s.title, null::text,
           left(q.message, 280) || case when char_length(q.message) > 280 then '…' else '' end,
           null::text, null::text, q.contact, coalesce(q.story_url, s.source_url), null, null, null
    from public.removal_requests q
    left join public.stories s on s.id = q.story_id
    where q.status = 'open'
    union all
    select 'feedback', f.id, f.created_at,
           null::uuid, null::text, null::text,
           left(f.body, 280) || case when char_length(f.body) > 280 then '…' else '' end,
           f.kind, null, null, null, null, null, null
    from public.feedback f
    where f.status = 'open'
    union all
    select 'chapter_count', x.id, x.created_at,
           x.story_id, s.title, p.username, null::text,
           null::text, null::text, null::text, null::text, s.total_sections, x.proposed, null::int
    from public.chapter_count_requests x
    join public.stories s on s.id = x.story_id
    left join public.profiles p on p.id = x.requester_id
    where x.status = 'open'
  ) q
  order by q.created_at desc, q.id;
end $$;

revoke execute on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- Resolving one item. Actions per kind:
--   comment_report, review_report   hide (hide the comment or review; this and every other open
--                                   report on it is actioned) | dismiss
--   user_report                     dismiss (no banning in v1)
--   removal_request                 hide (hide the fic; a request filed before the fic was added is
--                                   matched by its AO3 link now, and refused if there is still none) | dismiss
--   chapter_count                   accept (set the book's count; see below) | dismiss
--   feedback                        done | dismiss
-- Raises for an unknown kind or action, a missing id, or an item that is not open any more.
--
-- Accepting a count also moves the readers' progress so that nobody is left beyond the end of
-- the book: finished readers follow the new count, others past it are brought back to it
-- (library_entry_normalise refuses progress beyond the count on their next update otherwise).
-- ---------------------------------------------------------------------------
create or replace function public.moderation_resolve(p_kind text, p_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  outcome constant public.report_status := case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;
  rep public.reports;
  rem public.removal_requests;
  req public.chapter_count_requests;
  fb public.feedback;
  s public.stories;
  matched uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can resolve moderation items' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('comment_report', 'review_report', 'user_report', 'removal_request', 'chapter_count', 'feedback') then
    raise exception 'unknown moderation kind: %', coalesce(p_kind, '<none>') using errcode = '22023';
  end if;
  if p_action is null or not (p_action = any (case p_kind
       when 'comment_report' then array['hide', 'dismiss']
       when 'review_report' then array['hide', 'dismiss']
       when 'user_report' then array['dismiss']
       when 'removal_request' then array['hide', 'dismiss']
       when 'chapter_count' then array['accept', 'dismiss']
       else array['done', 'dismiss'] end)) then
    raise exception '% cannot be %', p_kind, coalesce(p_action, '<none>') using errcode = '22023';
  end if;

  if p_kind in ('comment_report', 'review_report', 'user_report') then
    select * into rep from public.reports
     where id = p_id
       and case p_kind when 'comment_report' then comment_id is not null
                       when 'review_report' then review_id is not null
                       else reported_user_id is not null end
     for update;
    if rep.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if rep.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    if p_action = 'hide' and p_kind = 'comment_report' then
      update public.comments set is_hidden = true where id = rep.comment_id;
      update public.reports set status = 'actioned' where comment_id = rep.comment_id and status = 'open';
    elsif p_action = 'hide' then
      update public.reviews set is_hidden = true where id = rep.review_id;
      update public.reports set status = 'actioned' where review_id = rep.review_id and status = 'open';
    else
      update public.reports set status = outcome where id = rep.id;
    end if;

  elsif p_kind = 'removal_request' then
    select * into rem from public.removal_requests where id = p_id for update;
    if rem.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if rem.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    if p_action = 'hide' then
      matched := rem.story_id;
      if matched is null then
        select id into matched from public.stories where lower(source_url) = lower(rem.story_url);
      end if;
      if matched is null then
        raise exception 'no fic in the app matches this link: dismiss the request' using errcode = '55000';
      end if;
      update public.stories set is_hidden = true, updated_at = now() where id = matched;
      update public.removal_requests set story_id = matched, status = 'actioned' where id = rem.id;
    else
      update public.removal_requests set status = 'dismissed' where id = rem.id;
    end if;

  elsif p_kind = 'chapter_count' then
    select * into req from public.chapter_count_requests where id = p_id for update;
    if req.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if req.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    if p_action = 'accept' then
      select * into s from public.stories where id = req.story_id for update;
      if s.kind <> 'book' or not s.has_chapters or s.total_sections is null
         or (s.published_sections is not null and req.proposed < s.published_sections) then
        raise exception 'this book cannot take that chapter count' using errcode = '55000';
      end if;
      update public.stories set total_sections = req.proposed, updated_at = now() where id = s.id;
      update public.library_entries
         set progress_section = case when status = 'finished' then req.proposed else least(progress_section, req.proposed) end
       where story_id = s.id
         and ((status = 'finished' and progress_section <> req.proposed) or progress_section > req.proposed);
      -- the same proposal from other readers is answered too; different ones stay for a moderator
      update public.chapter_count_requests set status = 'actioned'
       where story_id = s.id and status = 'open' and proposed = req.proposed;
    else
      update public.chapter_count_requests set status = 'dismissed' where id = req.id;
    end if;

  else
    select * into fb from public.feedback where id = p_id for update;
    if fb.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if fb.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    update public.feedback set status = outcome where id = fb.id;
  end if;
end $$;

revoke execute on function public.moderation_resolve(text, uuid, text) from public, anon;
grant execute on function public.moderation_resolve(text, uuid, text) to authenticated;
