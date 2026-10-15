#!/usr/bin/env bash
# Two readers bumping a WIP fic's chapter count at the same time must never lower it.
# Runs after spoiler_rules.test.sql (needs its test schema and users); see run.sh.
set -euo pipefail
DB=bookapp_test
S=30000000-0000-0000-0000-000000000001
A=00000000-0000-0000-0000-0000000000e1  # on chapter 4
B=00000000-0000-0000-0000-0000000000e2  # on chapter 2
# Readers may only report the chapter after their own progress, and progress cannot pass the
# published count, so set progress at 4 and then lower the count to 2 as superuser.
psql -q -v ON_ERROR_STOP=1 -d $DB \
  -c "insert into public.stories
  (id, kind, title, author_name, published_sections, status, source, source_url, created_by)
  values ('$S', 'fanfic', 'Race', 'w', 4, 'ongoing', 'ao3', 'https://archiveofourown.org/works/300', '$A')" \
  -c "insert into public.library_entries (user_id, story_id, status, progress_section)
  values ('$A', '$S', 'currently_reading', 4), ('$B', '$S', 'currently_reading', 2)" \
  -c "update public.stories set published_sections = 2 where id = '$S'" >/dev/null
# A raises the count to 5 and holds its transaction open; B raises it to 3 meanwhile.
psql -q -v ON_ERROR_STOP=1 -d $DB -c "select test.login('$A')" -c "begin" -c "select public.bump_published_sections('$S', 5)" \
  -c "select pg_sleep(1)" -c "commit" >/dev/null &
a=$!
sleep 0.3
psql -q -v ON_ERROR_STOP=1 -d $DB -c "select test.login('$B')" -c "select public.bump_published_sections('$S', 3)" >/dev/null
wait $a
n=$(psql -tA -d $DB -c "select published_sections from public.stories where id = '$S'")
if [ "$n" != 5 ]; then echo "FAIL: concurrent chapter bumps lowered the count to $n"; exit 1; fi
echo 'ok - concurrent chapter bumps never lower the count'
