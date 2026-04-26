import { colors, radii, spacing, touchTarget, type, springs } from '../theme';

describe('Design system theme (handoff v2)', () => {
  it('exposes iOS system surface tokens', () => {
    expect(colors.iosBg).toBeDefined();
    expect(colors.iosBg2).toBe('#FFFFFF');
    expect(colors.iosFill3).toBeDefined();
    expect(colors.iosSeparator).toBeDefined();
    expect(colors.iosLabel).toBe('#000000');
  });

  it('exposes brand tint and pressed variant', () => {
    expect(colors.tint).toBe('#1F7A4A');
    expect(colors.tintPressed).toBe('#195F3A');
  });

  it('exposes the eight category colors', () => {
    const expected = [
      'groceries',
      'household',
      'personalCare',
      'beverages',
      'snacks',
      'babyKids',
      'pet',
      'other',
    ];
    for (const key of expected) {
      expect(colors.cat).toHaveProperty(key);
    }
  });

  it('uses 4pt base spacing grid', () => {
    expect(spacing.xs).toBe(4);
    Object.values(spacing).forEach((value) => {
      expect(value % 4).toBe(0);
    });
  });

  it('has minimum 44pt touch target', () => {
    expect(touchTarget.minHeight).toBeGreaterThanOrEqual(44);
    expect(touchTarget.minWidth).toBeGreaterThanOrEqual(44);
  });

  it('exposes Apple Dynamic Type roles', () => {
    expect(type.largeTitle.fontSize).toBe(34);
    expect(type.body.fontSize).toBe(17);
    expect(type.headline.fontWeight).toBe('600');
  });

  it('exposes radii presets', () => {
    expect(radii.card).toBe(10);
    expect(radii.button).toBe(12);
    expect(radii.cap).toBeGreaterThan(1000);
  });

  it('exposes Activity-ring spring physics', () => {
    expect(springs.ring.damping).toBe(18);
    expect(springs.ring.stiffness).toBe(90);
  });
});
