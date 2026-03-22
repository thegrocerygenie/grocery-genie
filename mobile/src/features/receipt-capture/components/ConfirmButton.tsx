import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { strings } from '@/constants/strings';
import { borderRadius, colors, spacing, touchTarget, typography } from '@/constants/theme';

interface ConfirmButtonProps {
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ConfirmButton({ onPress, disabled, loading }: ConfirmButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = async () => {
    if (disabled || loading) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <View style={styles.wrapper}>
      <AnimatedPressable
        style={[styles.button, (disabled || loading) && styles.buttonDisabled, animatedStyle]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        accessibilityLabel={strings.review.confirmAndSave}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>{strings.review.confirmAndSave}</Text>
        )}
      </AnimatedPressable>
      {disabled && !loading && (
        <Text style={styles.disabledReason}>{strings.review.confirmDisabledReason}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.light.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.border,
  },
  button: {
    backgroundColor: colors.light.primary,
    minHeight: touchTarget.minHeight + 4,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.light.disabled,
  },
  buttonText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
  },
  disabledReason: {
    ...typography.caption,
    color: colors.light.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
