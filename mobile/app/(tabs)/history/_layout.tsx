import { Stack } from 'expo-router';

// Each tab gets its own native stack so the screen's header (large title,
// search bar, add-receipt button) renders; the Tabs navigator hides headers.
export default function HistoryTabLayout() {
  return <Stack />;
}
