/**
 * Dark mode: every color token adapts to the system appearance. Tokens are iOS
 * semantic colors (PlatformColor) or light/dark pairs (DynamicColorIOS), so the
 * static StyleSheets across the app switch with no per-screen code.
 */
import fs from 'fs';
import path from 'path';

import { colors, type } from '../theme';

type Color = { semantic?: string[]; dynamic?: { light: string; dark: string } };

function tokens(obj: object, prefix = ''): [string, Color][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !('semantic' in v) && !('dynamic' in v)
      ? tokens(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, v as Color]],
  );
}

describe('color tokens', () => {
  it.each(tokens(colors))('%s adapts to dark mode', (_name, value) => {
    expect(Boolean(value?.semantic || value?.dynamic)).toBe(true);
  });

  it('maps the iOS tokens to the matching system colors', () => {
    expect(colors.iosBg).toEqual({ semantic: ['systemGroupedBackground'] });
    expect(colors.iosBg2).toEqual({ semantic: ['secondarySystemGroupedBackground'] });
    expect(colors.iosLabel).toEqual({ semantic: ['label'] });
    expect(colors.iosLabel2).toEqual({ semantic: ['secondaryLabel'] });
    expect(colors.iosSeparator).toEqual({ semantic: ['separator'] });
    expect(colors.red).toEqual({ semantic: ['systemRed'] });
    expect(colors.cat.groceries).toEqual({ semantic: ['systemGreen'] });
  });

  it('keeps the brand green and uses the design dark value (tokens-v2: --gg-tint)', () => {
    expect(colors.tint).toEqual({ dynamic: { light: '#1F7A4A', dark: '#34D17A' } });
  });
});

describe('type styles', () => {
  // React Native's Text defaults to black, so a type style with no color shows
  // black text on dark backgrounds. Each carries the adaptive label color.
  it.each(Object.entries(type))('%s has an adaptive text color', (_name, style) => {
    expect(style.color).toEqual(colors.iosLabel);
  });
});

describe('no light-only backgrounds in screens', () => {
  // A literal white or light gray background stays light in dark mode. Use a
  // token. The camera screen is black in both appearances on purpose.
  // A line marked "fixed:" stays light on purpose (camera UI, a brand mark).
  const LIGHT_ONLY =
    /backgroundColor:\s*['"](#fff\b|#ffffff|#F2F2F7|white|rgba\(255,\s*255,\s*255,\s*(0\.[5-9]|1))/i;

  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });
  }

  it('finds none', () => {
    const root = path.resolve(__dirname, '../../..');
    const offenders = [...sources(path.join(root, 'app')), ...sources(path.join(root, 'src'))]
      .filter((f) =>
        fs
          .readFileSync(f, 'utf8')
          .split('\n')
          .some((line) => LIGHT_ONLY.test(line) && !line.includes('fixed:')),
      )
      .map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});
