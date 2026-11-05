import React, { useState } from 'react';
import { StyleSheet, Text, View, useColorScheme, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Polyline, Stop } from 'react-native-svg';

import { TINT_HEX, colors, fontScale, spacing, type } from '@/constants/theme';
import { formatMoney } from '@/utils/money';
import { PRICES_COPY } from '../constants';
import type { PricePoint } from '../types';
import { chartGeometry, monthTicks } from '../utils/priceTrend';

const HEIGHT = 140;
const INSET = 8;
const DOT_RADIUS = 3;
const MONTH_LABEL_WIDTH = 36;

interface PriceChartProps {
  points: PricePoint[];
  currency: string;
}

/**
 * PI-01 AC 2, AC 8: the line over a shaded area, as the design draws it,
 * with month labels under it and a dot for every purchase (the design dots
 * only the latest; AC 2 keeps them all). VoiceOver reads one summary instead
 * of each dot; the price list below has every value.
 */
export function PriceChart({ points, currency }: PriceChartProps) {
  const [width, setWidth] = useState(0);
  // A gradient stop takes only a string, not an iOS dynamic colour.
  const fill = useColorScheme() === 'dark' ? TINT_HEX.dark : TINT_HEX.light;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const geometry = chartGeometry(points, width, HEIGHT, INSET);
  const ticks = monthTicks(points, width, INSET);
  const money = (amount: number) => formatMoney(amount, currency);
  const latest = points[points.length - 1];
  const label = PRICES_COPY.chartLabel(
    points.length,
    money(geometry.low),
    money(geometry.high),
    latest ? money(latest.unit_price) : '',
  );
  const lastIndex = geometry.points.length - 1;
  const line = geometry.points.map((p) => `${p.x},${p.y}`).join(' ');
  const first = geometry.points[0];
  const last = geometry.points[lastIndex];
  const area = first && last ? `${first.x},${HEIGHT} ${line} ${last.x},${HEIGHT}` : '';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID="price-chart"
    >
      <View style={styles.plot} onLayout={onLayout} testID="price-plot">
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="price-area-fill" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor={fill} stopOpacity={0.18} />
                <Stop offset="1" stopColor={fill} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line
              x1={0}
              x2={width}
              y1={HEIGHT}
              y2={HEIGHT}
              stroke={colors.iosSeparator}
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Polygon points={area} fill="url(#price-area-fill)" testID="price-area" />
            <Polyline
              points={line}
              fill="none"
              stroke={colors.tint}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              testID="price-line"
            />
            {geometry.points.map((p, i) => (
              <Circle
                key={`${p.point.receipt_id}-${i}`}
                testID={`price-dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={i === lastIndex ? DOT_RADIUS + 1 : DOT_RADIUS}
                fill={i === lastIndex ? colors.tint : colors.iosBg2}
                stroke={colors.tint}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        ) : null}
        <View style={styles.months} testID="price-months">
          {ticks.map((t) => (
            <Text
              key={`${t.label}-${t.x}`}
              style={[styles.month, { left: monthLeft(t.x, width) }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontScale.compactChartLabelMax}
            >
              {t.label}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{money(geometry.high)}</Text>
        <Text style={styles.axisLabel}>{money(geometry.low)}</Text>
      </View>
    </View>
  );
}

/** A month label centred on its date, kept inside the plot. */
function monthLeft(x: number, width: number): number {
  return Math.min(Math.max(x - MONTH_LABEL_WIDTH / 2, 0), Math.max(width - MONTH_LABEL_WIDTH, 0));
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  plot: { flex: 1 },
  axis: { height: HEIGHT, justifyContent: 'space-between', paddingVertical: INSET - 7 },
  axisLabel: {
    ...type.caption2,
    color: colors.iosLabel2,
    fontVariant: ['tabular-nums'],
  },
  months: { height: 20, marginTop: spacing.xs },
  month: {
    ...type.caption2,
    position: 'absolute',
    width: MONTH_LABEL_WIDTH,
    textAlign: 'center',
    color: colors.iosLabel2,
  },
});
