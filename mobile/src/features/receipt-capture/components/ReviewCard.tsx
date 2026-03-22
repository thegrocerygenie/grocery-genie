import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { borderRadius, colors, shadows, spacing } from '@/constants/theme';

interface ReviewCardProps {
  children: ReactNode;
  style?: ViewStyle;
  lowConfidence?: boolean;
}

export function ReviewCard({ children, style, lowConfidence = false }: ReviewCardProps) {
  return (
    <View
      style={[
        styles.card,
        lowConfidence && styles.lowConfidence,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  lowConfidence: {
    borderLeftWidth: 3,
    borderLeftColor: colors.light.warning,
  },
});
