-- Suspending a reader (docs/DECISIONS.md, "Suspending a reader"; terms: a reader who seriously or
-- repeatedly breaks the rules can be suspended). profiles.is_suspended has always been enforced through
-- is_active_user() in the write policies; until now nothing could set it. An admin does, with a reason,
-- through set_reader_suspended; every change is logged in public.suspensions and the reader is told in
-- the app (never by push). A suspended reader still reads, keeps their library, sends feedback (the way
-- to contest it) and deletes their own comments, reviews, ratings and account.

alter type public.notification_type add value if not exists 'account_suspended';
alter type public.notification_type add value if not exists 'account_restored';

-- ---------------------------------------------------------------------------
-- The log: one row per suspension or lifting. Admins read it; nobody writes it but
-- set_reader_suspended. It goes with the reader's account when they delete it (the cascade).
-- ---------------------------------------------------------------------------
create table public.suspensions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  suspended  boolean not null,   -- true: suspended, false: lifted
  reason     text check (char_length(reason) between 1 and 500),
  by_admin   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (not suspended or reason is not null)
);
create index suspensions_user_idx on public.suspensions (user_id, created_at desc);

alter table public.suspensions enable row level security;
revoke all on public.suspensions from public, anon, authenticated;
grant select on public.suspensions to authenticated;
create policy suspensions_admin_read on public.suspensions for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Account notices have no room: discussion_id may now be empty, and suspension_id says which entry of
-- the log the notice is about (its reason is shown to the reader; the admin is never named).
-- ---------------------------------------------------------------------------
alter table public.notifications alter column discussion_id drop not null;
alter table public.notifications add column suspension_id uuid references public.suspensions (id) on delete cascade;

drop policy notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = notifications.actor_id)
    and (discussion_id is null or public.can_access_discussion(discussion_id))
  );

