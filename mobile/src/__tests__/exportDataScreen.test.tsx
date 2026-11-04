/**
 * V11-P2: Settings → Export data. A Premium user picks JSON or CSV and gets
 * the iOS share sheet; a free user sees the upgrade prompt, never an error (D2).
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ExportDataScreen from '../../app/settings/export-data';
import { ApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const mockFetchMe = jest.fn();
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: () => mockFetchMe(),
}));

const mockDownload = jest.fn();
const mockShare = jest.fn();
jest.mock('@/features/settings/services/exportApi', () => ({
  downloadExport: (...a: unknown[]) => mockDownload(...a),
  shareExport: (...a: unknown[]) => mockShare(...a),
}));

const mockPaywall = jest.fn(() => null);

function renderScreen() {
  renderRouter(
    {
      _layout: () => {
        const { Stack } = jest.requireActual('expo-router');
        return (
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <Stack />
          </QueryClientProvider>
        );
      },
      'settings/export-data': ExportDataScreen,
      paywall: mockPaywall,
    },
    { initialUrl: '/settings/export-data' },
  );
}

const premiumRequired = new ApiError(403, {
  detail: { code: 'premium_required', feature: 'data_export' },
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ accessToken: 'token' });
  mockFetchMe.mockResolvedValue({ id: 'u-1', is_premium: true });
  mockDownload.mockResolvedValue('file:///cache/export.json');
  mockShare.mockResolvedValue(undefined);
});

describe('Export data', () => {
  it('says what is exported and offers JSON and CSV', async () => {
    renderScreen();

    expect(await screen.findByLabelText('Export data')).toBeTruthy();
    expect(screen.getByText(/receipts, line items, budgets and price history/i)).toBeTruthy();
    expect(screen.getByLabelText('File format')).toBeTruthy();
  });

  it('exports JSON by default and opens the share sheet', async () => {
    renderScreen();
    fireEvent.press(await screen.findByLabelText('Export data'));

    await waitFor(() => expect(mockShare).toHaveBeenCalledWith('file:///cache/export.json'));
    expect(mockDownload).toHaveBeenCalledWith('json');
  });

  it('exports CSV when CSV is chosen', async () => {
    renderScreen();
    const control = await screen.findByLabelText('File format');
    fireEvent(control, 'onChange', { nativeEvent: { selectedSegmentIndex: 1 } });
    fireEvent.press(screen.getByLabelText('Export data'));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('csv'));
  });

  it('a free user sees the upgrade prompt, which opens the paywall', async () => {
    mockFetchMe.mockResolvedValue({ id: 'u-1', is_premium: false });
    renderScreen();

    expect(await screen.findByTestId('premium-upgrade-prompt')).toBeTruthy();
    expect(screen.queryByLabelText('Export data')).toBeNull();
    fireEvent.press(screen.getByLabelText('See Premium'));
    await waitFor(() => expect(mockPaywall).toHaveBeenCalled());
  });

  it('a premium_required answer turns into the upgrade prompt, not an error', async () => {
    mockDownload.mockRejectedValue(premiumRequired);
    renderScreen();
    fireEvent.press(await screen.findByLabelText('Export data'));

    expect(await screen.findByTestId('premium-upgrade-prompt')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('any other failure says so inline and can be tried again', async () => {
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    renderScreen();
    fireEvent.press(await screen.findByLabelText('Export data'));

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Export data'));
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
  });
});
