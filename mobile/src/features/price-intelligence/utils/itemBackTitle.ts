import { PRICES_COPY } from '@/features/price-intelligence/constants';

/** The part of a navigation route this needs: its name and, for a navigator, its state. */
export interface RouteLike {
  name: string;
  state?: { index?: number; routes: RouteLike[] };
}

const TAB_TITLES: Record<string, string> = {
  '(budget)': PRICES_COPY.backBudget,
  history: PRICES_COPY.backHistory,
  scan: PRICES_COPY.backScan,
};

/**
 * The Back label for item detail: the name of the screen under it. An item
 * opens from the Prices list, from a receipt line, from the Price alerts list,
 * and from a price alert or link straight over the tabs (then the tab that
 * was showing). Undefined
 * leaves iOS's default, the previous screen's title.
 */
export function itemBackTitle(previous: RouteLike | undefined): string | undefined {
  switch (previous?.name) {
    case 'items/index':
      return PRICES_COPY.detailBack;
    case 'receipt/[id]':
      return PRICES_COPY.backReceipt;
    // PI-01 AC 10: the Price alerts list (PI-03 AC 5, DA-4) at `app/price-alerts.tsx`.
    case 'price-alerts':
      return PRICES_COPY.backPriceAlerts;
    case '(tabs)': {
      const tabs = previous.state;
      // Before the tabs first render their state is unset; they open on Budget.
      const tab = tabs ? tabs.routes[tabs.index ?? 0]?.name : '(budget)';
      return (tab && TAB_TITLES[tab]) ?? PRICES_COPY.backBudget;
    }
    default:
      return undefined;
  }
}
