import { renderRouter, screen } from 'expo-router/testing-library';

import AboutScreen from '../../app/settings/about';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-constants', () => ({
  expoConfig: { version: '0.1.0', ios: { buildNumber: '7' } },
}));

describe('About', () => {
  it('shows the installed version and build', () => {
    renderRouter({ about: AboutScreen }, { initialUrl: '/about' });

    expect(screen.getByText('Grocery Genie')).toBeTruthy();
    expect(screen.getByText('0.1.0')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });
});
