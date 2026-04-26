import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, springs, type } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface BudgetRingProps {
  progress: number;
  label: string;
  sub?: string;
  size?: number;
}

export function BudgetRing({ progress, label, sub, size = 108 }: BudgetRingProps) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const animated = useSharedValue(0);
  useEffect(() => {
    animated.value = withSpring(Math.min(progress, 1), springs.ring);
  }, [progress, animated]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - animated.value),
  }));

  const over = progress > 1;
  const ringColor = over ? colors.red : colors.tint;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
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
      <View style={styles.center} pointerEvents="none">
        <Text style={[type.money, { fontSize: 18, color: ringColor }]}>{label}</Text>
        {sub ? <Text style={[type.caption1, { color: colors.iosLabel2 }]}>{sub}</Text> : null}
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
