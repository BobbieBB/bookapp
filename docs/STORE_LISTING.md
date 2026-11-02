# Store listing (draft)

**Status: proposal, not decided.** Drafted 2 Nov 2026 for the PO to review and change. Nothing here is
in the stores yet. The Bulgarian text **needs a native read** before it is used. Limits are the stores'
own (App Store: name and subtitle 30, promotional text 170, keywords 100, description 4,000 characters;
Google Play: title 30, short description 80, full description 4,000).

Follows docs/DECISIONS.md: the name and domain ("Naming and wording"), the tagline kept in English in
both languages ("Logo and tagline"), "Bulgarian copy style", and "Real fics stay out of the repo and AI
tools" (screenshots use invented works only).

Open questions for the PO are marked **PO:**.

## Both stores

| Field | Proposal |
|---|---|
| Name / title | Livami |
| Bundle id / package | `app.livami` (the livami.app domain reversed; see app.json). **PO:** confirm. It can't change after the first upload. |
| Category | App Store: **Books** (primary), **Social Networking** (secondary). Google Play: **Books & Reference**. |
| Support URL | `https://livami.app/support` (placeholder, page still to make) |
| Support e-mail | `support@livami.app` (as in "Moderation in v1") |
| Privacy policy URL | `https://livami.app/privacy` (placeholder; the policy text is drafted in a separate PR) |
| Marketing URL | `https://livami.app` (placeholder) |
| Price | Free, no in-app purchases |

## English

**Subtitle** (App Store, 30 max, 29 used)

> Spoiler-free book discussions

**Short description** (Google Play, 80 max, 75 used)

> Talk about books and fanfiction chapter by chapter, without spoilers. Ever.

**Promotional text** (App Store, 170 max)

> Read it. Find your people. Scream about it! Every chapter has its own discussion, and it only opens
> once you have read that chapter.

**Description** (both stores)

> Read it. Find your people. Scream about it!
>
> Livami is a reading companion for books and fanfiction. Track what you read and talk about it
> chapter by chapter, with readers who are exactly as far as you are.
>
> NO SPOILERS, BY DESIGN
> Every chapter has its own discussion, and you can only join it once you have finished that chapter.
> The Epilogue, the room for the whole story, spoilers and all, opens when you finish the story.
>
> BOOKS AND FICS IN ONE LIBRARY
> • Add a book from search, or by hand if it isn't there.
> • Add a fic with its AO3 link. Paste AO3's Share text and Livami fills in the details.
> • WIP? Mark new chapters as they come out; their discussions open as you catch up.
> • A private cover for any story: only you see it.
>
> FIND YOUR PEOPLE
> • Replies and @mentions on Home, with a push when someone answers you.
> • Discover what's lively in your fandoms.
> • Ratings and reviews for the books you finish.
>
> EVERY FIC IS A GIFT
> Livami never hosts, copies or sells fanfiction. We keep the link and send you back to AO3 to leave
> kudos and comments for the author. Authors are welcome here and can ask for their work to be removed
> at any time.
>
> SAFE AND YOURS
> • Report a comment or block a reader in two taps.
> • English and Bulgarian, with separate rooms for each edition language.
> • Light and Dark, following your phone.
> • Delete your account and your data from inside the app.

**PO:** the Calm theme and the Appearance setting are decided for v1 but not built yet; add "Calm" to the
themes line (and „спокойна“ in Bulgarian) once they ship. The description names AO3. That is a plain fact about how the app works, but AO3 is a third-party
name: keep it out of the keywords, and consider asking the OTW whether they mind the mention.

**Keywords** (App Store, 100 max, 99 used; comma-separated, no spaces; no third-party names such as AO3 or
BookTok, which Apple rejects in keywords)

> fanfiction,fanfic,book club,reading,spoiler free,chapters,discussion,fandom,reader,reviews,wip,ship

**What's new in 1.0**

> The first version of Livami: your library of books and fics, a discussion for every chapter, The
> Epilogue for the whole story, replies and @mentions, and Discover by fandom.

## Български (needs a native read)

**Подзаглавие** (App Store, до 30 знака, 27 използвани)

> Книги и фикове без спойлери

**Кратко описание** (Google Play, до 80 знака, 64 използвани)

> Обсъждай книги и фенфикшън глава по глава, без спойлери. Никога.

**Рекламен текст** (App Store, до 170 знака)

> Read it. Find your people. Scream about it! Всяка глава си има собствено обсъждане и то се отваря
> едва когато я прочетеш.

**Описание** (и в двата магазина)

