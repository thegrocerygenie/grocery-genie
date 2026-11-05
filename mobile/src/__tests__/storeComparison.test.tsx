/**
 * PI-04 AC 5-8 and EC-PI 10 (DA-10): the Compare stores section on item
 * detail, as the design draws it: a "Save by switching" card, rows that lead
 * with the latest price and a CHEAPEST badge, a price bar per row, one
 * VoiceOver element per row, and nothing truncated at the largest text size.
 * Jest has no layout engine, so the large-text test checks the layout props;
 * the Simulator recheck draws it (docs/device-checklist.md).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { StoreComparison } from '@/features/price-intelligence/components/StoreComparison';
import type { PriceComparison, StorePrice } from '@/features/price-intelligence/types';
import { storeColor } from '@/features/price-intelligence/utils/storeColor';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const AX5_SCALE = 3.571;
const mockWindow = { fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 667, scale: 2, fontScale: mockWindow.fontScale }),
}));

function store(name: string, latest: number, avg: number, count = 2): StorePrice {
  return {
    store_id: `s-${name}`,
    store_name: name,
    latest_price: latest,
    latest_date: '2026-03-01',
    avg_price: avg,
    observation_count: count,
  };
}

/** The design's avocado: four stores, sent in the server's order (by average). */
function comparison(stores: StorePrice[], unit: string | null = null): PriceComparison {
  return {
    item: { id: 'i-1', canonical_name: 'Avocado' },
    unit_of_measure: unit,
    currency: 'USD',
    min_observations: 2,
    stores,
    stores_below_minimum: 0,
  };
}

const AVOCADO = [
  store("Trader Joe's", 3.99, 4.12, 8),
  store('Costco', 4.49, 4.39, 5),
  store('Safeway', 5.49, 5.12, 4),
  store('Whole Foods', 5.99, 5.79, 6),
];

function flat(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
}

beforeEach(() => {
  mockWindow.fontScale = 1;
});

describe('Save by switching card (PI-04 AC 5)', () => {
  it('shows the gap between the highest and lowest latest price, cheapest vs priciest', () => {
    render(<StoreComparison comparison={comparison(AVOCADO)} />);

    expect(screen.getByText('Save by switching')).toBeTruthy();
    expect(screen.getByText('$2.00 / unit')).toBeTruthy();
    expect(screen.getByText("Trader Joe's vs. Whole Foods")).toBeTruthy();
    expect(
      screen.getByLabelText("Save by switching: $2.00 / unit, Trader Joe's vs. Whole Foods"),
    ).toBeTruthy();
  });

  it('names a measured unit', () => {
    render(
      <StoreComparison
        comparison={comparison([store('FreshCo', 0.71, 0.7), store('Loblaws', 0.81, 0.8)], 'lb')}
      />,
    );

    expect(screen.getByText('$0.10 / lb')).toBeTruthy();
  });

  it('is not shown with one store', () => {
    render(<StoreComparison comparison={comparison([store('FreshCo', 1, 1)])} />);

    expect(screen.queryByText('Save by switching')).toBeNull();
  });
});