-- my_notifications gains the reason, and rows without a room (story and room columns are then null).
drop function public.my_notifications(int, public.notification_type[]);
create function public.my_notifications(p_limit int default 50, p_types public.notification_type[] default null)
returns table (
  id uuid, type public.notification_type, created_at timestamptz, read_at timestamptz,
  actor_username text, story_id uuid, story_title text, story_kind public.story_kind,
  room_kind public.discussion_kind, section_number int, comment_id uuid, reason text
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.created_at, n.read_at, a.username, s.id, s.title, s.kind, d.kind, d.section_number, n.comment_id,
         x.reason
  from public.notifications n
  left join public.discussions d on d.id = n.discussion_id
  left join public.stories s on s.id = d.story_id
  left join public.profiles a on a.id = n.actor_id
  left join public.comments c on c.id = n.comment_id
  left join public.suspensions x on x.id = n.suspension_id
  where n.user_id = auth.uid()
    and (p_types is null or n.type = any (p_types))
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = n.actor_id)
    -- nothing about a comment that was deleted or hidden by moderators
    and (n.comment_id is null or (c.deleted_at is null and not c.is_hidden))
    and (n.discussion_id is null or public.can_access_section(d.story_id, d.kind, d.section_number))
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke execute on function public.my_notifications(int, public.notification_type[]) from public, anon;
grant execute on function public.my_notifications(int, public.notification_type[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Suspending and lifting. Admins only (42501); a reason (trimmed, 1-500 characters) is required to
-- suspend (22023 when missing, 22001 when too long); never yourself (22023); an unknown reader is
-- P0002; suspending a suspended reader or lifting a suspension nobody has is 55000.
-- ---------------------------------------------------------------------------
create or replace function public.set_reader_suspended(p_user uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  why constant text := nullif(btrim(p_reason), '');
  was boolean;
  entry uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can suspend readers' using errcode = '42501';
  end if;
  if p_user is null or p_suspended is null then
    raise exception 'say which reader, and whether to suspend or lift' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'you cannot suspend yourself' using errcode = '22023';
  end if;
  if p_suspended and why is null then
    raise exception 'suspending a reader needs a reason' using errcode = '22023';
  end if;
  if char_length(why) > 500 then
    raise exception 'the reason can be at most 500 characters' using errcode = '22001';
  end if;

  select is_suspended into was from public.profiles where id = p_user for update;
  if not found then
    raise exception 'no such reader' using errcode = 'P0002';
  end if;
  if was = p_suspended then
    raise exception '%', case when p_suspended then 'this reader is already suspended' else 'this reader is not suspended' end
      using errcode = '55000';
  end if;

  update public.profiles set is_suspended = p_suspended where id = p_user;
  insert into public.suspensions (user_id, suspended, reason, by_admin)
  values (p_user, p_suspended, why, auth.uid())
  returning id into entry;
  -- No actor: the reader is told what happened and why, not which admin did it. Not a reply or a
  -- mention, so notifications_send_push and send_held_pushes leave it alone (no push).
  insert into public.notifications (user_id, type, suspension_id)
  values (p_user, (case when p_suspended then 'account_suspended' else 'account_restored' end)::public.notification_type, entry);
end $$;
revoke execute on function public.set_reader_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.set_reader_suspended(uuid, boolean, text) to authenticated;

-- The signed-in reader's own state, for the banner: whether they are suspended now and the latest reason.
create or replace function public.my_suspension()
returns table (suspended boolean, reason text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select p.is_suspended,
         case when p.is_suspended then x.reason end,
         case when p.is_suspended then x.created_at end
  from public.profiles p
  left join lateral (
    select s.reason, s.created_at from public.suspensions s
    where s.user_id = p.id and s.suspended
    order by s.created_at desc limit 1
  ) x on true
  where p.id = auth.uid()
$$;
revoke execute on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;

-- ---------------------------------------------------------------------------
-- Write paths a suspension did not cover yet:
--   * deleting your own comment is an update (deleted_at), which the "active user" check refused: a
--     suspended reader may now delete (comments_guard_update turns the body into "[deleted]"), but still
--     not edit;
--   * your public name, display name and picture: a suspended reader cannot change them (an abusive
--     name is exactly the kind of thing a suspension stops). Everything else on the profile stays theirs.
-- ---------------------------------------------------------------------------
drop policy comments_update_own on public.comments;
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (author_id = auth.uid() and (public.is_active_user() or deleted_at is not null)));

create or replace function public.profiles_guard_suspended()
returns trigger language plpgsql as $$
begin
  if old.is_suspended and current_user = 'authenticated'
     and (new.username, new.display_name, new.avatar_url) is distinct from (old.username, old.display_name, old.avatar_url) then
    raise exception 'a suspended reader cannot change their name or picture' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard_suspended before update on public.profiles
  for each row execute function public.profiles_guard_suspended();

-- ---------------------------------------------------------------------------
-- The moderation queue says who a comment/review/reader report is about (subject_id) and whether they
-- are suspended now, so the Moderation screen can offer Suspend or Unsuspend. Same rows as before.
-- ---------------------------------------------------------------------------
drop function public.moderation_queue();
create function public.moderation_queue()
returns table (
  kind text, id uuid, created_at timestamptz,
  story_id uuid, story_title text, subject text, excerpt text, reason text, details text,
  contact text, story_url text, current_count int, proposed_count int, reporter_count int,
  subject_id uuid, subject_suspended boolean
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
           (select count(*)::int from public.reports o where o.comment_id = r.comment_id and o.status = 'open'),
           p.id as subject_id, p.is_suspended as subject_suspended
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
           (select count(*)::int from public.reports o where o.review_id = r.review_id and o.status = 'open'),
           p.id as subject_id, p.is_suspended as subject_suspended
    from public.reports r
    join public.reviews v on v.id = r.review_id
    join public.stories s on s.id = v.story_id
    left join public.profiles p on p.id = v.user_id
    where r.status = 'open'
    union all
    select 'user_report', r.id, r.created_at,
           null::uuid, null::text, p.username, null::text,
           r.reason::text, r.details, null, null, null, null,
           (select count(*)::int from public.reports o where o.reported_user_id = r.reported_user_id and o.status = 'open'),
           p.id as subject_id, p.is_suspended as subject_suspended
    from public.reports r
    join public.profiles p on p.id = r.reported_user_id
    where r.status = 'open'
    union all
    select 'removal_request', q.id, q.created_at,
           q.story_id, s.title, null::text,
           left(q.message, 280) || case when char_length(q.message) > 280 then '…' else '' end,
           null::text, null::text, q.contact, coalesce(q.story_url, s.source_url), null, null, null,
           null::uuid, null::boolean
    from public.removal_requests q
    left join public.stories s on s.id = q.story_id
    where q.status = 'open'
    union all
    select 'feedback', f.id, f.created_at,
           null::uuid, null::text, null::text,
           left(f.body, 280) || case when char_length(f.body) > 280 then '…' else '' end,
           f.kind, null, null, null, null, null, null,
           null::uuid, null::boolean
    from public.feedback f
    where f.status = 'open'
    union all
    select 'chapter_count', x.id, x.created_at,
           x.story_id, s.title, p.username, null::text,
           null::text, null::text, null::text, null::text, s.total_sections, x.proposed, null::int,
           null::uuid, null::boolean
    from public.chapter_count_requests x
    join public.stories s on s.id = x.story_id
    left join public.profiles p on p.id = x.requester_id
    where x.status = 'open'
  ) q
  order by q.created_at desc, q.id;
end $$;

revoke execute on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;
