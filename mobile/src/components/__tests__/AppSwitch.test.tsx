/**
 * F7 (Simulator pass 2026-11-06, decided 2026-11-07): every switch in the app
 * is brand green, as the design draws it, not iOS system green. One component
 * holds the colour, so no screen can drift back to system green.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Switch } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { AppSwitch } from '../AppSwitch';
import { colors, TINT_HEX } from '@/constants/theme';

const ROOT = path.resolve(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('AppSwitch (F7)', () => {
  it('draws its on track in the brand green, with the system fill when off', () => {
    render(<AppSwitch value onValueChange={() => {}} accessibilityLabel="Alerts" />);
    const native = screen.UNSAFE_getByType(Switch);
    expect(native.props.trackColor).toEqual({ false: colors.iosFill1, true: colors.tint });
    expect(native.props.ios_backgroundColor).toBe(colors.iosFill1);
    expect(native.props.accessibilityLabel).toBe('Alerts');
  });

  it('passes value, disabled and changes through', () => {
    const onChange = jest.fn();
    render(<AppSwitch value={false} disabled onValueChange={onChange} accessibilityLabel="x" />);
    const native = screen.UNSAFE_getByType(Switch);
    expect(native.props.value).toBe(false);
    expect(native.props.disabled).toBe(true);
    native.props.onValueChange(true);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps the on track at 3:1 or more against the card, in light and dark (WCAG 1.4.11)', () => {
    // secondarySystemGroupedBackground: white in light, #1C1C1E in dark.
    expect(contrast(TINT_HEX.light, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast(TINT_HEX.dark, '#1C1C1E')).toBeGreaterThanOrEqual(3);
  });

  it('is the only place the app renders a native Switch', () => {
    const offenders = [
      ...sourceFiles(path.join(ROOT, 'app')),
      ...sourceFiles(path.join(ROOT, 'src')),
    ]
      .filter((file) => !file.endsWith(path.join('components', 'AppSwitch.tsx')))
      .filter((file) => /<Switch\b/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
