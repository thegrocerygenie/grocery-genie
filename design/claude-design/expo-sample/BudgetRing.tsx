/**
 * BudgetRing — Activity-ring-style circular progress.
 *
 * Pure SVG (react-native-svg) + Reanimated for the spring fill.
 * Same physics as iOS Activity rings: stiff spring, slight overshoot.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
} from 'react-native-reanimated';
import { colors, type, springs } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  /** 0–1+. >1 means over budget; ring colors red. */
  progress: number;
  /** Center label e.g. "$157" */
  label: string;
  /** Caption under label e.g. "left · 11d" */
  sub?: string;
};

export function BudgetRing({ size = 108, progress, label, sub }: Props) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const animated = useSharedValue(0);
  useEffect(() => {
    animated.value = withSpring(Math.min(progress, 1), springs.ring);
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - animated.value),
  }));

  const over = progress > 1;
  const ringColor = over ? colors.red : colors.tint;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
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
      <View style={styles.center} pointerEvents="none">
        <Text style={[type.money, { fontSize: 18, color: ringColor }]}>{label}</Text>
        {sub ? (
          <Text style={[type.caption1, { color: colors.iosLabel2 }]}>{sub}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
