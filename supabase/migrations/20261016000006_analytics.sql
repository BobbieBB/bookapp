-- First-party analytics (docs/DECISIONS.md, "Analytics: first-party, with an opt-out"): which features are used,
-- with no third-party SDK and no content. Named events from a fixed list, a few small non-content
-- properties, written by the app and readable only by admins.

-- Readers who switched "Help us improve the app" off: one row each, so the choice follows them across
-- devices. Its own table rather than a profiles column because every reader can read profiles.
create table public.analytics_opt_outs (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.analytics_opt_outs enable row level security;
grant select, insert, delete on public.analytics_opt_outs to authenticated;
create policy analytics_opt_outs_own on public.analytics_opt_outs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.analytics_events (
  id          bigint generated always as identity primary key,
  -- auth.users, not profiles: events like sign_up and the first app_open come before onboarding.
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  props       jsonb not null default '{}',
  app_version text check (char_length(app_version) <= 20),
  platform    text check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  constraint analytics_event_known check (name in (
    'app_open', 'sign_up', 'onboarding_done', 'story_added', 'chapter_finished', 'story_finished',
    'comment_posted', 'reaction_added', 'discover_opened', 'feedback_sent', 'language_changed', 'cover_set'
  )),
  constraint analytics_props_small check (jsonb_typeof(props) = 'object' and char_length(props::text) <= 500)
);
create index analytics_events_name_time on public.analytics_events (name, created_at);
create index analytics_events_user_time on public.analytics_events (user_id, created_at); -- the rate limit

alter table public.analytics_events enable row level security;
grant insert on public.analytics_events to authenticated;
create policy analytics_insert_own on public.analytics_events for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from public.analytics_opt_outs o where o.user_id = auth.uid()));
create policy analytics_admin_read on public.analytics_events for select to authenticated
  using (public.is_admin());
grant select on public.analytics_events to authenticated;

create constraint trigger analytics_events_rate after insert on public.analytics_events
  for each row execute function public.limit_rate('user_id', '300', '1 hour');
