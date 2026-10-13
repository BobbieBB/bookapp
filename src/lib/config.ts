// Public connection settings for Supabase.
// The publishable key is meant to ship inside the app: what each user can see is
// decided by the Row Level Security rules in supabase/migrations, not by this key.
// NEVER put the secret / service_role key or the database password in the app.
//
// To point the app at another project, create a .env file with
// EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (see .env.example).

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://dfgqkyyelttwflupoyun.supabase.co';

export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_1p5aIfgobmFhCK4j9AZu_Q_5YRjPlt-';

export const APP_NAME = 'Fictionally'; // working name, see docs/DECISIONS.md
