import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';

interface QualityWarning {
  type: 'blur' | 'low_light' | 'resolution';
  message: string;
}

interface QualityBannerProps {
  warnings: QualityWarning[];
}

export function QualityBanner({ warnings }: QualityBannerProps) {
  if (warnings.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
      {warnings.map((warning) => (
        <View key={warning.type} style={styles.banner}>
          <Text style={styles.icon}>⚠</Text>
          <Text style={styles.text}>{warning.message}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.light.warningLight,
    borderWidth: 1,
    borderColor: colors.light.warning,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  icon: {
    marginRight: spacing.sm,
    fontSize: 16,
  },
  text: {
    ...typography.caption,
    color: colors.light.textPrimary,
    flex: 1,
  },
});
