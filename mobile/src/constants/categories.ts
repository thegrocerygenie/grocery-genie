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

const CATEGORY_BY_ID = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

export function getCategoryMeta(id: string | null | undefined): CategoryMeta {
  if (!id) return DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
  return CATEGORY_BY_ID.get(id) ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}
