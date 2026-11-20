# Google Play Console: what to fill in

Answers for Livami's Play Console forms, taken from the Privacy Policy (livami.app/privacy) and the
app as it is on 20 Nov 2026. If the app changes (new data, ads, payments), update this file and the
forms together. The PO fills the forms in Play Console herself.

## Create app

| Field | Answer |
|---|---|
| App name | Livami |
| Default language | English (United States) — Bulgarian is added as a translation of the store listing |
| App or game | App |
| Free or paid | Free (cannot be changed to paid later) |
| Declarations | The PO reads and ticks them herself |

## App content (Dashboard → "Set up your app")

### Privacy policy
`https://livami.app/privacy/`

### App access
**All or some functionality is restricted** → add instructions:

- Name: `Reviewer account`
- Username / password: a test account the PO creates for Google's reviewers (its own e-mail address,
  not her personal account; a username such as `play_review`; a profile already set up). The PO types
  the password into Play Console herself — never into chats, issues or screenshots.
- Other information: "Sign in with the e-mail and password above. The account is 18+ confirmed and has
  a book and a fic in its library with a few comments, so the discussion rooms can be seen."

### Ads
**No**, the app does not contain ads.

### Content rating (IARC questionnaire)
- Category: **Social / Communication (user-generated content)** — the closest fit; Livami is a
  reading community with comments.
- Violence, sexuality, language, controlled substances, gambling: **No** (the app itself shows none;
  readers' comments are moderated; works rated Explicit on AO3 are listed only by title and tags, behind
  an 18+ confirmation, and their text is never in the app).
- Users can interact or exchange content: **Yes** (comments, replies, reviews).
- Shares the user's location: **No**. Digital purchases: **No**.
- Expect a rating around **Teen / PEGI 12–16**. If the questionnaire offers "unrestricted internet /
  web browser": **No** (an AO3 link opens in the phone's own browser).

### Target audience and content
- Age groups: **16–17** and **18 and over** (terms: at least 16).
- Appeal to children: **No**.

### News app
**No**.

### Health, financial features, government app, COVID-19
**No** to all.

### Data safety

General questions:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data encrypted in transit? | **Yes** (HTTPS everywhere) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in the app, and at `https://livami.app/delete-account/` |

Data types — all **collected**, **not shared** (our processors Supabase, Expo and Resend act for us, which
Google does not count as sharing), **processed ephemerally: No**:

| Category → type | Required or optional | Purposes |
|---|---|---|
| Personal info → **Email address** | Required | Account management; App functionality; Developer communications (password reset, replies to feedback if asked) |
| Personal info → **User IDs** (account ID and the reader's Name) | Required | Account management; App functionality |
| Photos and videos → **Photos** (custom cover, chosen by the reader) | Optional | App functionality |
| App activity → **App interactions** (opt-in analytics) | Optional | Analytics |
| App activity → **Other user-generated content** (comments, reviews, ratings, stories added, reports, feedback) | Required | App functionality |
| App activity → **Other actions** (library, reading progress) | Required | App functionality |
| Device or other IDs → **Device or other IDs** (push token, only with notifications on) | Optional | App functionality |

Not collected: name (real), phone, address, location, contacts, messages (SMS/e-mail), files, calendar,
health, financial info, web browsing, installed apps, crash logs, diagnostics, audio.

Search text for books: sent to Open Library from the phone and to Google Books through our server,
never stored by us. This is **In-app search history → not collected** (processed only to answer the
search). If Google's reviewers ask, point to Privacy Policy section 5.

### Delete account URL
`https://livami.app/delete-account/`

## Store listing

| Field | English | Bulgarian |
|---|---|---|
| App name | Livami | Livami |
| Short description (≤80) | Talk books and fanfics chapter by chapter, without spoilers. | Обсъждай книги и фикшъни глава по глава, без спойлери. |

**Full description (English)**

> Livami is a place to talk about the books and fanfics you read, chapter by chapter, without spoilers.
>
> Every chapter has its own discussion room. A room opens only when you finish that chapter, so you
> only ever see comments up to where you are. Finished chapter 12? Chapter 12's room opens. Chapter 13's
> waits for you.
>
> • Add books from Open Library and Google Books, or fanfics by pasting their AO3 link
> • Track your reading: chapter, pages, reading, finished, on hold
> • Discuss each chapter, reply, react and mention other readers
> • Rate and review books, with a "contains spoilers" flag
> • Find what readers are into in your fandoms
> • In English and Bulgarian
>
> No ads, no selling of your data. Analytics are off unless you switch them on.
> Livami does not host fanfiction: fics stay on AO3, we keep their details and a link.

**Full description (Bulgarian)**

> Livami е място да говориш за книгите и фикшъните, които четеш, глава по глава и без спойлери.
>
> Всяка глава има своя стая за обсъждане. Стаята се отваря, чак когато завършиш главата, така че
> виждаш коментари само до мястото, до което си стигнал. Завърши глава 12 и се отваря стаята на глава 12.
> Тази на глава 13 те чака.
>
> • Добавяй книги от Open Library и Google Books, а фикшъни с линк от AO3
> • Следи четенето си: глава, страници, чета, завърших, на пауза
> • Обсъждай всяка глава, отговаряй, реагирай и споменавай други читатели
> • Оценявай и пиши ревюта за книги, с отметка „съдържа спойлери“
> • Виж какво четат другите в твоите фендъми
> • На български и английски
>
> Без реклами и без продаване на данните ти. Анализът е изключен, освен ако не го включиш.
> Livami не съхранява фикшъни: те остават в AO3, а ние пазим данните за тях и линк.

| Field | Answer |
|---|---|
| App category | Books & Reference |
| Tags | Reading, Books, Social |
| Contact e-mail | support@livami.app |
| Website | https://livami.app |
| App icon | 512×512 PNG from `assets/icon.png` |
| Feature graphic | 1024×500, one for English and one for Bulgarian |
| Phone screenshots | 2–8, from a phone (portrait). PO takes them; no real fics or readers' content in them — use the invented test works |

## Closed testing (needed before production, for new personal accounts)

1. Testing → Closed testing → Create track (or use "Alpha").
2. Testers: the e-mail list "Livami тестери" (Tester groups). At least 12 testers, aim for 15–20.
3. Create release → upload the `.aab` from `eas build -p android --profile production`.
4. Release notes: "First test version."
5. Send testers the opt-in link from the track's Testers tab.
6. After **14 days** with at least 12 testers opted in: Dashboard → Apply for production (questions
   about the test: how testers were found, what feedback came in, what changed).
