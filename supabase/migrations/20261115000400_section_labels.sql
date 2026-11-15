-- Books without chapters (docs/DECISIONS.md, "PO testing round on iPhone", E). A book can be split into
-- parts or acts (a play) instead of chapters: same rooms, same spoiler rules, only the word changes
-- ("Act 2", "I finished act 2"). Books with no division at all keep using pages (25-page parts, as before).
-- Fics are always in chapters.
alter table public.stories add column section_label text not null default 'chapter'
  check (section_label in ('chapter', 'part', 'act'));
alter table public.stories add constraint section_label_books_only
  check (section_label = 'chapter' or (kind = 'book' and has_chapters));
