import { authorized, chunks, removeInChunks } from '../../../supabase/functions/sweep-covers/sweep';

// The sweep-covers Edge Function's own logic (the Deno entry point only wires it to Supabase).

describe('authorized', () => {
  it('only the exact secret gets in', () => {
    expect(authorized('s3cret', 's3cret')).toBe(true);
    expect(authorized('s3cret!', 's3cret')).toBe(false);
    expect(authorized('s3cre', 's3cret')).toBe(false);
    expect(authorized('', 's3cret')).toBe(false);
    expect(authorized(null, 's3cret')).toBe(false);
  });

  it('nobody gets in while no secret is set', () => {
    expect(authorized('', '')).toBe(false);
    expect(authorized(null, '')).toBe(false);
    expect(authorized(null, undefined)).toBe(false);
  });
});

describe('chunks', () => {
  it('splits into groups of at most the given size, in order', () => {
    const paths = Array.from({ length: 250 }, (_, i) => `p${i}`);
    const groups = chunks(paths, 100);
    expect(groups.map((g) => g.length)).toEqual([100, 100, 50]);
    expect(groups.flat()).toEqual(paths);
  });

  it('nothing to split, no groups', () => {
    expect(chunks([], 100)).toEqual([]);
  });
});

describe('removeInChunks', () => {
  it('removes 100 at a time and counts what was removed and what failed', async () => {
    const paths = Array.from({ length: 230 }, (_, i) => `u/${i}.jpg`);
    const calls: string[][] = [];
    const result = await removeInChunks(paths, async (group) => {
      calls.push(group);
      if (calls.length === 2) return { removed: 0, error: 'storage is down' };
      return { removed: group.length, error: null };
    });
    expect(calls.map((c) => c.length)).toEqual([100, 100, 30]);
    expect(result).toEqual({ removed: 130, failed: 100 });
  });

  it('a chunk that throws counts as failed, and the rest still go', async () => {
    let call = 0;
    const result = await removeInChunks(['a', 'b'], async (group) => {
      call++;
      if (call === 1) throw new Error('network');
      return { removed: group.length, error: null };
    }, 1);
    expect(result).toEqual({ removed: 1, failed: 1 });
  });
});
