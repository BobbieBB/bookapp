-- The orphan cover-file sweep (docs/DECISIONS.md, "Dev defaults"): files stay in the covers bucket when
-- nothing points to them any more (the account was deleted, or an old cover could not be removed when
-- it was replaced). Once a day pg_cron asks the sweep-covers Edge Function to remove them; the function
-- asks orphan_cover_paths which ones, and deletes them through the Storage API (deleting storage.objects
-- rows in SQL would leave the files themselves behind).

-- Looked up once per file in the bucket.
create index custom_covers_path_idx on public.custom_covers (path);

-- One row: where the sweep-covers function lives and whether the daily sweep is on (off until the
-- project is set up for it: the function deployed and its secret in Vault).
create table public.cover_sweep_settings (
  id      boolean primary key default true check (id),
  enabled boolean not null default false,
  url     text,
  constraint cover_sweep_settings_url check (
    (url is null or url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/[^[:space:]]*$') and (url is not null or not enabled))
);
insert into public.cover_sweep_settings default values;
alter table public.cover_sweep_settings enable row level security;
-- Admins can see it; only migrations or the service role change it (the sweep secret is sent to this
-- address, so a hijacked admin account must not be able to point it elsewhere).
-- Supabase's default privileges grant every role everything on new tables: take that back first.
revoke all on public.cover_sweep_settings from public, anon, authenticated;
grant select on public.cover_sweep_settings to authenticated;
create policy cover_sweep_settings_admin_read on public.cover_sweep_settings for select to authenticated
  using (public.is_admin());

-- Ask the sweep-covers function to run, with the shared secret from Supabase Vault (`cover_sweep_secret`)
-- in the x-sweep-secret header. Does nothing while the sweep is off, without pg_net or Vault (plain
-- Postgres), or before the secret is stored. pg_net sends after the transaction commits.
create or replace function public.request_cover_sweep()
returns void language plpgsql security definer set search_path = public as $$
declare
  settings public.cover_sweep_settings;
  secret text;
begin
  select * into settings from public.cover_sweep_settings;
  if not coalesce(settings.enabled, false) or to_regproc('net.http_post') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'cover_sweep_secret';
  if secret is null then
    raise warning 'cover sweep not requested: no cover_sweep_secret in Vault';
    return;
  end if;
  -- Removing a few hundred files can take a while: give it a minute rather than pg_net's 5 s default.
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    using settings.url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-sweep-secret', secret), 60000;
end $$;
revoke execute on function public.request_cover_sweep() from public, anon, authenticated;

-- Supabase Storage only exists on Supabase (not in the plain-Postgres test database).
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- Files in the covers bucket that no custom_covers row points to, oldest first. The grace period
    -- protects a cover being uploaded right now: uploadCover (src/lib/covers.ts) stores the file first
    -- and only then the custom_covers row that points to it, so for a moment every new cover looks
    -- like an orphan. A day is far longer than that moment, and an orphan costs only storage meanwhile.
    execute $f$
      create or replace function public.orphan_cover_paths(p_older_than interval default '1 day', p_limit int default 500)
      returns setof text language sql stable security definer set search_path = '' as $$
        select o.name from storage.objects o
        where o.bucket_id = 'covers'
          and o.created_at < now() - p_older_than
          and not exists (select 1 from public.custom_covers c where c.path = o.name)
        order by o.created_at
        limit p_limit
      $$
    $f$;
    revoke execute on function public.orphan_cover_paths(interval, int) from public, anon, authenticated;
    grant execute on function public.orphan_cover_paths(interval, int) to service_role;
  end if;
end $do$;

-- Every day at 03:17 UTC (pg_cron, Supabase only).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('sweep-covers', '17 3 * * *', 'select public.request_cover_sweep()');
  end if;
end $$;
