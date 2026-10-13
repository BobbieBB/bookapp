# Product decisions

Decided 12 Oct 2026. The source of truth for open questions is the Trello card
*✅ Решения преди разработка*.

## Naming and wording

- **Working name:** Fictionally. Final name still open (fictionally.com is taken; check trademarks
  before launch).
- **Finished** instead of "Read" — clearer about what unlocks discussions.
- **Chapter Discussion** instead of "Chapter Chat".
- **The Epilogue** for the whole-story room, one name for books and fics, always shown with the
  subtitle *"The whole story, spoilers and all. Opens when you finish."* so it is not mistaken for
  a final chapter called "Epilogue". (We avoid "Reflection Room", which
  Fable uses).

## Visual design (14 Oct 2026)

- **Ink & Bloom**: light mode "Fresh Ink" (hot pink + fresh mint, night-violet ink outlines and hard
  "sticker" shadows), dark mode "Midnight Bloom" (neon rose + electric mint on violet night).
  Same colour roles in both; tokens live in `src/theme.ts`. Design file: claude.ai artifact
  "Fictionally — Style Directions".
- Type: Bricolage Grotesque (UI headings), Cormorant Garamond italic (moments: chapter titles,
  The Epilogue), Atkinson Hyperlegible (reading text).
- The discussion comes first: "I finished chapter N+1" is a small pill in the header plus a quiet
  row at the end of the comments, never the main button on the screen.
- No content rating badge inside a chapter discussion; the rating belongs on the story page.
- Replies are one level deep; long threads show the last 2 replies + "View N earlier replies".
- Covers: books use the real cover from Open Library when there is one; otherwise, and for every
  fic, a typographic cover (title + author), because fanart is someone else's work. Cover colour comes from the story id (6 brand
  colours), the same everywhere for everyone; not by fandom.
- No Liquid Glass: a plain tab bar keeps one consistent character.

## Profiles

- **One name per reader** (13 Oct 2026): a single unique *Name* (letters, numbers, `_`), shown
  everywhere. No separate display name, because two name fields confused people. Uniqueness is
  needed for blocking, reporting and future @mentions. The `display_name` column stays unused in
  case names with spaces are wanted later.

## Spoiler Safe Mode

1. A reader can open the discussion for chapter *N* only after fully finishing chapter *N*.
   Progress means *the last fully finished chapter*.
2. Books without chapters are split into **25-page ranges**; range *N* covers pages
   `25(N-1)+1 … 25N`.
3. The Epilogue opens only when the story is marked **Finished**.
4. There is **no manual unlock** and no "show spoilers anyway" switch.
5. Direct links and notifications follow the same rule. Notifications never contain comment text.
6. Moving progress back locks the later chapters again.
7. For **ongoing (WIP) fanfiction**, "Finished" does not unlock chapters published later; each new
   chapter opens once the reader has read it.
8. All of this is enforced in the database (`can_access_section`), not only in the app.

## Fandom etiquette by design

- Books and fanfiction live in **separate sections**, never mixed in one feed.
- **No public star ratings for fanfiction.** Readers can rate a fic privately and write a public
  *rec*. Books get public ratings (half stars) and reviews.
- Every fic **must link to AO3**; we store metadata only, never the text. No scraping.
  Auto-filling fic details will only be added if the OTW agrees.
- Remind readers to leave **kudos and comments on AO3**.
- **Authors can opt out**: removal requests hide the fic everywhere in the app.
- Everything is behind login and not indexed by search engines.
- Fanfiction is never sold or paywalled.
- An *Authors are welcome* page explains all of the above.

## Scope of MVP v1

In: sign up and onboarding, add a story (book search / manual fanfic), full library with statuses
(Currently Reading, Want to Read, Finished, DNF, On Hold for fics), favourites, reading progress,
chapter discussions with replies and reactions, The Epilogue, ratings and reviews/recs, basic
discover, home screen, push notifications, report and block, feedback, analytics.

Later (v1.1+): an in-app reader for the user's own EPUB/PDF files, friends and private groups,
fic auto-fill from AO3 (only with OTW permission).

## Data sources

- **Open Library:** lookups only when a user searches, results cached in `stories`, requests carry a
  `User-Agent` with the app name and contact email, at most ~3 requests/second. At scale, switch to
  the Open Library data dumps.
- **Google Books:** optional; their terms forbid charging users for the data without permission.

## Home: replies to you, not all discussions (14 Oct 2026)
- Home shows only what needs you: replies and @mentions, max 3, with "See all" leading to notifications. Section title: "REPLIES TO YOU".
- All discussions live inside the book/fic, chapter by chapter. The Continue Reading card carries a quiet "N new comments in chapter X" hint.
- Spoiler Safe applies: Home never surfaces anything from a chapter you haven't reached.
- Why: signal over noise. The start screen lists only things that ask for an action from you.

## Discover: which fandoms to show (14 Oct 2026)
- AO3 alone has tens of thousands of fandom tags, so there is no fixed list.
- Discover shows "YOUR FANDOMS" first: the ones picked in onboarding/profile plus the fandoms of fics in your library (max ~6 chips).
- "All fandoms" opens a search over fandoms that exist in our app, sorted by activity (discussion in the last 7 days).
- Before launch the app is empty, so we seed a short curated list of big fandoms for people who haven't picked any.
- Where fandoms get added: no extra onboarding step (keep onboarding short). When you add a fic, its fandom is suggested in Profile > Your fandoms (dashed chip with +); one tap adds it. You can also add/remove via Edit. Stored in profiles.favourite_fandoms.
