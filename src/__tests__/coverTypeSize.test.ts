import { coverTypeSize } from '@/components/StoryCover';

describe('coverTypeSize', () => {
  it('keeps the full size when every word fits', () => {
    expect(coverTypeSize('The Night Circus', 62, 15, 0.6, 7)).toBe(15);
  });
  it('shrinks for a long word so it is not cut in two', () => {
    const size = coverTypeSize('Obsession', 52, 13, 0.6, 7);
    expect(size).toBeLessThan(13);
    expect(9 * 0.6 * size).toBeLessThanOrEqual(52);
  });
  it('never goes under the minimum', () => {
    expect(coverTypeSize('Supercalifragilisticexpialidocious', 52, 13, 0.6, 7)).toBe(7);
  });
});
