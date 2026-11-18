import { serviceClient } from '../../../test/service';
import { ficsWithShip, searchShips, shipForNickname } from '../discover';
import { addToLibrary, createFic } from '../stories';
import { supabase } from '../supabase';

// Discover: search by ship, with nicknames (Trello "Discover: търсене по ship"). Real readers on local
// Supabase; character names carry the run id so other tests' fics don't interfere.
const password = 'test-password-1234';
const run = Date.now().toString(36);
const A = `Alpha${run}`;
const B = `Beta${run}`;
const NICK = `testship${run}`;
type User = { email: string; id: string };

async function signUp(name: string): Promise<User> {
  const email = `${name}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) throw error ?? new Error(`could not sign up ${email}`);
  await supabase.from('profiles').insert({ id: data.user.id, username: `${name}_${run}` }).throwOnError();
  await supabase.auth.signOut();
  return { email, id: data.user.id };
}

async function as(u: User) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password });
  if (error) throw error;
}

let n = 0;
const fic = (title: string, ship: string, complete = true, link = true) =>
  createFic({
    ao3Link: link ? `https://archiveofourown.org/works/${(parseInt(run, 36) % 1_000_000_000) + 2100 + n++}` : null,
    title,
    author: 'w',
    fandom: `Ship Fandom ${run}`,
    ship,
    complete,
    chapters: 2,
    rating: 'Not Rated',
    warnings: [],
  });

let reader: User;
let popularId: string;
let quietId: string;
let wipId: string;
let mineId: string;

beforeAll(async () => {
  await serviceClient().from('ship_nicknames').insert({ nickname: NICK, characters: [A, B] }).throwOnError();
  reader = await signUp('shipper');
  const writer = await signUp('shipwriter');
  await as(writer);
  // The same pair tagged in both orders: both are found by the nickname.
  const popular = await fic('Popular pairing', `${A}/${B}`);
  popularId = popular.id;
  await addToLibrary(popular.id, 'finished');
  quietId = (await fic('Quiet pairing', `${B}/${A}`)).id;
  wipId = (await fic('Still writing', `${A}/${B}`, false)).id;
  await fic('No link pairing', `${A}/${B}`, true, false); // not in Discover (decision G)
  await as(reader);
  mineId = (await fic('Already mine', `${A}/${B}`)).id;
  await addToLibrary(mineId, 'currently_reading');
});

afterAll(async () => {
  await serviceClient().from('ship_nicknames').delete().eq('nickname', NICK);
  await supabase.auth.signOut();
});

it('a nickname finds the ship in any order, and says which nickname matched', async () => {
  await as(reader);
  const hits = await searchShips(NICK.slice(0, 12));
  expect(hits.map((h) => [h.ship, h.nickname, h.stories])).toEqual(
    expect.arrayContaining([
      [`${A}/${B}`, NICK, 2], // popular and WIP, as tapping it lists them; not mine, not the one without a link
      [`${B}/${A}`, NICK, 1],
    ]),
  );
});

it("a character's name finds the ship too", async () => {
  await as(reader);
  const hits = await searchShips(B.toLowerCase());
  expect(hits.map((h) => h.ship).sort()).toEqual([`${A}/${B}`, `${B}/${A}`]);
  expect(hits.every((h) => h.nickname === null)).toBe(true);
});

it('fics with a ship: ones you do not read yet, most read first; Complete only leaves out WIPs', async () => {
  await as(reader);
  const all = await ficsWithShip(`${A}/${B}`);
  expect(all.map((s) => s.id)).toEqual([popularId, wipId]);
  expect(all[0].tier).toBe('readers');
  expect((await ficsWithShip(`${A}/${B}`, true)).map((s) => s.id)).toEqual([popularId]);
  expect((await ficsWithShip(`${B}/${A}`)).map((s) => s.id)).toEqual([quietId]);
});

it('a nickname typed when adding a fic becomes the tag readers already use', async () => {
  await as(reader);
  expect(await shipForNickname(NICK.toUpperCase())).toBe(`${A}/${B}`); // used by 3 fics, the other order by 1
  expect(await shipForNickname('not a nickname at all')).toBeNull();
});

it('a nickname with several rows: the most used tag over all of them; never a made-up tag', async () => {
  const nick = `twoway${run}`.slice(0, 40);
  const [c1, c2, c3] = [`Ceta${run}`, `Kyla${run}`, `Bena${run}`];
  await serviceClient()
    .from('ship_nicknames')
    .insert([
      { nickname: nick, characters: [c1, c2] },
      { nickname: nick, characters: [c1, c3] },
    ])
    .throwOnError();
  try {
    await as(reader);
    expect(await shipForNickname(nick)).toBeNull(); // no fic uses these characters yet: nothing is invented
    await fic('One with Kyla', `${c1}/${c2}`);
    await fic('One with Bena', `${c3}/${c1}`);
    await fic('Another with Bena', `${c3}/${c1}`);
    await fic('Just friends', `${c1} & ${c2}`); // a friendship tag is never a nickname's ship
    expect(await shipForNickname(nick)).toBe(`${c3}/${c1}`);
    expect((await searchShips(nick)).map((h) => h.ship).sort()).toEqual([`${c1}/${c2}`, `${c3}/${c1}`].sort());
  } finally {
    await serviceClient().from('ship_nicknames').delete().eq('nickname', nick);
  }
});

it('the built-in list knows the popular nicknames', async () => {
  await as(reader);
  const { data } = await supabase.from('ship_nicknames').select('nickname').in('nickname', ['dramione', 'drarry', 'destiel', 'reylo']);
  expect(new Set(data!.map((r) => r.nickname))).toEqual(new Set(['dramione', 'drarry', 'destiel', 'reylo']));
});
