import { buildTrendHighlights } from '../utils/trendHighlights';

const month = (period: string, total: number) => ({ period, total });

const opts = (o: Partial<{ change: number | null; currentPeriod: string; halves: boolean }>) => ({
  change: null,
  currentPeriod: '',
  halves: false,
  ...o,
});

describe('buildTrendHighlights (BC-04 AC 8)', () => {
  const months = [month('2026-01', 300), month('2026-02', 512), month('2026-03', 242)];

  it('names the highest and lowest month', () => {
    const h = buildTrendHighlights(months, opts({ currentPeriod: '2026-09' }));

    expect(h.highest).toEqual({ period: '2026-02', total: 512 });
    expect(h.lowest).toEqual({ period: '2026-03', total: 242 });
  });

  it('skips the current month, still in progress, for the lowest', () => {
    const h = buildTrendHighlights(months, opts({ currentPeriod: '2026-03' }));

    expect(h.lowest).toEqual({ period: '2026-01', total: 300 });
  });

  it('skips months with no spending for the lowest', () => {
    const h = buildTrendHighlights(
      [month('2026-01', 0), month('2026-02', 40), month('2026-03', 25)],
      opts({ currentPeriod: '2026-09' }),
    );

    expect(h.lowest).toEqual({ period: '2026-03', total: 25 });
  });

  it('has no lowest when only the current month or empty months remain', () => {
    const h = buildTrendHighlights(
      [month('2026-01', 0), month('2026-02', 0), month('2026-03', 25)],
      opts({ currentPeriod: '2026-03' }),
    );

    expect(h.lowest).toBeNull();
    expect(h.highest).toEqual({ period: '2026-03', total: 25 });
  });

  it('takes the earlier month when two tie', () => {
    const h = buildTrendHighlights(
      [month('2026-01', 50), month('2026-02', 50)],
      opts({ currentPeriod: '2026-09' }),
    );

    expect(h.highest?.period).toBe('2026-01');
    expect(h.lowest?.period).toBe('2026-01');
  });

  it('uses the headline change for the trend', () => {
    expect(buildTrendHighlights(months, opts({ change: -13 })).trend).toEqual({
      direction: 'falling',
      change: -13,
    });
    expect(buildTrendHighlights(months, opts({ change: 12 })).trend).toEqual({
      direction: 'rising',
      change: 12,
    });
  });

  it('calls a change under 5% steady', () => {
    expect(buildTrendHighlights(months, opts({ change: -4 })).trend).toEqual({
      direction: 'steady',
      change: -4,
    });
    expect(buildTrendHighlights(months, opts({ change: 5 })).trend?.direction).toBe('rising');
  });

  it('has no trend for 1M-1Y without a headline change, never switching to halves', () => {
    // The halves would read +100%, a different measure from the headline's.
    const rising = [month('2026-01', 100), month('2026-02', 200), month('2026-03', 300)];

    expect(buildTrendHighlights(rising, opts({ change: null })).trend).toBeNull();
  });

  it('for All, compares the later half of the months with the earlier', () => {
    // Earlier half 100, 200 (avg 150); the middle month is left out; later 300, 300.
    const all = [
      month('2025-11', 100),
      month('2025-12', 200),
      month('2026-01', 999),
      month('2026-02', 300),
      month('2026-03', 300),
    ];

    expect(buildTrendHighlights(all, opts({ halves: true })).trend).toEqual({
      direction: 'rising',
      change: 100,
    });
  });

  it('for All, has no trend with one month, or nothing spent in the earlier half', () => {
    expect(buildTrendHighlights([month('2026-03', 40)], opts({ halves: true })).trend).toBeNull();
    expect(
      buildTrendHighlights([month('2026-02', 0), month('2026-03', 40)], opts({ halves: true }))
        .trend,
    ).toBeNull();
  });

  it('has no highlights without months', () => {
    expect(buildTrendHighlights([], opts({}))).toEqual({
      highest: null,
      lowest: null,
      trend: null,
    });
  });
});
