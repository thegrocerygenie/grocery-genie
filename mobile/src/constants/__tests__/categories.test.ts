import {
  DEFAULT_CATEGORIES,
  getCategoryMeta,
  getCategoryMetaByName,
  resolveCategoryMeta,
  type BackendCategory,
} from '../categories';

const OTHER = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];

describe('getCategoryMeta', () => {
  it('resolves a known default slug to its meta', () => {
    expect(getCategoryMeta('groceries').name).toBe('Groceries');
  });

  it('falls back to "Other" for null, undefined, or unknown ids', () => {
    expect(getCategoryMeta(null)).toBe(OTHER);
    expect(getCategoryMeta(undefined)).toBe(OTHER);
    expect(getCategoryMeta('not-a-real-slug')).toBe(OTHER);
  });
});

describe('getCategoryMetaByName', () => {
  it('matches a category name case-insensitively', () => {
    expect(getCategoryMetaByName('groceries').symbol).toBe('cart.fill');
    expect(getCategoryMetaByName('GROCERIES').symbol).toBe('cart.fill');
  });

  it('falls back to "Other" for unknown or empty names', () => {
    expect(getCategoryMetaByName('Wibble')).toBe(OTHER);
    expect(getCategoryMetaByName(null)).toBe(OTHER);
  });
});

describe('resolveCategoryMeta', () => {
  const backendCategories: BackendCategory[] = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Groceries' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Beverages' },
  ];

  it('resolves a backend UUID to the matching display meta via name', () => {
    const meta = resolveCategoryMeta('11111111-1111-1111-1111-111111111111', backendCategories);
    expect(meta.name).toBe('Groceries');
    expect(meta.symbol).toBe('cart.fill');
    expect(meta).not.toBe(OTHER);
  });

  it('still resolves a default slug even when categories are provided', () => {
    expect(resolveCategoryMeta('beverages', backendCategories).symbol).toBe('cup.and.saucer.fill');
  });

  it('resolves a default slug when no categories are provided (offline fallback)', () => {
    expect(resolveCategoryMeta('household').name).toBe('Household');
    expect(resolveCategoryMeta('household', null).name).toBe('Household');
    expect(resolveCategoryMeta('household', []).name).toBe('Household');
  });

  it('falls back to "Other" for an unknown UUID', () => {
    expect(resolveCategoryMeta('99999999-9999-9999-9999-999999999999', backendCategories)).toBe(
      OTHER,
    );
  });

  it('falls back to "Other" for a UUID when no categories lookup is available', () => {
    expect(resolveCategoryMeta('11111111-1111-1111-1111-111111111111')).toBe(OTHER);
  });

  it('falls back to "Other" for null/undefined ids', () => {
    expect(resolveCategoryMeta(null, backendCategories)).toBe(OTHER);
    expect(resolveCategoryMeta(undefined, backendCategories)).toBe(OTHER);
  });
});
