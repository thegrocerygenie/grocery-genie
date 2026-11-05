import { buildTrendHighlights } from '../utils/trendHighlights';

const month = (period: string, total: number) => ({ period, total });

describe('buildTrendHighlights (BC-04 AC 8)', () => {
  const months = [month('2026-01', 300), month('2026-02', 512), month('2026-03', 242)];

  it('names the highest and lowest month', () => {
    const h = buildTrendHighlights(months, { change: null, currentPeriod: '2026-09' });

    expect(h.highest).toEqual({ period: '2026-02', total: 512 });
    expect(h.lowest).toEqual({ period: '2026-03', total: 242, inProgress: false });
  });

  it('marks the lowest month in progress when it is the current month', () => {
    const h = buildTrendHighlights(months, { change: null, currentPeriod: '2026-03' });

    expect(h.lowest?.inProgress).toBe(true);
  });

  it('takes the earlier month when two tie', () => {
    const h = buildTrendHighlights([month('2026-01', 50), month('2026-02', 50)], {
      change: null,
      currentPeriod: '2026-02',
    });

    expect(h.highest?.period).toBe('2026-01');
    expect(h.lowest?.period).toBe('2026-01');
  });

  it('uses the headline change for the trend when there is one', () => {
    expect(buildTrendHighlights(months, { change: -13, currentPeriod: '' }).trend).toEqual({
      direction: 'falling',
      change: -13,
    });
    expect(buildTrendHighlights(months, { change: 12, currentPeriod: '' }).trend).toEqual({
      direction: 'rising',
      change: 12,
    });
  });

  it('calls a change under 5% steady', () => {
    expect(buildTrendHighlights(months, { change: -4, currentPeriod: '' }).trend).toEqual({
      direction: 'steady',
      change: -4,
    });
    expect(buildTrendHighlights(months, { change: 5, currentPeriod: '' }).trend?.direction).toBe(
      'rising',
    );
  });

  it('without a headline change (All), compares the later half of the months with the earlier', () => {
    // Earlier half 100, 200 (avg 150); the middle month is left out; later 300, 300.
    const all = [
      month('2025-11', 100),
      month('2025-12', 200),
      month('2026-01', 999),
      month('2026-02', 300),
      month('2026-03', 300),
    ];

    expect(buildTrendHighlights(all, { change: null, currentPeriod: '' }).trend).toEqual({
      direction: 'rising',
      change: 100,
    });
  });

  it('has no trend with one month, or nothing spent in the earlier half', () => {
    expect(
      buildTrendHighlights([month('2026-03', 40)], { change: null, currentPeriod: '' }).trend,
    ).toBeNull();
    expect(
      buildTrendHighlights([month('2026-02', 0), month('2026-03', 40)], {
        change: null,
        currentPeriod: '',
      }).trend,
    ).toBeNull();
  });

  it('has no highlights without months', () => {
    expect(buildTrendHighlights([], { change: null, currentPeriod: '' })).toEqual({
      highest: null,
      lowest: null,
      trend: null,
    });
  });
});
