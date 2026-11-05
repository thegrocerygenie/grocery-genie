import { colors } from '@/constants/theme';
import { STORE_COLORS, storeColor } from './storeColor';

describe('storeColor (PI-01 AC 9)', () => {
  it('gives a store the same colour every time, from its id alone', () => {
    const id = '6f1c2a10-0000-4000-8000-000000000001';
    expect(storeColor(id)).toBe(storeColor(id));
    expect(STORE_COLORS).toContain(storeColor(id));
  });

  it('spreads stores over the whole palette', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `store-${i}`);
    expect(new Set(ids.map(storeColor)).size).toBe(STORE_COLORS.length);
  });

  it('gives a receipt with no store grey', () => {
    expect(storeColor(null)).toBe(colors.gray);
  });
});
