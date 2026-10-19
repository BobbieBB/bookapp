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
| `comments` | Comments and replies (one level of `parent_id`); `author_id` is empty once the author deleted their account | Only readers who unlocked that discussion |
| `reactions` | ❤️ 😭 😱 😂 🔥 👀 on comments | Whoever can see the comment |
| `discussion_follows` | Followed / muted discussions, last read time | You |
| `blocks` | Users you blocked | You |
| `notifications` | Replies, reactions and @mentions — **never the comment text** | You |
| `ratings` | 0.5–5 in half steps, **books only** (fanfiction is never rated) | Everyone |
| `reviews` | Book reviews, with a *contains spoilers* flag (no recs for fanfiction: they belong on AO3); `user_id` is empty once the author deleted their account | Everyone (spoilers blurred in the app) |
| `reports` | Reports on comments, reviews or users | Reporter and admins |
| `removal_requests` | Author opt-out requests | Requester and admins |
| `feedback` | In-app feedback | Author and admins |
| `push_tokens` | Your devices for push notifications (Expo token, language, platform) | Only you |
| `push_settings` | Whether pushes are sent and where (one row; off until set up) | Admins |
| `analytics_events` | Which features get used: an event name from a fixed list and a few short non-content properties (max 300/hour per reader) | Admins only (readers can only add their own) |
| `analytics_opt_outs` | Readers who switched "Help us improve the app" off; while there is a row, nothing is recorded for them | You only |
| `custom_covers` | Which private image is your cover for a story in your library (files in the private `covers` storage bucket, in a folder named after you) | Only you |
| `starter_fandoms` | Curated big fandoms for an empty app and readers who picked none | Logged-in users |

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

`can_access_section(story, kind, section)` is the single rule used everywhere (it delegates to the
internal `user_can_access_section(user, …)`, which also decides whether a mentioned reader is told):

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

## Live updates

`comments` is in the `supabase_realtime` publication. Realtime applies Row Level Security to inserts
and updates, so a locked chapter's comments are never pushed to a reader who hasn't reached it.
`reactions` is deliberately **not** published: Realtime does not apply RLS to deletes, and a removed
reaction's key would reveal who reacted to what in a locked room.

## Blocking

When A blocks B, A no longer sees B's comments or reviews, neither can reply to or react to the
other, and neither gets notifications from the other. A no longer sees B's reactions or notifications from B either.

## Reports, removal requests, rate limits

- You can report a comment or review only if you can see it, never your own, and only once per
  comment, review or reader.
- A removal request needs an AO3 work link and a way to reach the author, so an admin can check
  with them before hiding the fic.
- Per-user caps: 20 reports an hour, 10 feedback messages an hour, 5 removal requests a day.

## Deleting an account

`delete_my_account(erase_comments)` deletes only the signed-in reader's own account (docs/DECISIONS.md,
"Deleting an account: what happens to comments"). It deletes the `auth.users` row; every table that
holds the reader's data references it, or `profiles`, with `on delete cascade`: profile, library and
progress, custom covers, ratings, reactions, follows, blocks, notifications, reports they filed,
analytics events and opt-out, push tokens. Six keys are `on delete set null` instead, and keep the row
without its owner: `comments.author_id` and `reviews.user_id` (shown as "Deleted reader"),
`stories.created_by` (the story is shared with its other readers), `feedback.user_id`,
`removal_requests.requester_id` and `notifications.actor_id` (other readers keep their reply and
mention notifications, signed "Deleted reader"). With `erase_comments`, the reader's comments are first
soft-deleted (the text is erased, the place in the thread stays) and their reviews deleted. A comment's
author can never be changed, except to empty by that `set null`. Queries compare authors with
`is distinct from`, so a comment without an author still counts as new, can be reported and replied to.
Storage files can't be removed from SQL: the app removes the reader's `covers/<user id>/` files before
calling the function, and goes on if that fails.

## Push notifications

When a reply or @mention notification is created, `notifications_send_push` builds one Expo push per
device of the recipient (`push_messages`): who, which story and which chapter, in the device's
language, never the comment text, and a link to the room (which checks the spoiler wall again). It is
sent with `pg_net` (in batches of 100) only when `push_settings.enabled` is on, and a failed send never
loses the comment. Pushes only go out for rooms the reader can still open. Reactions don't send pushes.
Replies close together become one push (PO, 18 Oct 2026): if the reader got a push of the same kind
about the same room in the last 10 minutes, the notification waits (`notifications.pushed_at` stays
empty), and `send_held_pushes`, run every minute by `pg_cron`, sends what waited as one push
("3 new replies in <story> · Chapter 12") once those 10 minutes are up. Anything still waiting after
30 minutes is dropped without a push, so switching sending on never floods anyone.
Devices are added only through `claim_push_token` (at most 10 per reader) and forgotten with
`release_push_token`, which also works from a signed-out phone. Only migrations or the service role can
change `push_settings`.

## Functions the app calls

| Function | Purpose |
|---|---|
| `open_discussion(story, kind, section)` | Get or create a discussion the user has unlocked |
| `can_access_section(story, kind, section)` | Show locked / unlocked state in the UI |
| `section_reader_counts(story)` | Anonymous "N readers are here" counts |
| `story_rooms(story)` | The story page's rooms: every chapter (or 25-page part) and The Epilogue, with your lock state, anonymous reader counts, and comment counts only for rooms you unlocked |
| `my_notifications(limit)` | Your replies/mentions/reactions with who, story and room — no text, only rooms you can open now |
| `mark_notifications_read()` | Mark all your notifications read |
| `delete_my_account(erase_comments)` | Delete your own account for good (see Deleting an account) |
| `continue_reading_hints()` | "N new comments in chapter X" for stories you're reading (your latest finished chapter only) |
| `my_fandoms()` | Discover's YOUR FANDOMS: picked ones, then fandoms of fics in your library (max 6); the starter list if none |
| `suggested_fandoms()` | Fandoms of fics in your library you haven't picked (Profile's "+" chips) |
| `search_fandoms(text)` | All fandoms in the app matching the text, most discussed this week first |
| `lively_in_fandoms(fandoms)` | Fics you don't read yet in those fandoms: discussion this week → 30 days → most read → starter fandoms |
| `bump_published_sections(story, count)` | A new WIP chapter came out |
| `complete_story(story, total?)` | A WIP fic was finished by its author |
| `reopen_story(story)` | Undo a completion (within 7 days) |

## Tests

`supabase/tests/spoiler_rules.test.sql` checks the locks (chapters, 25-page ranges, WIP fics,
The Epilogue, moving progress back), blocking, notifications, private fic ratings, admin-only fields,
anonymous access and author opt-out.
