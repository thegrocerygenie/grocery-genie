/**
 * Leaf Drop logo: the app icon and splash use the PNGs exported from Claude
 * Design (Logo Lab v2, Direction A) into assets/brand/. The splash vein is drawn
 * in the paper or ink color, so each splash background must equal it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..', '..');
const { expo } = JSON.parse(readFileSync(join(mobileRoot, 'app.json'), 'utf8'));

// Only the expo-splash-screen plugin honours imageWidth; ios.splash stretches the image to the screen.
const splashPlugin = expo.plugins.find(
  (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
)?.[1];

const PAPER = '#FBF8F1';
const INK = '#1B1A15';

describe('App icon', () => {
  it('uses the Paper tile in light mode and the Ink tile in dark mode', () => {
    expect(expo.ios.icon).toEqual({
      light: './assets/brand/app-icon-light.png',
      dark: './assets/brand/app-icon-dark.png',
    });
  });

  it('falls back to the Paper tile where only one icon is read', () => {
    expect(expo.icon).toBe('./assets/brand/app-icon-light.png');
  });
});

describe('Splash screen', () => {
  it('shows the light mark on paper, and the dark mark on ink in dark mode', () => {
    expect(splashPlugin).toMatchObject({
      image: './assets/brand/logo-mark-light.png',
      backgroundColor: PAPER,
      dark: { image: './assets/brand/logo-mark-dark.png', backgroundColor: INK },
    });
  });

  it('draws the mark at a fixed width, not stretched to the screen', () => {
    expect(splashPlugin.imageWidth).toBe(120);
  });

  it('has one splash config, so a legacy key cannot override it', () => {
    expect(expo.splash).toBeUndefined();
    expect(expo.ios.splash).toBeUndefined();
  });
});

it('points only at files that exist', () => {
  const paths = [
    expo.icon,
    expo.ios.icon.light,
    expo.ios.icon.dark,
    splashPlugin.image,
    splashPlugin.dark.image,
  ];
  for (const path of paths) expect(existsSync(join(mobileRoot, path))).toBe(true);
});
