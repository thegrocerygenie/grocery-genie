/**
 * Photos queued while AI reading is off wait on the device. The Pending
 * banner says so and opens the consent sheet.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { PendingReceipt } from '@/store/offlineStore';

import { OfflineQueueSection } from '../components/OfflineQueueSection';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const queued: PendingReceipt = {
  id: 'p-1',
  imageUri: 'file:///doc/pending-receipts/a.jpg',
  mimeType: 'image/jpeg',
  capturedAt: new Date().toISOString(),
  ownerId: 'user-a',
  status: 'pending',
};

function setup(consentNeeded: boolean) {
  const onReviewConsent = jest.fn();
  render(
    <OfflineQueueSection
      pending={[queued, { ...queued, id: 'p-2' }]}
      isConnected
      consentNeeded={consentNeeded}
      onPressFailed={jest.fn()}
      onRetry={jest.fn()}
      onReviewConsent={onReviewConsent}
    />,
  );
  return { onReviewConsent };
}

it('says the queue waits for the user to allow AI reading, and opens the sheet', () => {
  const { onReviewConsent } = setup(true);

  expect(screen.getByText('2 receipts wait until you allow AI reading')).toBeTruthy();
  expect(screen.getAllByText(/needs your OK/)).toHaveLength(2);
  fireEvent.press(screen.getByRole('button', { name: 'Review AI reading permission' }));
  expect(onReviewConsent).toHaveBeenCalledTimes(1);
});

it('shows the usual upload banner with consent', () => {
  setup(false);

  expect(screen.getByText('Uploading 2 receipts…')).toBeTruthy();
  expect(screen.queryByText(/needs your OK/)).toBeNull();
});

// L4: a queued import isn't labeled "Scanned receipt".
it.each([
  [undefined, 'Scanned receipt'],
  ['camera', 'Scanned receipt'],
  ['library', 'Imported photo'],
  ['pdf', 'Imported PDF'],
] as const)('labels a queued %s receipt "%s"', (source, label) => {
  render(
    <OfflineQueueSection
      pending={[{ ...queued, source }]}
      isConnected
      consentNeeded={false}
      onPressFailed={jest.fn()}
      onRetry={jest.fn()}
      onReviewConsent={jest.fn()}
    />,
  );

  expect(screen.getByText(label)).toBeTruthy();
});
