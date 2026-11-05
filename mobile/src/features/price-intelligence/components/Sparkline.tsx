import React from 'react';
import { type ColorValue } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

interface SparklineProps {
  prices: number[];
  color: ColorValue;
  width?: number;
  height?: number;
}

/** The item's recent prices as a small line (PI-03 AC 5). Decorative: the row reads the numbers. */
export function Sparkline({ prices, color, width = 120, height = 20 }: SparklineProps) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pad = 2;
  const points = prices
    .map((p, i) => {
      const x = pad + (i / (prices.length - 1)) * (width - pad * 2);
      // A flat line sits in the middle.
      const y = max === min ? height / 2 : pad + (1 - (p - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <Svg width={width} height={height} testID="price-alert-sparkline" accessibilityElementsHidden>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
