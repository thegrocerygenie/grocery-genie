import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ImportProgressOverlay } from '../components/ImportProgressOverlay';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('ImportProgressOverlay', () => {
  it('shows a busy progress card while an import runs', () => {
    render(<ImportProgressOverlay visible previewUri={null} />);

    const card = screen.getByRole('progressbar');
    expect(card.props.accessibilityLabel).toBe('Reading your receipt…');
    expect(card.props.accessibilityState).toEqual({ busy: true });
    expect(screen.getByText('This takes a few seconds.')).toBeTruthy();
  });

  it('previews the picked image when there is one', () => {
    const { UNSAFE_getByType } = render(
      <ImportProgressOverlay visible previewUri="file:///photo.jpg" />,
    );
    const { Image } = jest.requireActual('react-native');
    expect(UNSAFE_getByType(Image).props.source).toEqual({ uri: 'file:///photo.jpg' });
  });

  it('renders nothing when hidden', () => {
    render(<ImportProgressOverlay visible={false} previewUri={null} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
