import { useNotificationStore } from '../notificationStore';

beforeEach(() => {
  useNotificationStore.setState({
    preferences: {
      fiftyPercent: false,
      eightyPercent: true,
      hundredPercent: true,
      weeklySummaryEnabled: true,
      weeklySummaryDay: 0,
    },
  });
});

describe('notificationStore', () => {
  it('has correct default preferences', () => {
    const { preferences } = useNotificationStore.getState();
    expect(preferences.fiftyPercent).toBe(false);
    expect(preferences.eightyPercent).toBe(true);
    expect(preferences.hundredPercent).toBe(true);
    expect(preferences.weeklySummaryEnabled).toBe(true);
    expect(preferences.weeklySummaryDay).toBe(0);
  });

  it('sets threshold', () => {
    useNotificationStore.getState().setThreshold('fiftyPercent', true);
    expect(useNotificationStore.getState().preferences.fiftyPercent).toBe(true);
  });

  it('sets weekly summary enabled', () => {
    useNotificationStore.getState().setWeeklySummaryEnabled(false);
    expect(useNotificationStore.getState().preferences.weeklySummaryEnabled).toBe(false);
  });

  it('sets weekly summary day', () => {
    useNotificationStore.getState().setWeeklySummaryDay(3); // Wednesday
    expect(useNotificationStore.getState().preferences.weeklySummaryDay).toBe(3);
  });

  it('preserves other preferences when setting one', () => {
    useNotificationStore.getState().setThreshold('fiftyPercent', true);
    const prefs = useNotificationStore.getState().preferences;
    expect(prefs.eightyPercent).toBe(true);
    expect(prefs.hundredPercent).toBe(true);
    expect(prefs.weeklySummaryEnabled).toBe(true);
  });
});
