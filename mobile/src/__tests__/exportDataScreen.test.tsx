/**
 * V11-P2, PREM-04: Settings → Export data. A Premium user picks a range
 * (Last 12 months first), a format (CSV first), what to include, and taps
 * "Export N receipts" with the server's count; the file opens in the iOS
 * share sheet. A free user sees the upgrade prompt, never an error (D2).
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ExportDataScreen from '../../app/settings/export-data';
import { EXPORT_STRINGS as S } from '@/features/settings/content/export';
import type { ExportRequest } from '@/features/settings/services/exportApi';
import { addMonths, monthOf, rangeDates, type Month } from '@/features/settings/utils/exportRange';
import { ApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const mockFetchMe = jest.fn();
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: () => mockFetchMe(),
}));

const mockDownload = jest.fn();
const mockShare = jest.fn();
const mockSummary = jest.fn();
jest.mock('@/features/settings/services/exportApi', () => ({
  isExportBusy: jest.requireActual('@/features/settings/services/exportApi').isExportBusy,
  downloadExport: (...a: unknown[]) => mockDownload(...a),
  shareExport: (...a: unknown[]) => mockShare(...a),
  fetchExportSummary: (...a: unknown[]) => mockSummary(...a),
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

function label(m: Month): string {
  return `${S.monthsShort[m.month - 1]} ${m.year}`;
}

const thisMonth = monthOf(new Date());
const last12 = { from: addMonths(thisMonth, -11), to: thisMonth };
const last12Dates = rangeDates(last12.from, last12.to);

async function exportButton(name: string | RegExp = /^Export \d/) {
  return screen.findByRole('button', { name });
}

function lastRequest(): ExportRequest {
  return mockDownload.mock.calls.at(-1)?.[0] as ExportRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ accessToken: 'token' });
  mockFetchMe.mockResolvedValue({ id: 'u-1', is_premium: true });
  mockDownload.mockResolvedValue('file:///cache/export.zip');
  mockShare.mockResolvedValue(undefined);
  mockSummary.mockResolvedValue({ receipt_count: 1247 });
});

describe('Export data', () => {
  it('opens with the intro card (PREM-04 AC 8)', async () => {
    renderScreen();

    expect(
      await screen.findByText(
        'Export your receipts, prices and budgets for the dates you choose. Yours forever.',
      ),
    ).toBeTruthy();
  });

  it('starts on Last 12 months, with From and To months (AC 1)', async () => {
    renderScreen();

    expect(await screen.findByLabelText('Period: Last 12 months')).toBeTruthy();
    expect(screen.getByLabelText(`From: ${label(last12.from)}`)).toBeTruthy();
    expect(screen.getByLabelText(`To: ${label(last12.to)}`)).toBeTruthy();
    await waitFor(() => expect(mockSummary).toHaveBeenCalledWith(last12Dates.from, last12Dates.to));
  });

  it('offers All time, This year and Custom; All time sends no dates (AC 1)', async () => {
    renderScreen();
    fireEvent.press(await screen.findByLabelText('Period: Last 12 months'));
    const options = screen
      .getAllByRole('button')
      .filter((b) => b.props.accessibilityState?.selected !== undefined);
    expect(options.map((o) => o.props.accessibilityLabel)).toEqual([
      'Last 12 months',
      'All time',
      'This year',
      'Custom',
    ]);
    expect(options[0].props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByRole('button', { name: 'All time' }));

    expect(await screen.findByLabelText('Period: All time')).toBeTruthy();
    expect(screen.getByLabelText('From: First receipt')).toBeTruthy();
    await waitFor(() => expect(mockSummary).toHaveBeenCalledWith(null, null));
    fireEvent.press(await exportButton());
    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    expect(lastRequest()).toMatchObject({ from: null, to: null });
  });

  it('This year runs January to December', async () => {
    renderScreen();
    fireEvent.press(await screen.findByLabelText('Period: Last 12 months'));
    fireEvent.press(screen.getByRole('button', { name: 'This year' }));

    const year = thisMonth.year;
    expect(await screen.findByLabelText(`From: Jan ${year}`)).toBeTruthy();
    expect(screen.getByLabelText(`To: Dec ${year}`)).toBeTruthy();
    await waitFor(() => expect(mockSummary).toHaveBeenCalledWith(`${year}-01-01`, `${year}-12-31`));
  });

  it('picking a month makes the period Custom; From after To is refused inline (EC-PREM 4)', async () => {
    renderScreen();
    fireEvent.press(await screen.findByLabelText(`To: ${label(last12.to)}`));
    fireEvent.press(screen.getByRole('button', { name: 'Previous year' }));
    fireEvent.press(
      screen.getByRole('button', { name: `${S.monthsLong[0]} ${thisMonth.year - 1}` }),
    );

    expect(await screen.findByLabelText('Period: Custom')).toBeTruthy();
    expect(screen.getByLabelText(`To: Jan ${thisMonth.year - 1}`)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Export' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockSummary).not.toHaveBeenCalledWith(expect.anything(), `${thisMonth.year - 1}-01-31`);
  });

  it('lists CSV first and selected, then JSON and PDF report (AC 2)', async () => {
    renderScreen();
    const radios = await screen.findAllByRole('radio');

    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      'CSV, Spreadsheet-ready',
      'JSON, For developers',
      'PDF report, Formatted summary',
    ]);
    expect(radios[0].props.accessibilityState).toMatchObject({ checked: true });
  });

  it('exports CSV of the last 12 months by default and opens the share sheet', async () => {
    renderScreen();
    fireEvent.press(await exportButton('Export 1,247 receipts'));

    await waitFor(() => expect(mockShare).toHaveBeenCalledWith('file:///cache/export.zip'));
    expect(lastRequest()).toEqual({
      format: 'csv',
      from: last12Dates.from,
      to: last12Dates.to,
      includes: ['receipts', 'prices', 'budgets'],
    });
  });

  it('exports the PDF report when it is chosen', async () => {
    renderScreen();
    fireEvent.press(await screen.findByRole('radio', { name: 'PDF report, Formatted summary' }));
    fireEvent.press(await exportButton());

    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    expect(lastRequest().format).toBe('pdf');
  });

  it('has the Includes switches, receipt images off; at least one stays on (AC 3)', async () => {
    renderScreen();
    const images = await screen.findByLabelText('Receipt images');

    expect(screen.getByLabelText('Receipts & line items').props.value).toBe(true);
    expect(screen.getByLabelText('Price history').props.value).toBe(true);
    expect(screen.getByLabelText('Categories & budgets').props.value).toBe(true);
    expect(images.props.value).toBe(false);

    fireEvent(images, 'valueChange', true);
    fireEvent(screen.getByLabelText('Receipts & line items'), 'valueChange', false);
    fireEvent(screen.getByLabelText('Price history'), 'valueChange', false);
    fireEvent(screen.getByLabelText('Categories & budgets'), 'valueChange', false);
    // Receipt images is the only one on: it cannot be turned off.
    expect(screen.getByLabelText('Receipt images').props.disabled).toBe(true);

    fireEvent.press(await exportButton('Export data'));
    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    expect(lastRequest().includes).toEqual(['images']);
  });

  it('reads "Export N receipts" from the server count (AC 4)', async () => {
    mockSummary.mockResolvedValue({ receipt_count: 1 });
    renderScreen();

    expect(await exportButton('Export 1 receipt')).toBeTruthy();
  });

  it('with no receipts in the range the button is off (AC 4, EC-PREM 4)', async () => {
    mockSummary.mockResolvedValue({ receipt_count: 0 });
    renderScreen();

    const button = await exportButton('No receipts in this range');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('with Receipts & line items off the button names no receipt count', async () => {
    mockSummary.mockResolvedValue({ receipt_count: 0 });
    renderScreen();
    await exportButton('No receipts in this range');
    fireEvent(screen.getByLabelText('Receipts & line items'), 'valueChange', false);

    // Categories & budgets are not cut by the range: still something to export.
    const button = await exportButton('Export data');
    expect(button.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent(screen.getByLabelText('Categories & budgets'), 'valueChange', false);
    // Only Price history is left and the range has no receipts: nothing to export.
    expect((await exportButton('Export data')).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('a 429 (too many exports, or one already running) says to try again later', async () => {
    mockDownload.mockRejectedValueOnce(new ApiError(429, { detail: { code: 'export_busy' } }));
    renderScreen();
    fireEvent.press(await exportButton());

    expect(await screen.findByText(S.busy)).toBeTruthy();
    expect(screen.queryByText(S.failed)).toBeNull();
    expect(screen.queryByTestId('premium-upgrade-prompt')).toBeNull();
  });

  it('a free user sees the upgrade prompt, which opens the paywall', async () => {
    mockFetchMe.mockResolvedValue({ id: 'u-1', is_premium: false });
    renderScreen();

    expect(await screen.findByTestId('premium-upgrade-prompt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Export/ })).toBeNull();
    expect(mockSummary).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('See Premium'));
    await waitFor(() => expect(mockPaywall).toHaveBeenCalled());
  });

  it('a premium_required answer turns into the upgrade prompt, not an error', async () => {
    mockDownload.mockRejectedValue(premiumRequired);
    renderScreen();
    fireEvent.press(await exportButton());

    expect(await screen.findByTestId('premium-upgrade-prompt')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('a premium_required count (Premium lapsed) shows the upgrade prompt too', async () => {
    mockSummary.mockRejectedValue(premiumRequired);
    renderScreen();

    expect(await screen.findByTestId('premium-upgrade-prompt')).toBeTruthy();
  });

  it('any other failure says so inline and can be tried again', async () => {
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    renderScreen();
    fireEvent.press(await exportButton());

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.press(await exportButton());
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
  });

  it('a failed count still lets the export run', async () => {
    mockSummary.mockRejectedValue(new Error('offline'));
    renderScreen();

    fireEvent.press(await exportButton('Export'));
    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
  });
});
