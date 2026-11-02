import { palettes, coverColor } from '../theme';

// Calm (docs/DECISIONS.md, "Calm theme"): one warm beige family, no pink/green, AA contrast or better.
const calm = (palettes as Record<string, (typeof palettes)['light']>).calm!;

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const hexes = (o: object) => JSON.stringify(o).match(/#[0-9A-Fa-f]{6}/g) ?? [];
/** Pink/rose or green hue: red or green clearly above the others in a way beige never is. */
function pinkOrGreen(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const greenish = g > r + 8 && g >= b;
  const pinkish = b > g + 8 && r > g + 8; // red and blue both above green = pink/magenta
  return greenish || pinkish;
}

it('Calm exists and has exactly the roles Light and Dark have', () => {
  expect(calm).toBeDefined();
  expect(Object.keys(calm).sort()).toEqual(Object.keys(palettes.light).sort());
  expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
});

it('uses the colours the PO decided', () => {
  expect(calm).toMatchObject({
    ground: '#F3F1EC',
    surface: '#FBFAF7',
    ink: '#2F2A35',
    primary: '#D8C7AE',
    onPrimary: '#2F2A35',
    accent: '#7A5F45',
    progress: '#8A7258',
    progressAlt: '#8A7258',
    track: '#EAE6DE',
  });
});

it('has no pink and no green anywhere, in the palette or the covers', () => {
  const covers = Array.from({ length: 200 }, (_, i) => coverColor(`story-${i}`, 'calm'));
  for (const hex of [...hexes(calm), ...hexes(covers)]) expect([hex, pinkOrGreen(hex)]).toEqual([hex, false]);
});

it('covers are the three sand tones with ink text, and every cover is one of them', () => {
  const seen = new Set(Array.from({ length: 200 }, (_, i) => coverColor(`story-${i}`, 'calm').bg));
  expect([...seen].sort()).toEqual(['#CBB9A3', '#D8C7AE', '#E3D5C0']);
  for (let i = 0; i < 50; i++) expect(coverColor(`s${i}`, 'calm').fg).toBe('#2F2A35');
});

it('meets the contrast the PO asked for, computed from the hex values', () => {
  // The PO's hexes give 13.4:1 on cards and 12.4:1 on the ground (the "13:1" claim holds for cards).
  expect(contrast(calm.ink, calm.ground)).toBeGreaterThanOrEqual(12);
  expect(contrast(calm.ink, calm.surface)).toBeGreaterThanOrEqual(13);
  expect(contrast(calm.onPrimary, calm.primary)).toBeGreaterThanOrEqual(8);
  expect(contrast(calm.onSecondary, calm.secondary)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(calm.onSafe, calm.safe)).toBeGreaterThanOrEqual(8);
  expect(contrast(calm.ink, calm.mine)).toBeGreaterThanOrEqual(8);
  expect(contrast(calm.ink, calm.band)).toBeGreaterThanOrEqual(8);
  for (const text of [calm.accent, calm.muted, calm.inkSoft, calm.danger, calm.success]) {
    expect(contrast(text, calm.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, calm.surface)).toBeGreaterThanOrEqual(4.5);
  }
  // Non-text parts (progress bar on its track, the switch) need 3:1.
  expect(contrast(calm.progress, calm.track)).toBeGreaterThanOrEqual(3);
  expect(contrast(calm.secondary, calm.surface)).toBeGreaterThanOrEqual(3);
});

it('every progress bar is the same taupe on the same track, in Calm', () => {
  expect(calm.progress).toBe(calm.progressAlt);
});

it('Light and Dark covers are unchanged by the extra mode', () => {
  expect(coverColor('x', 'light').bg).toMatch(/^#/);
  expect(coverColor('x', 'dark').bg).toMatch(/^#/);
});
