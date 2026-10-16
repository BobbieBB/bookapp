# Data model

All tables live in the `public` schema of Supabase Postgres, with Row Level Security on every
table. Anonymous users (`anon`) have no access at all.

## Tables

| Table | What it holds | Who can read |
|---|---|---|
| `profiles` | Username, display name, what you read (books / fanfic), favourite genres and fandoms | Logged-in users |
| `stories` | One catalogue for books and fics (`kind`), metadata only, link to source | Logged-in users; hidden stories only for their creator and admins |
| `library_entries` | Your status, progress, favourite flag and visibility per story | You; others only when `visibility = public` |
| `discussions` | One per chapter (or 25-page range) per story, plus one Epilogue room | Logged-in users (existence is not a spoiler) |
| `comments` | Comments and replies (one level of `parent_id`) | Only readers who unlocked that discussion |
| `reactions` | ❤️ 😭 😱 😂 🔥 👀 on comments | Whoever can see the comment |
| `discussion_follows` | Followed / muted discussions, last read time | You |
| `blocks` | Users you blocked | You |
| `notifications` | Replies and reactions — **never the comment text** | You |
| `ratings` | 0.5–5 in half steps, **books only** (fanfiction is never rated) | Everyone |
| `reviews` | Book reviews, with a *contains spoilers* flag (no recs for fanfiction: they belong on AO3) | Everyone (spoilers blurred in the app) |
| `reports` | Reports on comments, reviews or users | Reporter and admins |
| `removal_requests` | Author opt-out requests | Requester and admins |
| `feedback` | In-app feedback | Author and admins |

## Story rules

- A **book** is one Open Library work in one **edition language** (`language`: `en` or `bg`), so
  English and Bulgarian readers have separate rooms. Its `source_id` is `<work key>#<language>`.
  Fics have no language: AO3 translations are separate works already.
- A fic's `content_rating` and `warnings` are AO3's fixed ratings and archive warnings, stored in
  AO3's own wording (the app shows translated labels).

## Progress and sections

- `library_entries.progress_section` = the last **fully finished** chapter (0 = none).
- For books without chapters (`has_chapters = false`), the app saves `progress_page` and the
  database derives `progress_section` from it (25 pages per section).
- Marking a story **Finished** sets progress to the last section.
- Progress cannot go past the number of published sections.
- *On Hold* is only allowed for fanfiction.
- A reader who has a WIP fic can raise its number of published chapters with
  `bump_published_sections(story, count)`, at most to one past their own progress (the chapter
  they are about to read); it never goes down.
- A caught-up reader (progress at the last published chapter) can mark a WIP fic complete with
  `complete_story(story)`. Any caught-up reader can undo that with `reopen_story(story)` within
  7 days (`stories.completed_at`), as long as no chapters were added since; after that only admins can.

## The spoiler wall

`can_access_section(story, kind, section)` is the single rule used everywhere:

- **chapter N** → `progress_section >= N`, or the reader Finished a story that is not ongoing;
- **epilogue** → the reader Finished the story, and the story is not ongoing (a WIP fic has no
  Epilogue yet: readers who "finished" at different chapters would spoil each other);
- hidden stories → closed for everyone except admins.

It is used by the `comments` read and insert policies, by `open_discussion()` (which creates a
discussion on first use and refuses locked ones), and indirectly by `reactions`.
`section_reader_counts(story)` returns anonymous counts ("12 readers finished chapter 4").

Discussions exist only for chapters the story has. Replies are one level deep. Deleting a comment
replaces its text with `[deleted]`; it cannot be edited or restored afterwards.

## Story edits and limits

- Fic links must be the canonical AO3 form `https://archiveofourown.org/works/<id>` (the app
  normalises pasted links), so a fic can't be added twice. Covers only from `covers.openlibrary.org`.
- Every fic says whether it is `completed` or `ongoing`.
- The type and source of a story never change. Once another reader has a story in their library,
  only admins can edit it (changing chapters or pages would move discussions and leak spoilers).
- At most 5000 chapters and 50 000 pages. `bump_published_sections` works only on ongoing fics.
- Names are unique regardless of capitals (`Alice` = `alice`).

## Blocking

When A blocks B, A no longer sees B's comments or reviews, neither can reply to or react to the
other, and neither gets notifications from the other.

## Functions the app calls

| Function | Purpose |
|---|---|
| `open_discussion(story, kind, section)` | Get or create a discussion the user has unlocked |
| `can_access_section(story, kind, section)` | Show locked / unlocked state in the UI |
| `section_reader_counts(story)` | Anonymous "N readers are here" counts |
| `bump_published_sections(story, count)` | A new WIP chapter came out |
| `complete_story(story, total?)` | A WIP fic was finished by its author |
| `reopen_story(story)` | Undo a completion (within 7 days) |

## Tests

`supabase/tests/spoiler_rules.test.sql` checks the locks (chapters, 25-page ranges, WIP fics,
The Epilogue, moving progress back), blocking, notifications, private fic ratings, admin-only fields,
anonymous access and author opt-out.
