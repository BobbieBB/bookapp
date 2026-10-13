# Fictionally *(working name)*

A social reading companion for **books and fanfiction**. Readers track what they read and talk
about it **chapter by chapter, without spoilers**: you can only enter a chapter's discussion once you
have finished that chapter, and **The Epilogue** (the whole-story room) opens only when you finish
the whole story.

> **Every fic is a gift. Cherish it. Protect it.**
> We never host, scrape or sell fanfiction. We keep a link to AO3 and send readers back there to
> leave kudos and comments. Authors are welcome here, and can ask for their work to be removed at
> any time.

## Status

Pre-MVP, sprint 1. Done: database with spoiler rules and tests, live on Supabase; app foundation
(sign up / sign in, onboarding, Home, My Library, Profile). Next: adding stories, reading progress and
chapter discussions. Planning lives on the Trello board *Book club app*.

## Stack

| Part | Choice | Why |
|---|---|---|
| Mobile app | Expo (React Native, TypeScript) | One codebase for iOS and Android |
| Backend | Supabase (Postgres, Auth, Realtime, Storage) | Spoiler rules enforced in the database with Row Level Security |
| Book data | Open Library (+ Google Books where allowed) | Free, user-initiated lookups, cached |
| Fanfic data | Manual add with a required AO3 link | No scraping; no fic text stored |

## Repository layout

```
app/                  Screens (Expo Router: one file = one screen)
  (tabs)/             Home, Library, Profile
  sign-in.tsx         Sign up / sign in
  onboarding.tsx      Username and what you read
src/
  lib/                Supabase client, auth, data helpers, types
  components/         Shared UI
  theme.ts            Colours and spacing (prototype palette)
supabase/
  migrations/         SQL migrations (schema, functions, RLS policies)
  tests/              SQL tests for spoiler rules and privacy
docs/
  DECISIONS.md        Product decisions and the reasoning behind them
  DATA_MODEL.md       Tables, spoiler logic and privacy rules explained
```

## Running the app

You need Node.js 20+ on your computer and the **Expo Go** app on your phone (App Store / Google Play).

```bash
git clone https://github.com/BobbieBB/bookapp.git
cd bookapp
npm install
npx expo install --fix     # aligns package versions with the installed Expo SDK
npx expo install expo-font @expo-google-fonts/bricolage-grotesque @expo-google-fonts/cormorant-garamond @expo-google-fonts/atkinson-hyperlegible   # once, if missing
npx expo start
```

Scan the QR code with the phone camera (iPhone) or the Expo Go app (Android). The phone and the
computer must be on the same Wi-Fi.

If Expo Go says the project uses an older SDK, upgrade it once with `npx expo install expo@latest`
followed by `npx expo install --fix`.

The app talks to the Supabase project set in `src/lib/config.ts`. Only the **publishable** key belongs
there. The database password and the secret / service_role key must never be in the app or in Git.

**Supabase setting for development:** in Authentication → Sign In / Providers → Email, turning
*Confirm email* off lets you create test accounts without clicking an email link. Turn it back on
before real users join.

## Running the database tests

Needs PostgreSQL 15+ and `psql`.

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

The script creates a throwaway database `bookapp_test`, adds a small stand-in for Supabase's `auth`
schema, applies every migration and runs `supabase/tests/spoiler_rules.test.sql`. It ends with
`ALL TESTS PASSED`. The same tests run on GitHub Actions for every push.

## Applying to Supabase

Either paste the migration file into the Supabase **SQL Editor** and press Run (how the current
project was set up), or with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
