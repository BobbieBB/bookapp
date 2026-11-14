-- The 18+ self-declaration (docs/DECISIONS.md, "Explicit works: an 18+ yes/no"): a yes/no on the
-- profile, off by default, that only the reader can turn on or off again. Runs after
-- terms_acceptance.test.sql (needs test.failure_of).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

select test.logout();
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000a1801'), ('00000000-0000-0000-0000-0000000a1802');

select test.login('00000000-0000-0000-0000-0000000a1801');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000a1801', 'adult_mira');
select test.login('00000000-0000-0000-0000-0000000a1802');
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000a1802', 'adult_niko');
select test.logout();

select test.ok((select not adult_confirmed from public.profiles where username = 'adult_mira'),
  'a new profile is not confirmed as 18 or over');
select test.ok((select is_nullable = 'NO' and column_default = 'false' and data_type = 'boolean'
  from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'adult_confirmed'),
  'the flag is a yes/no that is never null and defaults to no');

-- Mira confirms, then changes her mind.
select test.login('00000000-0000-0000-0000-0000000a1801');
update public.profiles set adult_confirmed = true where id = '00000000-0000-0000-0000-0000000a1801';
select test.ok((select adult_confirmed from public.profiles where username = 'adult_mira'), 'the reader can confirm');
update public.profiles set adult_confirmed = false where id = '00000000-0000-0000-0000-0000000a1801';
select test.ok((select not adult_confirmed from public.profiles where username = 'adult_mira'), 'the reader can take it back');

-- Niko cannot change Mira's answer, either way.
select test.login('00000000-0000-0000-0000-0000000a1802');
update public.profiles set adult_confirmed = true where id = '00000000-0000-0000-0000-0000000a1801';
select test.logout();
select test.ok((select not adult_confirmed from public.profiles where username = 'adult_mira'),
  'another reader cannot confirm for someone else');
select test.login('00000000-0000-0000-0000-0000000a1801');
update public.profiles set adult_confirmed = true where id = '00000000-0000-0000-0000-0000000a1801';
select test.login('00000000-0000-0000-0000-0000000a1802');
update public.profiles set adult_confirmed = false where id = '00000000-0000-0000-0000-0000000a1801';
select test.logout();
select test.ok((select adult_confirmed from public.profiles where username = 'adult_mira'),
  'another reader cannot take it back for someone else');

-- Nor can anyone without the reader's session: not the database owner, not a server key.
select test.ok(test.failure_of($$update public.profiles set adult_confirmed = false where id = '00000000-0000-0000-0000-0000000a1801'$$)
  = 'LV001: only the reader can say they are 18 or over', 'the database owner cannot take it back');
select test.ok(test.failure_of($$update public.profiles set adult_confirmed = true where id = '00000000-0000-0000-0000-0000000a1802'$$)
  = 'LV001: only the reader can say they are 18 or over', 'the database owner cannot confirm for a reader');
select test.ok(test.failure_of($$insert into public.profiles (id, username, adult_confirmed)
  values ('00000000-0000-0000-0000-0000000a1803', 'adult_ghost', true)$$)
  = 'LV001: only the reader can say they are 18 or over', 'nobody can create a profile that is already confirmed');
select test.ok((select adult_confirmed from public.profiles where username = 'adult_mira')
  and (select not adult_confirmed from public.profiles where username = 'adult_niko'), 'both answers are unchanged');

-- Other edits by the database owner (e.g. moderation) still work.
update public.profiles set display_name = 'Mira' where id = '00000000-0000-0000-0000-0000000a1801';
select test.ok((select display_name = 'Mira' and adult_confirmed from public.profiles where username = 'adult_mira'),
  'an unrelated edit by the database owner leaves the answer alone');

\o
\echo 'ADULT CONFIRMATION RULES PASSED'
