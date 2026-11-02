-- Accepting the terms and confirming your age (docs/DECISIONS.md, "Terms and age: ticked at sign-up",
-- user decision 2 Nov 2026). The texts live on the web; the profile keeps which version the reader
-- accepted, when, and a yes to "I'm at least {MIN_AGE}" — never a birth date.

alter table public.profiles
  add column terms_version     text check (char_length(terms_version) between 1 and 40),
  add column terms_accepted_at timestamptz,
  add column age_confirmed     boolean not null default false;

-- The app sets terms_version and age_confirmed; the time is the server's. Errors use their own
-- SQLSTATE (LV001) so the app can tell them from other failures. A backfill must set both columns
-- together: the rules hold for every role, the owner and service_role included.
create or replace function public.profiles_guard_terms()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.terms_version is not null and new.terms_version is null then
      raise exception 'accepting the terms cannot be withdrawn: delete the account instead' using errcode = 'LV001';
    end if;
    -- Versions are date-prefixed (src/lib/legal.ts), so a newer one sorts later: going back to an older
    -- or invented earlier version would only re-stamp the time.
    if new.terms_version collate "C" < old.terms_version collate "C" then
      raise exception 'an older version of the terms cannot replace a newer one' using errcode = 'LV001';
    end if;
    if old.age_confirmed and not new.age_confirmed then
      raise exception 'the age confirmation cannot be withdrawn' using errcode = 'LV001';
    end if;
  end if;
  if new.terms_version is not null and not new.age_confirmed then
    raise exception 'accepting the terms needs the age confirmation' using errcode = 'LV001';
  end if;
  -- Stamped only when a (new) version is accepted; otherwise nobody can move it, not even the owner.
  if tg_op = 'INSERT' then
    new.terms_accepted_at := case when new.terms_version is null then null else now() end;
  elsif new.terms_version is distinct from old.terms_version then
    new.terms_accepted_at := now();
  else
    new.terms_accepted_at := old.terms_accepted_at;
  end if;
  return new;
end $$;

create trigger profiles_guard_terms before insert or update on public.profiles
  for each row execute function public.profiles_guard_terms();

-- Readers accept (or re-accept a newer version) themselves; the time is never theirs to write.
grant update (terms_version, age_confirmed) on public.profiles to authenticated;
