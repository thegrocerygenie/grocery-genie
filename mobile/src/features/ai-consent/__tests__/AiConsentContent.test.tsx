/**
 * The consent sheet must say what is sent, to whom, why, that Anthropic does
 * not train on it, and where to turn it off (App Store 5.1.2(i)).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AiConsentContent } from '../components/AiConsentContent';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

function setup(props: Partial<React.ComponentProps<typeof AiConsentContent>> = {}) {
  const onAllow = jest.fn();
  const onManual = jest.fn();
  render(<AiConsentContent onAllow={onAllow} onManual={onManual} {...props} />);
  return { onAllow, onManual };
}

it('discloses what is sent, to whom, why, training and how to turn it off', () => {
  setup();
  const text = screen
    .getAllByText(/.+/)
    .map((node) => node.props.children)
    .flat()
    .join(' ');
  expect(text).toMatch(/receipt photo/i);
  expect(text).toMatch(/item names/i);
  expect(text).toMatch(/Anthropic/);
  expect(text).toMatch(/Claude/);
  expect(text).toMatch(/suggest categories/i);
  expect(text).toMatch(/does not train/i);
  expect(text).toMatch(/Settings/);
});

it('Allow asks for permission', () => {
  const { onAllow, onManual } = setup();
  fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
  expect(onAllow).toHaveBeenCalledTimes(1);
  expect(onManual).not.toHaveBeenCalled();
});

it('offers manual entry instead', () => {
  const { onAllow, onManual } = setup();
  fireEvent.press(screen.getByRole('button', { name: 'Enter receipts manually' }));
  expect(onManual).toHaveBeenCalledTimes(1);
  expect(onAllow).not.toHaveBeenCalled();
});

it('disables Allow while saving', () => {
  const { onAllow } = setup({ saving: true });
  fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
  expect(onAllow).not.toHaveBeenCalled();
});

it('shows why saving failed', () => {
  setup({ error: 'Couldn’t save. Check your connection and try again.' });
  expect(screen.getByText('Couldn’t save. Check your connection and try again.')).toBeTruthy();
});
