import { percentChange } from '../monthOverMonth';

describe('percentChange', () => {
  it('returns the rounded change from the previous amount', () => {
    expect(percentChange(30, 20)).toBe(50);
    expect(percentChange(35, 30)).toBe(17);
    expect(percentChange(15, 20)).toBe(-25);
  });

  it('returns -100 when spending stopped', () => {
    expect(percentChange(0, 10)).toBe(-100);
  });

  it('returns 0 when nothing changed', () => {
    expect(percentChange(12.5, 12.5)).toBe(0);
  });

  it('returns null when there is no previous spend to compare with', () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});
