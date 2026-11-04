"""Receipt-name pairs for PI-02 item matching (BUG-4).

Each pair is (the name already in the registry, the name on the next
receipt). The names come from real receipt formats: the receipt test set
(`tests/llm_validation/ground_truth/en_us_01.json`), the 2026-11-03 device
check probe receipt, common store abbreviations, and French (Quebec) receipt names.

- SAME_PRODUCT: one product written two ways (abbreviation, word order,
  plural, spacing). Matching should auto-link these.
- QUALIFIER_DIFFERS: the names differ in a qualifier (organic, size, fat,
  flavour, store brand, colour, form, diet). These are different products to
  the user's price history, however close the names score, so matching must
  never auto-link them; at most it asks (a suggestion).
- DIFFERENT_PRODUCT: different products with no qualifier word between them.
  The scores alone keep these apart; only the real-model measurement uses
  them.
"""

SAME_PRODUCT: list[tuple[str, str]] = [
    ("Organic Bananas", "ORG BANANAS"),
    ("Bananas", "BANANA"),
    ("Avocado", "AVOCADOS"),
    ("Avocados 4ct", "AVOCADO 4CT"),
    ("Gala Apples", "APPLES GALA"),
    ("Whole Milk 1 Gal", "MILK WHOLE 1 GAL"),
    ("Whole Milk 1 Gal", "WHL MILK 1 GAL"),
    ("Brown Rice", "BRN RICE"),
    ("Salted Butter", "SLTD BUTTER"),
    ("Green Grapes", "GRN GRAPES"),
    ("Smoked Salmon", "SMKD SALMON"),
    ("Greek Yogurt 32oz", "GRK YGRT 32OZ"),
    ("Chicken Breast Lb", "CHICKEN BREAST"),
    ("Boneless Skinless Chicken Breast", "BNLS SKNLS CHKN BRST"),
    ("Baby Spinach 5oz", "BABY SPINACH 5 OZ"),
    ("Organic Baby Spinach", "ORG BABY SPINACH"),
    ("Cage Free Eggs Dz", "CAGE FREE EGGS"),
    ("Large Eggs 12ct", "LG EGGS 12CT"),
    ("Cheddar Cheese", "CHED CHS"),
    ("Kirkland Paper Towels", "KS PAPER TOWELS"),
    ("Paper Towels 6pk", "PAPER TOWEL 6PK"),
    ("Sparkling Water 12pk", "SPARKLING WTR 12PK"),
    ("Dark Chocolate Bar", "DARK CHOC BAR"),
    ("Sourdough Bread", "SOURDOUGH BRD"),
    ("Strawberries", "STRAWBERRIES 1LB"),
    ("Dish Soap 22oz", "DISH SOAP 22 OZ"),
    ("Skim Milk", "NONFAT MILK"),
    ("Frozen Peas", "FRZN PEAS"),
    ("Unsalted Butter", "BUTTER UNSALTED"),
    ("Whole Wheat Bread", "WHL WHT BREAD"),
    # French
    ("Bananes biologiques", "BANANES BIO"),
    ("Lait écrémé", "LAIT ECREME"),
    ("Yogourt vanille", "YOGOURT VANILLÉ"),
]

QUALIFIER_DIFFERS: list[tuple[str, str]] = [
    # organic
    ("Organic Bananas", "Bananas"),
    ("Bananas", "Organic Bananas"),
    ("Bananas", "ORG BANANAS"),
    ("Organic Whole Milk", "Whole Milk 1 Gal"),
    ("Baby Spinach 5oz", "ORG BABY SPINACH 5OZ"),
    # fat
    ("Whole Milk", "Skim Milk"),
    ("Reduced Fat Milk", "Whole Milk"),
    ("Low Fat Yogurt", "Yogurt"),
    ("Light Mayo", "Mayo"),
    # size
    ("Large Eggs 12ct", "Brown Eggs 12ct"),
    ("Large Eggs", "Jumbo Eggs"),
    ("Small Avocados", "Avocados"),
    ("Baby Carrots", "Carrots"),
    # flavour
    ("Vanilla Greek Yogurt", "Greek Yogurt"),
    ("Strawberry Yogurt", "Vanilla Yogurt"),
    ("Salted Butter", "Unsalted Butter"),
    ("Unsweetened Almond Milk", "Almond Milk"),
    ("Chunky Peanut Butter", "Creamy Peanut Butter"),
    ("Hot Italian Sausage", "Mild Italian Sausage"),
    # store brand vs brand
    ("Kirkland Cheddar Cheese", "Cheddar Cheese"),
    ("Great Value Peanut Butter", "Peanut Butter"),
    ("GV Paper Towels", "Kirkland Paper Towels"),
    # colour and variety
    ("Red Grapes", "Green Grapes"),
    ("Brown Rice", "White Rice"),
    ("Red Onion", "Onion"),
    ("Whole Wheat Bread", "White Bread"),
    ("Greek Yogurt", "Yogurt"),
    # form and cut
    ("Frozen Strawberries", "Strawberries"),
    ("Boneless Chicken Thighs", "Bone-In Chicken Thighs"),
    ("Shredded Mozzarella", "Mozzarella"),
    # diet
    ("Diet Coke", "Coke"),
    ("Coke Zero", "Coke"),
    ("Decaf Coffee", "Coffee"),
    ("Gluten Free Bread", "Bread"),
    ("Cage Free Eggs Dz", "Eggs Dz"),
    # French
    ("Bananes bio", "Bananes"),
    ("Lait entier", "Lait écrémé"),
    ("Lait 2 %", "Lait entier"),
    ("Yogourt nature", "Yogourt vanille"),
    ("Yogourt aux fraises", "Yogourt"),
    ("Pain sans gluten", "Pain"),
    ("Pain de blé entier", "Pain blanc"),
]

DIFFERENT_PRODUCT: list[tuple[str, str]] = [
    ("Chicken Breast", "Chicken Thighs"),
    ("Ground Beef", "Ground Pork"),
    ("Paper Towels", "Toilet Paper"),
    ("Dish Soap", "Hand Soap"),
    ("Cheddar Cheese", "Mozzarella Cheese"),
    ("Peanut Butter", "Almond Butter"),
    ("Orange Juice", "Apple Juice"),
    ("Sourdough Bread", "Rye Bread"),
    ("Sparkling Water", "Spring Water"),
    ("Apples", "Applesauce"),
]
