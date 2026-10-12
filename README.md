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

Pre-MVP. This repository currently holds the database (schema, security rules and tests). The
mobile app comes next. Planning lives on the Trello board *Book club app* (list **MVP v1**).

## Stack

| Part | Choice | Why |
|---|---|---|
| Mobile app | Expo (React Native, TypeScript) | One codebase for iOS and Android |
| Backend | Supabase (Postgres, Auth, Realtime, Storage) | Spoiler rules enforced in the database with Row Level Security |
| Book data | Open Library (+ Google Books where allowed) | Free, user-initiated lookups, cached |
| Fanfic data | Manual add with a required AO3 link | No scraping; no fic text stored |

## Repository layout

```
supabase/
  migrations/         SQL migrations (schema, functions, RLS policies)
  tests/              SQL tests for spoiler rules and privacy
docs/
  DECISIONS.md        Product decisions and the reasoning behind them
  DATA_MODEL.md       Tables, spoiler logic and privacy rules explained
```

## Running the database tests

Needs PostgreSQL 15+ and `psql`.

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

The script creates a throwaway database `bookapp_test`, adds a small stand-in for Supabase's `auth`
schema, applies every migration and runs `supabase/tests/spoiler_rules.test.sql`. It ends with
`ALL TESTS PASSED`. The same tests run on GitHub Actions for every push.

## Applying to Supabase

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