> Read it. Find your people. Scream about it!
>
> Livami е приложение за читатели на книги и фенфикшън. Отбелязвай какво четеш и го обсъждай глава по
> глава с хора, които са стигнали точно дотам, докъдето и ти.
>
> БЕЗ СПОЙЛЕРИ, ОТ САМОТО НАЧАЛО
> Всяка глава си има собствено обсъждане и в него влизаш, когато прочетеш главата. Епилогът, мястото за
> цялата история, със спойлери, се отваря, когато я завършиш.
>
> КНИГИ И ФИКОВЕ В ЕДНА БИБЛИОТЕКА
> • Добави книга от търсенето или ръчно, ако я няма.
> • Добави фик с линка му в AO3. Постави текста от бутона Share в AO3 и Livami попълва данните.
> • WIP? Отбелязвай новите глави, когато излязат; обсъжданията им се отварят, щом стигнеш до тях.
> • Собствена корица за всяка история: вижда я само ти.
>
> НАМЕРИ СВОИТЕ ХОРА
> • Отговори и @споменавания на началния екран и известие, когато някой ти отговори.
> • Виж какво е горещо в твоите фендъми.
> • Оценки и ревюта за книгите, които завършиш.
>
> ВСЕКИ ФИК Е ПОДАРЪК
> Livami никога не съхранява, не копира и не продава фенфикшън. Пазим линка и те връщаме в AO3, за да
> оставиш kudos и коментар на автора. Авторите са добре дошли и могат по всяко време да поискат творбата
> им да бъде премахната.
>
> СИГУРНО И ТВОЕ
> • Подай сигнал за коментар или блокирай читател с две докосвания.
> • На английски и български, с отделни обсъждания за всеки език на изданието.
> • Светла и тъмна тема, според телефона.
> • Изтрий профила и данните си направо от приложението.

**Ключови думи** (App Store, до 100 знака, 94 използвани)

> фенфикшън,фик,книги,четене,читатели,без спойлери,глави,обсъждане,фендъм,ревюта,книжен клуб,wip

**Какво ново в 1.0**

> Първата версия на Livami: библиотека с книги и фикове, обсъждане за всяка глава, Епилогът за цялата
> история, отговори и @споменавания и „Горещо в твоите фендъми“.

## Age rating

Answer the questionnaires (App Store Connect age rating, Google Play IARC) from what the app does:

- **User content: yes.** Readers write comments, replies and reviews that other readers see. Reporting,
  blocking are in the app now; the admins' Moderation screen (PR #23) and the e-mail to the PO about every
  report (PR #24) must be merged and switched on before submitting, so action is possible within 24 hours.
- **Apple Guideline 1.2** (user content) also asks for terms the reader agrees to, with no tolerance for
  objectionable content or abusive users. **PO:** the terms of use need that clause and a place in sign-up
  where the reader accepts them; neither exists yet.
- **Mature themes:** Livami shows no fic text, but it shows fic titles, AO3 ratings (including *Explicit*)
  and archive warnings, and readers discuss the stories. **Proposal: 13+ on the App Store, Teen on Google
  Play**, and 16+ / Mature if the PO wants to be careful about Explicit fics in discussions.
- **Unrestricted web access: no** (links open only AO3 work pages, in the browser).
- **Account deletion in the app: yes** (Apple 5.1.1(v)).
- No ads, no purchases, no location, no camera. Analytics are first-party with an opt-out (DECISIONS,
  "Analytics"): declare them in Apple's privacy labels and Google's Data safety form, linked to the account.

## Screenshots to take

Sizes: App Store needs iPhone 6.9" (1320 × 2868); the app is iPhone-only (`supportsTablet: false`), so no
iPad set. Google Play needs at least 2 phone screenshots (1080 × 1920 or larger) and a **feature graphic
(1024 × 500)**. One set in English, one in Bulgarian.

Use **invented** books, fics, authors and fandoms only, and no real book covers (the typographic cover or
a cover made for the shot). Readers in the shots are test accounts with invented names.

1. **Story page** with chapter discussions: a few open, the next locked ("Finish chapter 13 to join").
2. **A chapter discussion** with replies and reactions.
3. **The Epilogue** locked, with its subtitle "The whole story, spoilers and all. Opens when you finish."
4. **"You finished it!"** with a rating.
5. **Home** with replies and @mentions.
6. **Library** with books and fics, one of them a WIP fic you are caught up on.
7. **Discover**: "Lively in your fandoms".
8. **Add a fic** from AO3's Share text, details filled in.
9. **A private custom cover** with "Only you see this cover".
10. **Profile** with the language switch, and one shot in Dark (and in Calm once it ships).
