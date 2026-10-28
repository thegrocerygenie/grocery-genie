/**
 * M6 / RC-05: every supported receipt language is always read, so the
 * Language screen lists them and offers no switches that would do nothing.
 */
import { Switch } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import LanguageSettingsScreen from '../../app/settings/language-settings';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('Language screen', () => {
  it('lists each RC-05 receipt language as supported', () => {
    render(<LanguageSettingsScreen />);

    for (const name of ['English', 'French', 'Spanish', 'German', 'Serbian', 'Mandarin']) {
      expect(screen.getByLabelText(`${name}, supported`)).toBeTruthy();
    }
  });

  it('offers no switches, since every language is always read', () => {
    render(<LanguageSettingsScreen />);

    expect(screen.UNSAFE_queryAllByType(Switch)).toHaveLength(0);
    expect(screen.getByText(/read automatically/)).toBeTruthy();
  });
});
