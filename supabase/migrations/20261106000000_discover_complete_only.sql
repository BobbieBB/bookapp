-- Discover: a "Complete only" filter on "Lively in your fandoms" (docs/DECISIONS.md, 14 Oct 2026).
-- The filter narrows the candidates of every tier, so the never-empty fallback (7 days → 30 days →
-- most read → starter fandoms) widens exactly as it does without it. Off by default: the app sends it
-- from the reader's per-device choice.
drop function public.lively_in_fandoms(text[]);

create function public.lively_in_fandoms(p_fandoms text[], p_complete_only boolean default false)
returns table (id uuid, title text, author_name text, fandoms text[], status public.story_status,
               published_sections int, tier text, activity bigint, rank int)
language plpgsql stable security definer set search_path = public as $$
declare
  complete_first boolean;
  tiers text[] := array['week', 'month', 'readers', 'starter'];
  t text;
begin
  select count(*) >= 2 and avg(coalesce((s.status = 'completed')::int, 0)) >= 0.8 into complete_first
  from public.library_entries le join public.stories s on s.id = le.story_id
  where le.user_id = auth.uid() and s.kind = 'fanfic';

  foreach t in array tiers loop
    return query
      with candidates as (
        select s.* from public.visible_fics() s
        where (case when t = 'starter' then s.fandoms && (select array_agg(fandom) from public.starter_fandoms)
                    else s.fandoms && p_fandoms end)
          and (not coalesce(p_complete_only, false) or s.status = 'completed')
          and not exists (select 1 from public.library_entries le where le.story_id = s.id and le.user_id = auth.uid())
      ), activity as (
        select * from public.comments_per_story_since(now() - interval '7 days') where t = 'week'
        union all
        select * from public.comments_per_story_since(now() - interval '30 days') where t = 'month'
        union all
        select * from public.readers_per_story() where t in ('readers', 'starter')
      ), scored as (
        select c.*, coalesce(a.comments, 0) as activity
        from candidates c left join activity a on a.story_id = c.id
      )
      select s.id, s.title, s.author_name, s.fandoms, s.status, s.published_sections, t, s.activity,
        (row_number() over (order by (complete_first and s.status = 'completed') desc, s.activity desc, s.created_at desc, s.id))::int
      from scored s
      where s.activity > 0 or t = 'starter'
      order by 9
      limit 20;
    if found then
      return;
    end if;
  end loop;
end $$;

revoke execute on function public.lively_in_fandoms(text[], boolean) from public, anon;
grant execute on function public.lively_in_fandoms(text[], boolean) to authenticated;
