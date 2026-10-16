-- Story metadata rules and book-only ratings (docs/DECISIONS.md, 14–15 Oct 2026).

-- ---------------------------------------------------------------------------
-- Edition language: discussions are separate per edition language, so a book always has one.
-- Books from before this rule are English (the app had no way to add other editions yet), and an
-- Open Library story id names its edition: '<work key>#<language>'.
-- ---------------------------------------------------------------------------
update public.stories set language = 'en' where kind = 'book' and language is null;
update public.stories set source_id = source_id || '#' || language
  where source = 'open_library' and source_id is not null and source_id not like '%#%';

alter table public.stories
  add constraint language_supported check (language in ('en', 'bg')),
  add constraint books_have_language check (kind <> 'book' or language is not null),
  add constraint open_library_edition_id check (
    source <> 'open_library' or source_id is null or source_id like '%#' || language
  );

-- ---------------------------------------------------------------------------
-- Fic details: AO3's fixed ratings and archive warnings (stored in AO3's own wording).
-- ---------------------------------------------------------------------------
alter table public.stories
  add constraint ao3_rating check (
    content_rating is null
    or content_rating in ('General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated')
  ),
  add constraint ao3_warnings check (
    warnings <@ array[
      'No Archive Warnings Apply',
      'Creator Chose Not To Use Archive Warnings',
      'Graphic Depictions Of Violence',
      'Major Character Death',
      'Rape/Non-Con',
      'Underage Sex'
    ]::text[]
  );

-- ---------------------------------------------------------------------------
-- No ratings or recs for fanfiction (15 Oct 2026): recs, kudos and comments belong to the author on
-- AO3. Existing fic ratings stay private to their rater; no new ones can be made.
-- ---------------------------------------------------------------------------
drop policy ratings_write_own on public.ratings;
create policy ratings_delete_own on public.ratings for delete to authenticated
  using (user_id = auth.uid());
create policy ratings_insert_books on public.ratings for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user() and public.story_kind_of(story_id) = 'book');
create policy ratings_update_books on public.ratings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_active_user() and public.story_kind_of(story_id) = 'book');

drop policy reviews_write_own on public.reviews;
create policy reviews_write_own on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and not is_hidden and public.is_active_user() and public.story_kind_of(story_id) = 'book');

drop policy reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (user_id = auth.uid() and not is_hidden and public.is_active_user() and public.story_kind_of(story_id) = 'book')
  );
