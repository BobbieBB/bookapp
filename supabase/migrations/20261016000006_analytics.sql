-- First-party analytics (docs/DECISIONS.md, Dev defaults, 16 Oct 2026): which features are used,
-- with no third-party SDK and no content. Named events from a fixed list, a few small non-content
-- properties, written by the app and readable only by admins.
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
  with check (user_id = auth.uid());
create policy analytics_admin_read on public.analytics_events for select to authenticated
  using (public.is_admin());
grant select on public.analytics_events to authenticated;

create constraint trigger analytics_events_rate after insert on public.analytics_events
  for each row execute function public.limit_rate('user_id', '300', '1 hour');
