# Product decisions

Decided 12 Oct 2026. The source of truth for open questions is the Trello card
*✅ Решения преди разработка*.

## Naming and wording

- **Name: Livami** (18 Oct 2026, PO). Domain **livami.app** (Porkbun, owned by Boryana). Replaces the working name
  Fictionally (a plain English word: hard to find in search, .com taken). Checks: no app or book/reading business uses the
  name; the only registered "livami" mark (DPMA, class 9) covers phone cases and screen protectors only. Readfellow was
  dropped: readfellow.com is an active book blog for the same readers. Not registering a trademark for now.
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
  "Livami — Style Directions".
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
2. Discussions are by chapter only (15 Oct 2026). The schema can still split a book into page
   ranges, but the app doesn't offer it in v1.
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
(Currently Reading, Want to Read, Finished, DNF, On Hold for fics), reading progress,
chapter discussions with replies and reactions, The Epilogue, ratings and reviews for books, basic
discover, home screen, push notifications, report and block, feedback, analytics.
(Updated 18 Oct 2026: no Favourites in v1; no fic ratings or recs, see "Finishing a fic".)

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

## Discover: "Lively in your fandoms" (14 Oct 2026)
- Replaces "New chapters today" (WIP-only). Discover is for stories you don't read yet; new chapters of stories you DO read go to Home and notifications.
- Shows complete and WIP fics (DONE/WIP tag), ranked by discussion activity this week, in your fandoms.
- Never empty: if this week is quiet, widen to 30 days, then to all-time most-read in your fandoms, then to the curated starter list.
- Readers who don't follow WIPs: if your library is (almost) all complete fics, complete ones rank first. Later: a "Complete only" filter.

## Add a book: "Can't find it? Add it by hand" (14 Oct 2026)
- Hidden before the first search. After a search it always sits at the END of the results list (not sticky).
- Results capped at ~10 so the end is always reachable; refining the search is the main path.
- No results: the empty state makes "Add it by hand" the main (primary) button, with the search text pre-filled as the title.
- Why: manual entries create duplicates and messy data, so we offer them at the moment the person has actually looked through the results.

## Search-as-you-type (14 Oct 2026)
- Suggestions start at 3 characters, after the person pauses typing for ~350 ms (debounce). Each new keystroke cancels the previous request.
- Fewer than 3 characters: no search; show "Type at least 3 letters" only if they press Search.
- A pasted ISBN (10/13 digits) searches Open Library immediately.
- Why: Open Library is a free, volunteer-run API; we don't send a request per keystroke. 1–2 letters return thousands of useless results anyway.

## Add a fic: what happens when you paste an AO3 link (14 Oct 2026)
- We do NOT fetch anything from AO3 (no scraping, see above). The link is looked up in OUR database only.
- Found (someone already added it): fields are filled in from our record, with a line "Already on Livami, so we filled in the details. Check they look right." The person joins the same story, so no duplicate rooms.
- Not found: fields stay empty for manual entry; the work id is taken from the link so the same fic can't be added twice.
- Loading state: the lookup is one fast query (<0.5 s). Show a small spinner inside the link field with "Checking…"; the other fields stay usable. No full-screen loader.
- Invalid link: inline error under the field: "That doesn't look like an AO3 work link."
- v2: real auto-fill from AO3 only with OTW permission.

