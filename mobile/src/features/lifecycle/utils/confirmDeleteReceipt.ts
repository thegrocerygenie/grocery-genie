import { Alert } from 'react-native';

/**
 * Asks before a receipt moves to Recently Deleted. History (long-press and
 * swipe) and the receipt detail screen share it, so they say the same thing.
 */
export function confirmDeleteReceipt(label: string, onConfirm: () => void): void {
  Alert.alert(
    'Delete receipt?',
    `${label} will be moved to Recently Deleted (30 days to restore).`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ],
  );
}
