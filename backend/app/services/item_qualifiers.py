"""Qualifiers: the words that tell otherwise identical products apart.

"Bananas" and "Organic Bananas" score 0.86 with the embedding model, above
the semantic auto-link threshold, yet they are different products to a
price history (BUG-4). So item matching reads each name's qualifiers
(organic, fat, size, flavour, store brand, colour, form, diet) and never
auto-links two names whose qualifiers differ; it asks the user instead.

Each qualifier lists its receipt spellings, abbreviations included, so
"ORG BANANAS" reads as organic. Spellings are matched on whole words of a
normalized name (see ``normalize_item_name``), longest first: "whole wheat
bread" is whole wheat, not whole.

French receipt words (Quebec) are listed beside their English meaning, so
"Lait écrémé" reads as nonfat like "Skim Milk". Matching ignores accents:
"LAIT ECREME" is "lait écrémé". The French words are a short list of the
common ones, not a translation of every spelling.

A brand that is not listed here reads as no qualifier: "Tillamook Cheddar"
and "Cabot Cheddar" are told apart by the scores alone.
"""

from __future__ import annotations

import unicodedata
from functools import lru_cache

QUALIFIER_SPELLINGS: dict[str, tuple[str, ...]] = {
    # organic
    "organic": (
        "organic",
        "org",
        "orgnc",
        "organics",
        "bio",
        "biologique",
        "biologiques",
    ),
    # fat
    "whole": ("whole", "whl", "entier", "entiere"),
    "nonfat": ("nonfat", "non fat", "fat free", "skim", "ff", "ecreme", "ecremee"),
    "low fat": ("low fat", "lowfat", "lf", "1%", "1 %"),
    "reduced fat": (
        "reduced fat",
        "rf",
        "2%",
        "2 %",
        "partiellement ecreme",
        "demi ecreme",
    ),
    "full fat": ("full fat",),
    "light": ("light", "lite"),
    # size
    "small": ("small", "sm", "sml"),
    "medium": ("medium", "med"),
    "large": ("large", "lg", "lrg", "lge"),
    "extra large": ("extra large", "x large", "xl"),
    "jumbo": ("jumbo", "jmb"),
    "mini": ("mini",),
    "baby": ("baby",),
    "family size": ("family size", "family pack", "family pk"),
    # flavour and texture
    "vanilla": ("vanilla", "van", "vnla", "vanille"),
    "chocolate": ("chocolate", "choc"),
    "strawberry": ("strawberry", "strawberries", "fraise", "fraises"),
    "blueberry": ("blueberry", "blueberries"),
    "raspberry": ("raspberry", "raspberries"),
    "peach": ("peach", "peaches"),
    "cherry": ("cherry", "cherries"),
    "mango": ("mango", "mangoes", "mangos"),
    "honey": ("honey",),
    "cinnamon": ("cinnamon",),
    "maple": ("maple",),
    "caramel": ("caramel",),
    "mint": ("mint",),
    "coconut": ("coconut",),
    "lemon": ("lemon", "lemons"),
    "lime": ("lime", "limes"),
    "garlic": ("garlic",),
    "bbq": ("bbq", "barbecue"),
    "plain": ("plain", "nature"),
    "original": ("original", "orig"),
    "sweetened": ("sweetened",),
    "unsweetened": ("unsweetened", "unswt", "unsweet"),
    "sweet": ("sweet",),
    "salted": ("salted", "sltd"),
    "unsalted": ("unsalted", "unsltd"),
    "lightly salted": ("lightly salted",),
    "spicy": ("spicy",),
    "hot": ("hot",),
    "mild": ("mild",),
    "chunky": ("chunky",),
    "creamy": ("creamy",),
    "crunchy": ("crunchy",),
    "smooth": ("smooth",),
    "dark": ("dark", "drk"),
    # store brands: a store brand and a name brand are different products
    "kirkland": ("kirkland", "kirkland signature", "ks"),
    "great value": ("great value", "gv"),
    "365": ("365", "365 everyday value"),
    "market pantry": ("market pantry",),
    "good gather": ("good gather",),
    "members mark": ("members mark", "member s mark"),
    "trader joes": ("trader joes", "trader joe s", "tjs", "tj s"),
    "signature select": ("signature select",),
    "simple truth": ("simple truth",),
    "presidents choice": ("presidents choice", "president s choice"),
    "no name": ("no name",),
    "private selection": ("private selection",),
    # colour and variety
    "red": ("red",),
    "green": ("green", "grn"),
    "yellow": ("yellow", "yel", "ylw"),
    "white": ("white",),
    "brown": ("brown", "brn"),
    "black": ("black", "blk"),
    "purple": ("purple",),
    "greek": ("greek", "grk"),
    "whole wheat": ("whole wheat", "ww", "whl wht", "whole wht", "ble entier"),
    "whole grain": ("whole grain",),
    "whole bean": ("whole bean",),
    "cage free": ("cage free",),
    "free range": ("free range",),
    "grass fed": ("grass fed",),
    "wild": ("wild", "wild caught"),
    "farmed": ("farmed", "farm raised"),
    # form and cut
    "frozen": ("frozen", "frzn", "frz"),
    "canned": ("canned",),
    "dried": ("dried",),
    "smoked": ("smoked", "smkd"),
    "sliced": ("sliced", "slcd"),
    "shredded": ("shredded", "shred", "shrd"),
    "grated": ("grated",),
    "diced": ("diced",),
    "chopped": ("chopped",),
    "instant": ("instant",),
    "boneless": ("boneless", "bnls"),
    "skinless": ("skinless", "sknls", "skls"),
    "bone in": ("bone in",),
    "skin on": ("skin on",),
    # diet
    "diet": ("diet",),
    "zero": ("zero",),
    "sugar free": ("sugar free",),
    "no sugar added": ("no sugar added", "nsa"),
    "gluten free": ("gluten free", "gf", "sans gluten"),
    "lactose free": ("lactose free",),
    "decaf": ("decaf", "decaffeinated", "dcf"),
    "caffeine free": ("caffeine free",),
    "low sodium": ("low sodium",),
    "reduced sodium": ("reduced sodium",),
}


def _fold(text: str) -> str:
    """Drop accents: "écrémé" -> "ecreme"."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


_QUALIFIER_BY_SPELLING = {
    _fold(spelling): qualifier
    for qualifier, spellings in QUALIFIER_SPELLINGS.items()
    for spelling in spellings
}
_LONGEST_SPELLING = max(len(s.split()) for s in _QUALIFIER_BY_SPELLING)


@lru_cache(maxsize=4096)
def read_qualifiers(normalized: str) -> tuple[str, frozenset[str]]:
    """The name with each qualifier spelled out, and its set of qualifiers.

    "org bananas" -> ("organic bananas", {"organic"}).
    """
    words = normalized.split()
    folded = [_fold(word) for word in words]
    spelled: list[str] = []
    found: set[str] = set()
    i = 0
    while i < len(words):
        for length in range(min(_LONGEST_SPELLING, len(words) - i), 0, -1):
            qualifier = _QUALIFIER_BY_SPELLING.get(" ".join(folded[i : i + length]))
            if qualifier is not None:
                spelled.append(qualifier)
                found.add(qualifier)
                i += length
                break
        else:
            spelled.append(words[i])
            i += 1
    return " ".join(spelled), frozenset(found)


def qualifiers_compatible(a: str, b: str) -> bool:
    """False when two normalized names' qualifiers differ.

    Such a pair can still be suggested to the user, never auto-linked.
    """
    return read_qualifiers(a)[1] == read_qualifiers(b)[1]
