import { Stack } from 'expo-router';

// Each tab gets its own native stack so the screen's header (large title,
// Settings button) renders; the Tabs navigator itself hides headers.
export default function BudgetTabLayout() {
  return <Stack />;
}
