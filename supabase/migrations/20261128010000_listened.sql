-- "I listened to it" (PO, 28 Nov 2026): a reader marks a book they listen to as an audiobook, or a fic as a podfic.
-- Personal, like the rest of the library entry (private; only its reader reads it).
alter table public.library_entries
  add column listened boolean not null default false;
comment on column public.library_entries.listened is 'The reader listens to it: audiobook (book) or podfic (fic).';
