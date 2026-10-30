-- Deleting your account inside the app (docs/DECISIONS.md, "Deleting an account: what happens to
-- comments", 19 Oct 2026). Comments and book reviews stay, anonymised: their author becomes NULL and
-- the app shows "Deleted reader". On request they are erased instead. Everything else that belongs
-- to the reader goes with the auth.users row, through the existing "on delete cascade" keys.

-- ---------------------------------------------------------------------------
-- Comments and reviews outlive their author
-- ---------------------------------------------------------------------------

-- Same constraint names: the app joins the author through them (profiles!comments_author_id_fkey).
alter table public.comments
  alter column author_id drop not null,
  drop constraint comments_author_id_fkey,
  add constraint comments_author_id_fkey foreign key (author_id) references public.profiles (id) on delete set null;

alter table public.reviews
  alter column user_id drop not null,
  drop constraint reviews_user_id_fkey,
  add constraint reviews_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;

-- The author of a comment still never changes, except to nobody when their account is deleted (the
-- "on delete set null" above); a deleted comment may be anonymised too. Comparisons are null-safe.
create or replace function public.comments_guard_update()
returns trigger language plpgsql as $$
begin
  if old.author_id is not null and new.author_id is null
     and not exists (select 1 from public.profiles where id = old.author_id) then
    if (new.discussion_id, new.parent_id, new.body, new.created_at, new.edited_at, new.deleted_at, new.is_hidden)
       is distinct from (old.discussion_id, old.parent_id, old.body, old.created_at, old.edited_at, old.deleted_at, old.is_hidden) then
      raise exception 'only the author can be removed from a comment when their account is deleted';
    end if;
    return new;
  end if;
  if new.discussion_id <> old.discussion_id or new.author_id is distinct from old.author_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'only the comment body can be changed';
  end if;
  if new.is_hidden <> old.is_hidden and not public.is_admin() then
    raise exception 'only moderators can hide comments';
  end if;
  if old.deleted_at is not null then
    raise exception 'deleted comments cannot be changed';
  end if;
  if new.deleted_at is not null then
    new.body := '[deleted]';
    new.edited_at := old.edited_at;
  elsif new.body <> old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

-- A comment or review by a deleted reader can still be reported ("<>" with NULL let nobody report it).
drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and public.is_active_user()
    -- the subqueries run under the comments/reviews read policies: locked or hidden ones don't count
    and (comment_id is null or exists (select 1 from public.comments c where c.id = comment_id and c.author_id is distinct from auth.uid()))
    and (review_id is null or exists (select 1 from public.reviews r where r.id = review_id and r.user_id is distinct from auth.uid()))
    and (reported_user_id is null or reported_user_id <> auth.uid())
  );

-- Continue Reading: a deleted reader's comments are still new comments ("<>" with NULL dropped them).
create or replace function public.continue_reading_hints()
returns table (story_id uuid, section_number int, new_comments bigint)
language sql stable security definer set search_path = public as $$
  select le.story_id, le.progress_section, count(c.id)
  from public.library_entries le
  join public.stories s on s.id = le.story_id and not s.is_hidden
  left join public.discussions d on d.story_id = le.story_id and d.kind = 'chapter' and d.section_number = le.progress_section
  left join public.discussion_follows f on f.discussion_id = d.id and f.user_id = le.user_id
  left join public.comments c on c.discussion_id = d.id
    and c.created_at > coalesce(f.last_read_at, '-infinity'::timestamptz)
    and c.author_id is distinct from le.user_id and c.deleted_at is null and not c.is_hidden
    and not exists (select 1 from public.blocks b where b.blocker_id = le.user_id and b.blocked_id = c.author_id)
  where le.user_id = auth.uid() and le.status = 'currently_reading' and le.progress_section >= 1
  group by le.story_id, le.progress_section
$$;

-- A removal request whose reader deleted their account keeps no contact details (they are personal
-- data); every other request still needs a way to reach the author.
alter table public.removal_requests
  drop constraint removal_contact,
  add constraint removal_contact check (
    (requester_id is null and contact is null) or char_length(trim(coalesce(contact, ''))) between 3 and 320
  ) not valid;

-- ---------------------------------------------------------------------------
-- delete_my_account: only ever the signed-in reader's own account
-- ---------------------------------------------------------------------------

-- With p_erase_comments, each comment is soft-deleted first (its text is erased by
-- comments_guard_update and it keeps its place in the thread, so replies still make sense) and
-- each review is deleted (nothing hangs off a review). Then the auth.users row goes, and with it:
-- profile, library and progress, custom covers, ratings, reactions, follows, blocks, notifications,
-- reports you filed, analytics events and opt-out, push tokens (on delete cascade); comments,
-- reviews, stories you added, feedback and removal requests stay without you (on delete set null).
-- Files in Storage (covers/<user id>/) cannot be removed from SQL: the app removes them first.
create or replace function public.delete_my_account(p_erase_comments boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  -- Lock the profile first: a comment being posted from another device holds a KEY SHARE lock on it
  -- (its foreign key check), so we wait for it and then erase it too, and one posted after this
  -- waits for us and then fails because the profile is gone. No comment slips past the erase.
  perform 1 from public.profiles where id = me for update;
  if p_erase_comments then
    update public.comments set deleted_at = now() where author_id = me and deleted_at is null;
    delete from public.reviews where user_id = me;
  end if;
  -- Kept without a name means without a way to reach you as well.
  update public.removal_requests set requester_id = null, contact = null where requester_id = me;
  delete from auth.users where id = me;
end $$;

revoke execute on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;
