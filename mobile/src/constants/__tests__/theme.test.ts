import { colors, spacing, touchTarget } from '../theme';

describe('Design system theme', () => {
  it('provides both light and dark color palettes', () => {
    expect(colors.light.primary).toBeDefined();
    expect(colors.dark.primary).toBeDefined();
    expect(colors.light.background).toBeDefined();
    expect(colors.dark.background).toBeDefined();
  });

  it('has minimum touch target of 44pt', () => {
    expect(touchTarget.minHeight).toBeGreaterThanOrEqual(44);
    expect(touchTarget.minWidth).toBeGreaterThanOrEqual(44);
  });

  it('uses 4pt base spacing grid', () => {
    expect(spacing.xs).toBe(4);
    Object.values(spacing).forEach((value) => {
      expect(value % 4).toBe(0);
    });
  });

  it('has all required semantic color keys', () => {
    const requiredKeys = [
      'primary',
      'success',
      'warning',
      'danger',
      'background',
      'surface',
      'textPrimary',
      'textSecondary',
      'border',
    ];
    for (const key of requiredKeys) {
      expect(colors.light).toHaveProperty(key);
      expect(colors.dark).toHaveProperty(key);
    }
  });
});
