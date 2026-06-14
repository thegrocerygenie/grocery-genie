import { colors } from './theme';

export interface CategoryMeta {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly color: string;
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
const CATEGORY_BY_NAME = new Map(
  DEFAULT_CATEGORIES.map((c) => [c.name.toLowerCase(), c]),
);

/**
 * Minimal shape of a backend category. Matches the relevant fields of the
 * server's CategoryResponse so callers can pass `useCategories().data` directly
 * without importing the full feature type here.
 */
export interface BackendCategory {
  readonly id: string;
  readonly name: string;
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
    if (match) return getCategoryMetaByName(match.name);
  }

  return FALLBACK_CATEGORY;
}
