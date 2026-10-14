-- LOCAL DEVELOPMENT ONLY. Sample stories, added to the library of every existing profile,
-- so Home and My Library have something to show before "add a story" exists.
-- Sign up in the app first, then run:  npm run db:seed:dev
-- Safe to run more than once.

insert into public.stories (id, kind, title, author_name, total_sections, published_sections, status, has_chapters, page_count, source, source_url, fandoms, ships) values
  ('d0000000-0000-0000-0000-000000000001', 'book',   'The Night Circus',        'Erin Morgenstern', 40,  null, 'completed', true,  null, 'manual', null, '{}', '{}'),
  ('d0000000-0000-0000-0000-000000000002', 'book',   'Piranesi',                'Susanna Clarke',   null, null, 'completed', false, 272,  'manual', null, '{}', '{}'),
  ('d0000000-0000-0000-0000-000000000003', 'book',   'The Secret History',      'Donna Tartt',      8,   null, 'completed', true,  null, 'manual', null, '{}', '{}'),
  ('d0000000-0000-0000-0000-000000000004', 'fanfic', 'All the Young Dudes',     'MsKingBean89',     188, 188,  'completed', true,  null, 'ao3', 'https://archiveofourown.org/works/10057010', '{"Harry Potter - J. K. Rowling"}', '{"Remus Lupin/Sirius Black"}'),
  ('d0000000-0000-0000-0000-000000000005', 'fanfic', 'A Sample WIP',            'some_writer',      null, 12,  'ongoing',   true,  null, 'ao3', 'https://archiveofourown.org/works/1000000001', '{"Good Omens"}', '{"Aziraphale/Crowley"}')
on conflict (id) do nothing;

insert into public.library_entries (user_id, story_id, status, progress_section, progress_page)
select p.id, e.story_id, e.status::public.library_status, e.progress_section, e.progress_page
from public.profiles p
cross join (values
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'currently_reading', 12, null::int),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'currently_reading', 0,  80),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'want_to_read',      0,  null),
  ('d0000000-0000-0000-0000-000000000004'::uuid, 'finished',          0,  null),
  ('d0000000-0000-0000-0000-000000000005'::uuid, 'currently_reading', 7,  null)
) as e(story_id, status, progress_section, progress_page)
on conflict (user_id, story_id) do nothing;

select p.username, count(le.*) as library_entries
from public.profiles p left join public.library_entries le on le.user_id = p.id
group by p.username;