## Fic details in v1 (14 Oct 2026)
- No scraping, so v1 keeps only what a reader can enter in seconds: title, author, fandom, ship, status, chapters, rating, and AO3 Archive Warnings (fixed chips, stored in stories.warnings).
- Warnings matter for safety: readers check them before starting, so they show on the fic page.
- Full tags and summary are the author's work: we link to them ("All tags ↗") instead of copying.
- No cover images for fics (fanart is someone else's art); typographic covers instead.
- v2: if OTW gives permission, or an author claims their fic in the app, show full tags, summary and cover. Agreed with Boryana 14 Oct.

## Custom covers (14 Oct 2026)
- v1: a reader can upload their own cover for a story in their library. Only they see it (private Supabase Storage bucket, owner-only RLS). Everyone else sees the typographic cover (or the Open Library cover for books).
- No public user-uploaded covers: that would be redistributing someone else's art; reposting fanart without permission is a strong taboo in fandom, and credit is not permission. Private images also avoid App Store UGC moderation requirements.
- Copy shown before picking an image: "A cover just for you. Only you will see this cover. We never share it or show it to other readers, because the art belongs to the person who made it." Under a custom cover: "Only you see this cover".
- Reverse image search to find the artist: no (no usable free API, unreliable, and attribution still isn't permission).
- v2: public covers only from people with the right: the fic's author (claimed fic) or an artist uploading their own fanart with a link to their profile.

## Who can change a WIP fic's chapters or finish it (15 Oct 2026)
- New chapter: only a reader who has the fic, and at most their own progress + 1.
- Mark complete: only a caught-up reader (has read every published chapter).
- Undo: any caught-up reader can set it back to ongoing within 7 days, if no chapters were added since. After that, only moderators.
- Why: fast for readers, but one mistaken or hostile tap can't end a WIP for everyone. Implemented in PR #1 (review, 15 Oct).

## Finishing a fic: no ratings, no recs (15 Oct 2026)
- No star ratings for fanfiction at all (not even private). Books keep ratings on the book page.
- No recs in the app: recs, kudos and comments belong to the author on AO3. The "You finished it!" screen points readers there ("Leave kudos, a comment, or bookmark it as a rec on AO3").
- Our job is the discussion: the screen's main button is "Join The Epilogue".
- Later cleanup: the fic part of `ratings` and the `recs` feature in the schema are unused by the app.

## Visual refresh: "Modern A, bold colours" (15 Oct 2026)
- Replaces the neo-brutalist look (thick ink outlines, hard offset shadows), which felt retro.
- Keeps the bold palette: hot pink #FF4F84, mint #3DBE95, ink #1E1328; light ground #F6F8F7, white cards.
- No outlines; soft shadows (0 1px 2px + 0 12px 28px, low opacity); radii 14–22 px; round icon buttons.
- Tab bar: white, active tab = pink pill with icon + label, others icon only.
- Dark mode: ground #120C17, cards #1F1726, pink #FF6B97, mint #4FD1A6, same shapes.
- Fonts: see "Fonts: Unbounded + Sofia Sans" (18 Oct 2026).
- Code (src/theme.ts, components) still uses the old style: update in the next coding session.

## Add a story: details (15 Oct 2026, decided by the PO)
- Book discussions are by chapter. A book new to Livami asks for its chapter count (Open Library doesn't know it). No "by pages" option in v1; the schema still supports page-based parts for later.
- Every add ends with the same short step: pick "Reading now" (default) or "Want to read". Also for books already on Livami (no silent default).
## Reading progress: chapters unlock, pages are personal (15 Oct 2026, PO: option B)
- Discussions unlock only with "I finished chapter X" (and the chapter picker). That is the key to the rooms.
- Book readers may also log a page ("I'm on page 143") to see a percentage. Pages never unlock anything: we don't know which page is in which chapter, and page numbers differ between editions.
- Fanfiction: chapters only.
- Schema already supports this: `library_entries.progress_page` is personal; `progress_section` is what the spoiler wall checks.

## Language: English and Bulgarian, separate rooms per edition language (15 Oct 2026)
- The app UI comes in English and Bulgarian (phone language by default, switchable in Profile).
- Discussions are separate per edition language: a Bulgarian and an English reader of the same book are in different rooms. Translations can merge or split chapters, so "chapter 12" must mean the same thing for everyone in a room; it also keeps each room in one language.
- Books: a story = Open Library work + language (`source_id` = `<work key>#<lang>`, `stories.language`). The reader picks the edition language when adding (guessed from the title's script).
- Fics: AO3 translations are separate works with their own links, so they are separate stories already.

## Bulgarian books: where the data comes from (18 Oct 2026, PO)
- Tested 7 Bulgarian titles (new romantasy/dark academia translations, Harry Potter, Wheel of Time, Foundation). No source covers them:
  Open Library found only Harry Potter; Google Books refuses every request without our own API key, and where it has Bulgarian
  editions they are old, without covers and duplicated; Biblioman has some and not others.
- v1: search Open Library; **adding by hand is the main path for Bulgarian books**, not a fallback. A book added by hand shows up
  in search for every later reader, so the catalogue grows from readers and nobody ends up in a duplicate room.
- No data or covers from pirate sites or scraped shops: covers belong to illustrators and publishers, and it would break the
  "we respect creators" promise the app is built on.
- Next: ask Biblioman for their bibliographic data (no covers); look into bookstore affiliate feeds (legal covers + a "Buy" link);
  revisit Google Books only if readers often type in books Google has.

## Fonts: Unbounded + Sofia Sans, the same in both languages (18 Oct 2026, PO)
- Replaces Bricolage Grotesque and Atkinson Hyperlegible, which have no Cyrillic: Bulgarian titles and comments would fall back
  to the system font, even inside the English UI.
- **Unbounded** (600/700) for headings, book titles and the big moments of the UI: bold, wide, matches the bold colours.
  Short text only; it is too wide for paragraphs.
- **Sofia Sans** (400/700/800) for everything else: comments, buttons, labels. Made by a Bulgarian designer; reads well in both
  scripts. It is narrow, so body text is 15 px rather than 14.
- **Cormorant Garamond** italic stays for "moments" (The Epilogue, typographic covers); it has Cyrillic.
- One font set for both languages: no per-language switch. Replaces the "Fonts for Bulgarian" dev default (Onest) from PR #4.

## Analytics: first-party, with an opt-out (18 Oct 2026, PO)
- Confirms the PR #12 approach: our own `analytics_events` table, a fixed list of events, short non-content properties, never
  titles, comment text or other people's ids. Linked to the account so we can see whether people come back; deleted with it.
- Add a Profile switch "Help us improve the app" (on by default). When off, the app records nothing. GDPR: readers can object.
- The PO gets a small dashboard with 4–5 key numbers (weekly active readers, week-1 return, readers who reach a discussion,
  stories added by hand vs search, BG vs EN), so no SQL is needed.
- Revisit a hosted tool (e.g. PostHog EU) only if the dashboard isn't enough once there are real readers.

## Push notifications (18 Oct 2026, PO)
- v1 sends a push only for **replies to you and @mentions** (as in PR #13). Never comment text: "Maria replied in <story>, chapter 12".
- No push for new chapters of a WIP (we only learn about them when another reader marks them, so it would be late and unreliable;
  readers subscribe on AO3 instead) and none for new comments in your rooms (Home shows "N new comments").
- Ask for permission at a moment that makes sense: right after the reader posts their first comment ("Want to know when someone
  replies?" [Yes] [Not now]). The Profile switch stays. If they say "Not now", don't ask again for 30 days.
- Bundle: several replies within 10 minutes become one push ("3 new replies in chapter 12").

## Bulgarian copy style (18 Oct 2026, PO)
- Address the reader as "ти". **Gender-neutral**: rephrase so no gendered form is needed ("За първи път ли си тук?", "Никой още не
  е добавял това издание", "добави я ръчно"), never masculine-by-default and no "сам/а" slashes.
- Use the words readers actually use, even loanwords: фенфикшън, фик, kudos, **Ship**, **WIP**, **DNF**, линк (not "връзка").
- AO3 ratings and archive warnings stay **in English, exactly as on AO3**, so readers match them at a glance; only the headings are
  Bulgarian ("Рейтинг в AO3", "Предупреждения в AO3").
