import { renderHook } from '@testing-library/react-native';

jest.unmock('@/hooks/useTimeZoneSync');
// eslint-disable-next-line import/first
import { useTimeZoneSync } from '@/hooks/useTimeZoneSync';

let mockProfile: { timezone: string } | undefined;
const mockMutate = jest.fn();
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useMe: () => ({ data: mockProfile }),
  useUpdatePreferences: () => ({ mutate: mockMutate }),
}));
jest.mock('expo-localization', () => ({
  getCalendars: () => [{ timeZone: 'America/New_York' }],
}));

beforeEach(() => mockMutate.mockReset());

it("saves the iPhone's time zone when the profile has another", () => {
  mockProfile = { timezone: 'UTC' };
  renderHook(() => useTimeZoneSync());

  expect(mockMutate).toHaveBeenCalledWith({ timezone: 'America/New_York' });
});

it('does nothing when they match', () => {
  mockProfile = { timezone: 'America/New_York' };
  renderHook(() => useTimeZoneSync());

  expect(mockMutate).not.toHaveBeenCalled();
});

it('waits for the profile', () => {
  mockProfile = undefined;
  renderHook(() => useTimeZoneSync());

  expect(mockMutate).not.toHaveBeenCalled();
});
