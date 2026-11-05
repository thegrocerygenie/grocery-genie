import type { ColorValue } from 'react-native';

import { categoryPalette, colors, type CategoryColorName } from './theme';

export interface CategoryMeta {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly color: ColorValue;
  readonly symbol: string;
}

export const DEFAULT_CATEGORIES: readonly CategoryMeta[] = [
  {
    id: 'groceries',
    name: 'Groceries',
    sortOrder: 1,
    color: colors.cat.groceries,
    symbol: 'cart.fill',
  },
  {
    id: 'household',
    name: 'Household',
    sortOrder: 2,
    color: colors.cat.household,
    symbol: 'house.fill',
  },
  {
    id: 'personal-care',
    name: 'Personal Care',
    sortOrder: 3,
    color: colors.cat.personalCare,
    symbol: 'heart.fill',
  },
  {
    id: 'beverages',
    name: 'Beverages',
    sortOrder: 4,
    color: colors.cat.beverages,
    symbol: 'cup.and.saucer.fill',
  },
  {
    id: 'snacks-treats',
    name: 'Snacks & Treats',
    sortOrder: 5,
    color: colors.cat.snacks,
    symbol: 'birthday.cake.fill',
  },
  {
    id: 'baby-kids',
    name: 'Baby & Kids',
    sortOrder: 6,
    color: colors.cat.babyKids,
    symbol: 'figure.and.child.holdinghands',
  },
  { id: 'pet', name: 'Pet', sortOrder: 7, color: colors.cat.pet, symbol: 'pawprint.fill' },
  { id: 'other', name: 'Other', sortOrder: 8, color: colors.cat.other, symbol: 'tag.fill' },
] as const;

const FALLBACK_CATEGORY = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];

const CATEGORY_BY_ID = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
const CATEGORY_BY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.name.toLowerCase(), c]));

/**
 * Minimal shape of a backend category. Matches the relevant fields of the
 * server's CategoryResponse so callers can pass `useCategories().data` directly
 * without importing the full feature type here. `color` and `icon` are names
 * (BC-05 AC 5, DA-9); servers before DA-9 send neither.
 */
export interface BackendCategory {
  readonly id: string;
  readonly name: string;
  readonly color?: string | null;
  readonly icon?: string | null;
}

/**
 * Icon names the server stores, mapped to SF Symbols (BC-05 AC 5). The first
 * eight are the built-ins'; CUSTOM_CATEGORY_ICONS lists those a custom
 * category may take. Keep in step with `backend/app/models/category_looks.py`.
 */
export const CATEGORY_ICON_SYMBOLS = {
  cart: 'cart.fill',
  house: 'house.fill',
  heart: 'heart.fill',
  cup: 'cup.and.saucer.fill',
  cake: 'birthday.cake.fill',
  family: 'figure.and.child.holdinghands',
  paw: 'pawprint.fill',
  tag: 'tag.fill',
  leaf: 'leaf.fill',
  gift: 'gift.fill',
  sparkles: 'sparkles',
  'fork-knife': 'fork.knife',
  wineglass: 'wineglass.fill',
  dumbbell: 'dumbbell.fill',
  pills: 'pills.fill',
  book: 'book.fill',
  gamecontroller: 'gamecontroller.fill',
  wrench: 'wrench.and.screwdriver.fill',
  airplane: 'airplane',
} as const;

export type CategoryIconName = keyof typeof CATEGORY_ICON_SYMBOLS;

/** The colours a custom category can take, in picker order; the first is the default. */
export const CUSTOM_CATEGORY_COLORS: readonly CategoryColorName[] = [
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
];

/** The icons a custom category can take, in picker order; the first is the default. */
export const CUSTOM_CATEGORY_ICONS: readonly CategoryIconName[] = [
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
];

export const DEFAULT_CUSTOM_COLOR: CategoryColorName = 'indigo';
export const DEFAULT_CUSTOM_ICON: CategoryIconName = 'tag';

function isColorName(value: string | null | undefined): value is CategoryColorName {
  return value != null && Object.prototype.hasOwnProperty.call(categoryPalette, value);
}

function isIconName(value: string | null | undefined): value is CategoryIconName {
  return value != null && Object.prototype.hasOwnProperty.call(CATEGORY_ICON_SYMBOLS, value);
}

/**
 * Display meta for a backend category: its own colour and icon when the server
 * sent them (BC-05 AC 7), else the built-in look matched by name (servers
 * before DA-9, and offline). A name the app doesn't know falls back per field.
 */
export function categoryMeta(cat: {
  readonly name: string;
  readonly color?: string | null;
  readonly icon?: string | null;
}): CategoryMeta {
  const byName = getCategoryMetaByName(cat.name);
  if (!isColorName(cat.color) && !isIconName(cat.icon) && byName.name === cat.name) return byName;
  return {
    ...byName,
    name: cat.name,
    color: isColorName(cat.color) ? categoryPalette[cat.color] : byName.color,
    symbol: isIconName(cat.icon) ? CATEGORY_ICON_SYMBOLS[cat.icon] : byName.symbol,
  };
}

/**
 * Resolve the display meta (icon/color) for a default category by its slug,
 * falling back to the "Other" entry for unknown/empty ids.
 */
export function getCategoryMeta(id: string | null | undefined): CategoryMeta {
  if (!id) return FALLBACK_CATEGORY;
  return CATEGORY_BY_ID.get(id) ?? FALLBACK_CATEGORY;
}

/**
 * Map a default-category display meta from a category name. Names are matched
 * case-insensitively against DEFAULT_CATEGORIES so backend categories (which
 * carry a UUID id and a human-readable name) still render the right visuals.
 */
export function getCategoryMetaByName(name: string | null | undefined): CategoryMeta {
  if (!name) return FALLBACK_CATEGORY;
  return CATEGORY_BY_NAME.get(name.toLowerCase()) ?? FALLBACK_CATEGORY;
}

/**
 * Resolve display meta for a category id that may be either a default slug
 * (offline / legacy) or a backend UUID. When a `categories` lookup is provided,
 * a UUID is first resolved to its backend name, then mapped to display meta by
 * name. Slug-based lookup is preserved as a fallback so existing behavior holds.
 */
export function resolveCategoryMeta(
  id: string | null | undefined,
  categories?: readonly BackendCategory[] | null,
): CategoryMeta {
  if (!id) return FALLBACK_CATEGORY;

  // Fast path: id is a known default slug.
  const bySlug = CATEGORY_BY_ID.get(id);
  if (bySlug) return bySlug;

  // Backend UUID path: resolve UUID -> name -> display meta.
  if (categories && categories.length > 0) {
    const match = categories.find((c) => c.id === id);
    if (match) return categoryMeta(match);
  }

  return FALLBACK_CATEGORY;
}
