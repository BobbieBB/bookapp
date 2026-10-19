-- Reports, removal requests and blocking (docs/DECISIONS.md: Fandom etiquette; DATA_MODEL.md: Blocking).

-- ---------------------------------------------------------------------------
-- Reports: only what you can see, never your own, once per reader and target.
-- ---------------------------------------------------------------------------
create unique index reports_once_per_comment on public.reports (reporter_id, comment_id) where comment_id is not null;
create unique index reports_once_per_user on public.reports (reporter_id, reported_user_id) where reported_user_id is not null;
create unique index reports_once_per_review on public.reports (reporter_id, review_id) where review_id is not null;

drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and public.is_active_user()
    -- the subqueries run under the comments/reviews read policies: locked or hidden ones don't count
    and (comment_id is null or exists (select 1 from public.comments c where c.id = comment_id and c.author_id <> auth.uid()))
    and (review_id is null or exists (select 1 from public.reviews r where r.id = review_id and r.user_id <> auth.uid()))
    and (reported_user_id is null or reported_user_id <> auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Removal requests: an AO3 work link and a way to reach the author, so an admin can verify the
-- request before hiding a fic.
-- ---------------------------------------------------------------------------
alter table public.removal_requests
  add constraint removal_contact check (char_length(trim(coalesce(contact, ''))) between 3 and 320) not valid,
  add constraint removal_story_url check (
    story_url is null or (story_url ~ '^https://archiveofourown\.org/works/[0-9]+$' and char_length(story_url) <= 200)
  ) not valid;

-- ---------------------------------------------------------------------------
-- Rate limits: a per-user cap on what one person can file in a window.
-- ---------------------------------------------------------------------------
create or replace function public.limit_rate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  user_column text := tg_argv[0];
  max_rows int := tg_argv[1]::int;
  window_length interval := tg_argv[2]::interval;
  n int;
begin
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - $2', tg_table_schema, tg_table_name, user_column)
    into n using auth.uid(), window_length;
  if n > max_rows then
    raise exception 'too many % in a short time: please wait a little', tg_table_name using errcode = '54000';
  end if;
  return null;
end $$;

create constraint trigger reports_rate after insert on public.reports
  for each row execute function public.limit_rate('reporter_id', '20', '1 hour');
create constraint trigger feedback_rate after insert on public.feedback
  for each row execute function public.limit_rate('user_id', '10', '1 hour');
create constraint trigger removal_requests_rate after insert on public.removal_requests
  for each row execute function public.limit_rate('requester_id', '5', '1 day');

-- ---------------------------------------------------------------------------
-- Blocking also hides the blocked person's reactions and their notifications to you.
-- ---------------------------------------------------------------------------
drop policy reactions_read on public.reactions;
create policy reactions_read on public.reactions for select to authenticated
  using (
    exists (select 1 from public.comments c where c.id = comment_id)
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = reactions.user_id)
  );

drop policy notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = notifications.actor_id)
  );