describe('Store rows (PI-04 AC 6, 7)', () => {
  it('orders rows by latest price, leads with it, and badges the cheapest', () => {
    // Sent by average: Costco (4.10) first, though Trader Joe's is cheaper now.
    render(
      <StoreComparison
        comparison={comparison([
          store('Costco', 4.49, 4.1, 5),
          store("Trader Joe's", 3.99, 4.12, 8),
          store('Whole Foods', 5.99, 5.79, 6),
        ])}
      />,
    );

    const rows = screen.getAllByTestId(/^compare-row-/);
    expect(rows.map((r) => r.props.testID)).toEqual([
      "compare-row-s-Trader Joe's",
      'compare-row-s-Costco',
      'compare-row-s-Whole Foods',
    ]);
    expect(screen.getByTestId("compare-latest-s-Trader Joe's").props.children).toBe('$3.99');
    expect(screen.getByText('8 purchases · avg $4.12')).toBeTruthy();
    expect(screen.getAllByText('CHEAPEST')).toHaveLength(1);
    expect(screen.getByTestId("compare-badge-s-Trader Joe's")).toBeTruthy();
    expect(screen.getByTestId("store-square-s-Trader Joe's")).toBeTruthy();
  });

  it("draws each row's bar in the store's colour, its latest price over the highest", () => {
    render(<StoreComparison comparison={comparison(AVOCADO)} />);

    expect(flat("compare-bar-s-Trader Joe's")).toMatchObject({
      width: `${(3.99 / 5.99) * 100}%`,
      backgroundColor: storeColor("s-Trader Joe's"),
    });
    expect(flat('compare-bar-s-Whole Foods').width).toBe('100%');
  });

  it('says 1 purchase for one', () => {
    render(<StoreComparison comparison={comparison([store('A', 1, 1, 1), store('B', 2, 2, 3)])} />);

    expect(screen.getByText('1 purchase · avg $1.00')).toBeTruthy();
  });
});

describe('Store comparison ties (EC-PI 10)', () => {
  it('orders a tie on latest price by average, then name, and badges the first', () => {
    render(
      <StoreComparison
        comparison={comparison([
          store('Safeway', 4, 4.5),
          store('Loblaws', 4, 4.2),
          store('FreshCo', 4, 4.2),
          store('Metro', 5, 4.0),
        ])}
      />,
    );

    const rows = screen.getAllByTestId(/^compare-row-/);
    expect(rows.map((r) => r.props.testID)).toEqual([
      'compare-row-s-FreshCo',
      'compare-row-s-Loblaws',
      'compare-row-s-Safeway',
      'compare-row-s-Metro',
    ]);
    expect(screen.getByTestId('compare-badge-s-FreshCo')).toBeTruthy();
    expect(screen.getAllByText('CHEAPEST')).toHaveLength(1);
    expect(screen.getByText('$1.00 / unit')).toBeTruthy();
    expect(screen.getByText('FreshCo vs. Metro')).toBeTruthy();
  });

  it('shows no Save by switching card when every store has the same latest price', () => {
    render(
      <StoreComparison
        comparison={comparison([store('Safeway', 4, 4.5), store('Loblaws', 4, 4.2)])}
      />,
    );

    expect(screen.queryByText('Save by switching')).toBeNull();
    expect(screen.getByTestId('compare-badge-s-Loblaws')).toBeTruthy();
  });
});

describe('Store rows with VoiceOver and large text (PI-04 AC 8)', () => {
  it('reads each row as one element: store, cheapest, latest, average, purchases', () => {
    render(<StoreComparison comparison={comparison(AVOCADO)} />);

    const row = screen.getByTestId("compare-row-s-Trader Joe's");
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe(
      "Trader Joe's, cheapest, latest $3.99, average $4.12, 8 purchases",
    );
    expect(screen.getByTestId('compare-row-s-Costco').props.accessibilityLabel).toBe(
      'Costco, latest $4.49, average $4.39, 5 purchases',
    );
  });

  it('truncates nothing at AX5: names wrap and the latest price stacks under them', () => {
    mockWindow.fontScale = AX5_SCALE;
    render(<StoreComparison comparison={comparison(AVOCADO)} />);

    expect(screen.getByText('Whole Foods').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('6 purchases · avg $5.79').props.numberOfLines).toBeUndefined();
    expect(flat('compare-head-s-Whole Foods').flexDirection).toBe('column');
    expect(flat('compare-name-line-s-Whole Foods').flexWrap).toBe('wrap');
    expect(screen.getByText('$2.00 / unit').props.numberOfLines).toBeUndefined();
  });

  it('keeps the latest price beside the name at the default size', () => {
    render(<StoreComparison comparison={comparison(AVOCADO)} />);

    expect(flat('compare-head-s-Whole Foods').flexDirection).toBe('row');
  });
});
