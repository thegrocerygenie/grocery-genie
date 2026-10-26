import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CaptureActionSheet } from '../CaptureActionSheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

function renderSheet() {
  const props = {
    visible: true,
    onClose: jest.fn(),
    onTakePhoto: jest.fn(),
    onChooseFromLibrary: jest.fn(),
    onChooseFiles: jest.fn(),
    onManualEntry: jest.fn(),
  };
  const utils = render(<CaptureActionSheet {...props} />);
  const { Modal } = jest.requireActual('react-native');
  const finishDismiss = () => act(() => utils.UNSAFE_getByType(Modal).props.onDismiss());
  return { props, finishDismiss };
}

describe('CaptureActionSheet', () => {
  // iOS dismisses anything presented above the sheet when the sheet finishes
  // closing, so a picker opened in the same tick appeared and vanished.
  it('runs the chosen action only after the sheet has finished dismissing', () => {
    const { props, finishDismiss } = renderSheet();

    fireEvent.press(screen.getByLabelText('Choose from Library'));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChooseFromLibrary).not.toHaveBeenCalled();

    finishDismiss();

    expect(props.onChooseFromLibrary).toHaveBeenCalledTimes(1);
  });

  it('runs the action once, even if the sheet dismisses again', () => {
    const { props, finishDismiss } = renderSheet();

    fireEvent.press(screen.getByLabelText('Choose Files'));
    finishDismiss();
    finishDismiss();

    expect(props.onChooseFiles).toHaveBeenCalledTimes(1);
  });

  it('runs nothing when the sheet is cancelled', () => {
    const { props, finishDismiss } = renderSheet();

    fireEvent.press(screen.getByLabelText('Cancel'));
    finishDismiss();

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onTakePhoto).not.toHaveBeenCalled();
    expect(props.onChooseFromLibrary).not.toHaveBeenCalled();
    expect(props.onChooseFiles).not.toHaveBeenCalled();
    expect(props.onManualEntry).not.toHaveBeenCalled();
  });
});
