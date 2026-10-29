import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, springs, type } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/useAccessibilitySetting';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Reduce Motion: the ring fades in at its value instead of springing to it.
const REDUCED_FADE_MS = 250;
// The ring is a fixed size, so its center text grows only so far with Dynamic Type.
const CENTER_MAX_FONT_SCALE = 1.2;

interface BudgetRingProps {
  progress: number;
  label: string;
  sub?: string;
  size?: number;
  /** What VoiceOver reads for the whole ring, e.g. "$157 left of $400, 61 percent, 11 days left". */
  accessibilityLabel: string;
}

export function BudgetRing({
  progress,
  label,
  sub,
  size = 108,
  accessibilityLabel,
}: BudgetRingProps) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduceMotion = useReduceMotion();

  const animated = useSharedValue(0);
  const opacity = useSharedValue(reduceMotion ? 0 : 1);
  useEffect(() => {
    const target = Math.min(progress, 1);
    if (reduceMotion) {
      animated.value = target;
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: REDUCED_FADE_MS });
    } else {
      opacity.value = 1;
      animated.value = withSpring(target, springs.ring);
    }
  }, [progress, reduceMotion, animated, opacity]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - animated.value),
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const over = progress > 1;
  const ringColor = over ? colors.red : colors.tint;
  const percent = Math.round(progress * 100);

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.min(percent, 100),
        text: `${percent} percent`,
      }}
    >
      <Animated.View style={fadeStyle}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.iosFill3}
            strokeWidth={stroke}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            animatedProps={animatedProps}
          />
        </Svg>
      </Animated.View>
      <View style={styles.center} pointerEvents="none">
        <Text
          maxFontSizeMultiplier={CENTER_MAX_FONT_SCALE}
          style={[type.money, { fontSize: 18, color: ringColor }]}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            maxFontSizeMultiplier={CENTER_MAX_FONT_SCALE}
            style={[type.caption1, { color: colors.iosLabel2 }]}
          >
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
