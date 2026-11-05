"""A category's colour and icon (BC-05 AC 5, DA-9).

The values are names, not hex codes or SF Symbol names: the app maps each
colour to an iOS system colour in ``mobile/src/constants/theme.ts``
(``categoryPalette``) and each icon to a symbol in
``mobile/src/constants/categories.ts`` (``CATEGORY_ICON_SYMBOLS``). Keep the
three lists in step.

A custom category takes a colour from ``CUSTOM_COLORS`` and an icon from
``CUSTOM_ICONS``; the first of each is the default. The eight built-ins have
fixed looks (``DEFAULT_LOOKS``) that no request changes.
"""

from typing import Final

CUSTOM_COLORS: Final[tuple[str, ...]] = (
    "indigo",
    "purple",
    "pink",
    "red",
    "orange",
    "yellow",
    "green",
    "mint",
    "teal",
    "cyan",
    "blue",
    "brown",
)

CUSTOM_ICONS: Final[tuple[str, ...]] = (
    "tag",
    "leaf",
    "gift",
    "sparkles",
    "fork-knife",
    "wineglass",
    "dumbbell",
    "pills",
    "book",
    "gamecontroller",
    "wrench",
    "airplane",
)

DEFAULT_COLOR: Final[str] = CUSTOM_COLORS[0]
DEFAULT_ICON: Final[str] = CUSTOM_ICONS[0]

# Built-in category name -> (colour, icon). Matches the app's DEFAULT_CATEGORIES.
DEFAULT_LOOKS: Final[dict[str, tuple[str, str]]] = {
    "Groceries": ("green", "cart"),
    "Household": ("blue", "house"),
    "Personal Care": ("pink", "heart"),
    "Beverages": ("indigo", "cup"),
    "Snacks & Treats": ("orange", "cake"),
    "Baby & Kids": ("yellow", "family"),
    "Pet": ("teal", "paw"),
    "Other": ("gray", "tag"),
}
