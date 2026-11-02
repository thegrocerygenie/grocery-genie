/**
 * 12-analytics.md: every event carries the device type and app version. The
 * backend stores them from these headers on each request.
 */
import { apiClient } from '@/services/api';
import { scanReceipt } from '@/features/receipt-capture/services/receiptApi';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.3' } },
}));
jest.mock('expo-device', () => ({ modelId: 'iPhone16,2' }));

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  global.fetch = mockFetch as unknown as typeof fetch;
});

function sentHeaders(): Record<string, string> {
  return mockFetch.mock.calls[0][1].headers as Record<string, string>;
}

it('sends the app version and device type on API calls', async () => {
  await apiClient('/api/receipts');

  expect(sentHeaders()).toMatchObject({
    'X-App-Version': '1.0.3',
    'X-Device-Type': 'iPhone16,2',
  });
});

it('sends them on a scan upload too', async () => {
  await scanReceipt('file:///receipt.jpg', 'image/jpeg');

  expect(sentHeaders()).toMatchObject({
    'X-App-Version': '1.0.3',
    'X-Device-Type': 'iPhone16,2',
  });
});
