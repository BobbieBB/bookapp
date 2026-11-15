-- Analytics become opt-in (docs/DECISIONS.md, "Analytics: opt-in", 14 Nov 2026). Under ePrivacy art. 5(3) and
-- EDPB Guidelines 2/2023, recording which features a reader uses on their device needs their consent, so the
-- choice is now stored positively: one row per reader who said yes ("Help us improve the app"), and nothing is
-- recorded for anyone without one. Existing readers start without consent, whatever they chose before.

-- Its own table rather than a profiles column: only the reader may see whether they said yes.
create table public.analytics_consents (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.analytics_consents enable row level security;
grant select, insert, delete on public.analytics_consents to authenticated;
create policy analytics_consents_own on public.analytics_consents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy analytics_insert_own on public.analytics_events;
create policy analytics_insert_own on public.analytics_events for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.analytics_consents c where c.user_id = auth.uid()));

-- The opt-outs no longer mean anything (no consent already records nothing), so they go rather than linger as
-- data kept without a purpose. App builds from before this change read that table: their switch shows an error
-- and their events are refused, so they record nothing.
drop table public.analytics_opt_outs;
