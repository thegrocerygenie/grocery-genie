import { useColorScheme } from 'react-native';
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

  // The home-screen icon in the current appearance; VoiceOver skips it (the name is the heading).
  afterEach(() => jest.mocked(useColorScheme).mockReturnValue('light'));

  it.each([
    ['light', require('../../assets/brand/app-icon-light.png')],
    ['dark', require('../../assets/brand/app-icon-dark.png')],
  ] as const)('shows the Leaf Drop app icon in %s mode', (scheme, icon) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme);
    renderRouter({ about: AboutScreen }, { initialUrl: '/about' });

    const image = screen.getByTestId('about-app-icon', { includeHiddenElements: true });
    expect(image.props.source).toEqual(icon);
  });
});
