import { itemBackTitle } from '@/features/price-intelligence/utils/itemBackTitle';

describe('itemBackTitle', () => {
  it('names the tab that was showing under the item', () => {
    const tabs = { index: 1, routes: [{ name: '(budget)' }, { name: 'history' }] };
    expect(itemBackTitle({ name: '(tabs)', state: tabs })).toBe('History');
  });

  it('says Budget while the tabs have no state yet, as on a cold start', () => {
    expect(itemBackTitle({ name: '(tabs)' })).toBe('Budget');
  });

  it('leaves the iOS default for any other screen', () => {
    expect(itemBackTitle({ name: 'items/matches' })).toBeUndefined();
  });

  it('leaves the iOS default when nothing is under the item', () => {
    expect(itemBackTitle(undefined)).toBeUndefined();
  });
});
