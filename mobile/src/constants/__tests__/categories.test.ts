import { categoryPalette } from '../theme';
import {
  CATEGORY_ICON_SYMBOLS,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  DEFAULT_CUSTOM_COLOR,
  DEFAULT_CUSTOM_ICON,
  categoryMeta,
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

describe('category colour and icon (BC-05 AC 5, 7)', () => {
  it('uses the colour and icon the server sent for a custom category', () => {
    const meta = categoryMeta({ name: 'Garden', color: 'mint', icon: 'leaf' });
    expect(meta.name).toBe('Garden');
    expect(meta.color).toBe(categoryPalette.mint);
    expect(meta.symbol).toBe('leaf.fill');
  });

  it('resolves a custom category id to its own look and name, not Other', () => {
    const cats: BackendCategory[] = [{ id: 'c-1', name: 'Garden', color: 'pink', icon: 'gift' }];
    const meta = resolveCategoryMeta('c-1', cats);
    expect(meta.name).toBe('Garden');
    expect(meta.color).toBe(categoryPalette.pink);
    expect(meta.symbol).toBe('gift.fill');
  });

  it('falls back to the built-in look by name for an unknown or missing value', () => {
    expect(categoryMeta({ name: 'Groceries' })).toBe(getCategoryMetaByName('Groceries'));
    const meta = categoryMeta({ name: 'Garden', color: 'chartreuse', icon: 'rocket' });
    expect(meta.color).toBe(OTHER.color);
    expect(meta.symbol).toBe(OTHER.symbol);
  });

  it('offers the same palette and icons as the server, defaults first', () => {
    // backend/app/models/category_looks.py: CUSTOM_COLORS, CUSTOM_ICONS.
    expect(CUSTOM_CATEGORY_COLORS).toEqual([
      'indigo',
      'purple',
      'pink',
      'red',
      'orange',
      'yellow',
      'green',
      'mint',
      'teal',
      'cyan',
      'blue',
      'brown',
    ]);
    expect(CUSTOM_CATEGORY_ICONS).toEqual([
      'tag',
      'leaf',
      'gift',
      'sparkles',
      'fork-knife',
      'wineglass',
      'dumbbell',
      'pills',
      'book',
      'gamecontroller',
      'wrench',
      'airplane',
    ]);
    expect(CUSTOM_CATEGORY_COLORS[0]).toBe(DEFAULT_CUSTOM_COLOR);
    expect(CUSTOM_CATEGORY_ICONS[0]).toBe(DEFAULT_CUSTOM_ICON);
    for (const c of CUSTOM_CATEGORY_COLORS) expect(categoryPalette[c]).toBeTruthy();
    for (const i of CUSTOM_CATEGORY_ICONS) expect(CATEGORY_ICON_SYMBOLS[i]).toBeTruthy();
  });
});
