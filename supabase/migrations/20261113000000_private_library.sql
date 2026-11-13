-- A reader's library is private by default (PO, 13 Nov 2026; docs/DECISIONS.md, "Library: private by default").
-- No screen shows other readers' libraries or lets a reader change this, so "public" only made every entry
-- readable by every signed-in reader. Counts that need other readers' entries (Discover, readers per story,
-- chapter counts) go through security definer functions and keep working.
alter table public.library_entries alter column visibility set default 'private';
update public.library_entries set visibility = 'private' where visibility <> 'private';
