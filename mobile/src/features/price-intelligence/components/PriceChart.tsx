import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { colors, spacing, type } from '@/constants/theme';
import { formatMoney } from '@/utils/money';
import { PRICES_COPY } from '../constants';
import type { PricePoint } from '../types';
import { chartGeometry } from '../utils/priceTrend';

const HEIGHT = 160;
const INSET = 10;
const DOT_RADIUS = 4;

interface PriceChartProps {
  points: PricePoint[];
  currency: string;
}

/**
 * PI-01 AC 2: a line chart with a dot per purchase. VoiceOver reads one
 * summary instead of each dot; the price list below has every value.
 */
export function PriceChart({ points, currency }: PriceChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const geometry = chartGeometry(points, width, HEIGHT, INSET);
  const money = (amount: number) => formatMoney(amount, currency);
  const latest = points[points.length - 1];
  const label = PRICES_COPY.chartLabel(
    points.length,
    money(geometry.low),
    money(geometry.high),
    latest ? money(latest.unit_price) : '',
  );
  const lastIndex = geometry.points.length - 1;

  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID="price-chart"
    >
      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{money(geometry.high)}</Text>
        <Text style={styles.axisLabel}>{money(geometry.low)}</Text>
      </View>
      <View style={styles.plot} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Line
              x1={0}
              x2={width}
              y1={INSET}
              y2={INSET}
              stroke={colors.iosSeparator}
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Line
              x1={0}
              x2={width}
              y1={HEIGHT - INSET}
              y2={HEIGHT - INSET}
              stroke={colors.iosSeparator}
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Polyline
              points={geometry.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.tint}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {geometry.points.map((p, i) => (
              <Circle
                key={`${p.point.receipt_id}-${i}`}
                cx={p.x}
                cy={p.y}
                r={i === lastIndex ? DOT_RADIUS + 1.5 : DOT_RADIUS}
                fill={i === lastIndex ? colors.tint : colors.iosBg2}
                stroke={colors.tint}
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', gap: spacing.sm, height: HEIGHT },
  axis: {
    justifyContent: 'space-between',
    paddingVertical: INSET - 7,
  },
  axisLabel: {
    ...type.caption2,
    color: colors.iosLabel2,
    fontVariant: ['tabular-nums'],
  },
  plot: { flex: 1, height: HEIGHT },
});
