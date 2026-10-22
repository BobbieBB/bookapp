# Livami

A social reading companion for **books and fanfiction**. Readers track what they read and talk
about it **chapter by chapter, without spoilers**: you can only enter a chapter's discussion once you
have finished that chapter, and **The Epilogue** (the whole-story room) opens only when you finish
the whole story.

> **Every fic is a gift. Cherish it. Protect it.**
> We never host, scrape or sell fanfiction. We keep a link to AO3 and send readers back there to
> leave kudos and comments. Authors are welcome here, and can ask for their work to be removed at
> any time.

## Status

MVP v1 is merged into `main` (PRs #1–#13, 16–19 Oct 2026). In the app:
- **Basics:** sign up, onboarding and the English/Bulgarian UI.
- **Stories:** adding books (Open Library) and fics (AO3 link), and the story page with reading
  progress and WIP chapters.
- **Discussions:** chapter discussions and The Epilogue with replies, reactions and live updates.
- **After reading:** "You finished it!", book ratings and reviews.
- **Home and Discover:** Home with replies and @mentions, notifications, and Discover by fandom.
- **Safety:** report, block, feedback and "Authors are welcome".
- **Extras:** private custom covers, push notifications and first-party analytics.

Before launch:
- **Hosted database:** apply the migrations to the hosted Supabase in order (everything up to
  the newest file in `supabase/migrations`).
- **Push setup:** create the EAS project and push credentials, then switch on `push_settings.enabled`
  (see PR #13). The push migration turns on `pg_net` and `pg_cron` itself; check that the
  `send-held-pushes` job shows up under Integrations → Cron.
- **Copy:** a native read of the Bulgarian copy.

Planning lives on the Trello board *Book club app*.

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
test/                 Jest environment and helpers for the app tests
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
npx expo install expo-font @expo-google-fonts/unbounded @expo-google-fonts/sofia-sans @expo-google-fonts/cormorant-garamond   # once, if missing
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

## Running everything locally (no live project, no phone needed)

Needs Docker Desktop running. The local backend applies `supabase/migrations` automatically and
needs no email confirmation.

```bash
npm install
npm run db:start            # local Supabase: API :54321, Studio http://127.0.0.1:54323
```

Create `.env.local` (git-ignored) with the `PUBLISHABLE_KEY` printed by `db:start`:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_...
```

```bash
npx expo start --web        # opens http://localhost:8081
```

Sign up in the app, then `npm run db:seed:dev` adds sample books and fics to every local user's
library. `npm run db:reset` wipes the local database and re-applies the migrations; `npm run db:stop`
shuts it down. To test on a phone with Expo Go against the local backend, use your Mac's LAN IP
instead of `127.0.0.1` in `.env.local`. Delete `.env.local` to go back to the live project.

## Running the database tests

Needs PostgreSQL 15+ and `psql`.

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

The script creates a throwaway database `bookapp_test`, adds a small stand-in for Supabase's `auth`
schema, applies every migration and runs `supabase/tests/spoiler_rules.test.sql`. It ends with
`ALL TESTS PASSED`. The same tests run on GitHub Actions for every push.

## Running the app tests

```bash
npm run db:start   # the tests need the local stack and .env.local (see above)
npm test
```

Jest with `jest-expo` and React Native Testing Library. Tests live next to the code in
`__tests__/` folders and talk to the **local** Supabase stack with real accounts they sign up
themselves. `jest.setup.ts` refuses to run against any URL that is not `127.0.0.1` / `localhost`, so
the tests can never touch the live project. `test/network.ts` can hold one request back to force
an order of replies (a slow, stale response); every reply still comes from the real server.
Open Library is never called from tests: `EXPO_PUBLIC_OPEN_LIBRARY_URL` points the search at a
small local stand-in server inside the test.

Before pushing, also run `npm run typecheck` and `npm run lint` (ESLint with `eslint-config-expo`,
no warnings allowed); CI runs all three.

## Applying to Supabase

Either paste the migration file into the Supabase **SQL Editor** and press Run (how the current
project was set up), or with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
