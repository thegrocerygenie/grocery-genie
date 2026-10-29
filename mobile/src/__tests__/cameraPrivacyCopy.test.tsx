/**
 * Simulator pass M7: receipt photos are uploaded and read on our servers, so
 * no screen may say they are processed on the device. The privacy policy
 * (features/settings/content/privacy.ts) is the source of truth.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react-native';

import OnboardingCamera from '../../app/onboarding/camera';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The screens read safe-area insets; the app root provides them, a bare render does not.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useCompleteOnboarding: () => ({ mutateAsync: jest.fn() }),
}));

const ON_DEVICE_CLAIM = /on[- ]device|processed locally|never leaves? your (phone|device)/i;

describe('Camera privacy copy', () => {
  it('the onboarding camera screen makes no on-device claim', () => {
    render(<OnboardingCamera />);

    expect(screen.queryByText(ON_DEVICE_CLAIM)).toBeNull();
    expect(
      screen.getByText(
        'Grocery Genie uses the camera only to scan receipts. Photos are sent securely to read your receipt, and you can delete them anytime.',
      ),
    ).toBeTruthy();
  });

  it('no user-facing string in the app claims photos stay on the device', () => {
    const root = path.resolve(__dirname, '../..');
    const files = [
      path.join(root, 'app.json'),
      ...sourceFiles(path.join(root, 'app')),
      ...sourceFiles(path.join(root, 'src')),
    ];

    const hits = files.flatMap((file) =>
      stringLiterals(fs.readFileSync(file, 'utf8'))
        .filter((s) => ON_DEVICE_CLAIM.test(s))
        .map((s) => `${path.relative(root, file)}: ${s}`),
    );

    expect(hits).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Quoted strings and JSX text: what a user can read. Comments are skipped. */
function stringLiterals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const quoted = [...code.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  const jsxText = [...code.matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim()).filter(Boolean);
  return [...quoted, ...jsxText];
}
