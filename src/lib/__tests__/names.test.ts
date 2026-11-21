import { nameProblem } from '../names';

const typing = { left: false, tried: false };
const left = { left: true, tried: false };
const tried = { left: false, tried: true };

describe('nameProblem', () => {
  it('accepts a good name in every state', () => {
    for (const s of [typing, left, tried]) expect(nameProblem('play_review', s)).toBe(false);
  });
  it('flags a space or a Cyrillic letter while typing', () => {
    expect(nameProblem('play review', typing)).toBe(true);
    expect(nameProblem('боряна', typing)).toBe(true);
  });
  it('flags a name over 30 while typing', () => {
    expect(nameProblem('a'.repeat(31), typing)).toBe(true);
  });
  it('waits with "too short" until the reader leaves the field', () => {
    expect(nameProblem('ab', typing)).toBe(false);
    expect(nameProblem('ab', left)).toBe(true);
  });
  it('says nothing about an empty field until a try to save', () => {
    expect(nameProblem('', left)).toBe(false);
    expect(nameProblem('', tried)).toBe(true);
  });
});
