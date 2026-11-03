import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PremiumUpgradePrompt } from '../PremiumUpgradePrompt';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('PremiumUpgradePrompt', () => {
  it('reads as a heading and a message, with no purchase button until Premium ships', () => {
    render(<PremiumUpgradePrompt title="See your whole year" message="Part of Premium." />);

    expect(screen.getByRole('header', { name: 'See your whole year' })).toBeTruthy();
    expect(screen.getByText('Part of Premium.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onUpgrade when the upgrade button is tapped (the V11-P0 paywall seam)', () => {
    const onUpgrade = jest.fn();
    render(
      <PremiumUpgradePrompt
        title="See your whole year"
        message="Part of Premium."
        upgradeLabel="Learn About Premium"
        onUpgrade={onUpgrade}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Learn About Premium' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
