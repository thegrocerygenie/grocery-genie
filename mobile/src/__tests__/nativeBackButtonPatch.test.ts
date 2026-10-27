import { readFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * H3: on iOS 26+, react-native-screens 4.16 disables the native back button
 * when a pop starts and re-enables it only if the screen it lands on shows a
 * back button. Our root stack pops onto `(tabs)`, whose header is hidden, so
 * the next pushed screen (Trend, Top items, receipt detail) got a dead Back.
 * Upstream: software-mansion/react-native-screens#3294, fixed in 4.17.
 *
 * `patches/react-native-screens+4.16.0.patch` drops the disable. A Jest test
 * cannot drive a native back button, so this guards the patched source: it
 * fails if an install or upgrade brings the disable back.
 */
const screensRoot = dirname(require.resolve('react-native-screens/package.json'));
const stackSource = readFileSync(join(screensRoot, 'ios', 'RNSScreenStack.mm'), 'utf8');

function methodBody(signature: string): string | null {
  const start = stackSource.indexOf(signature);
  if (start === -1) return null;
  const open = stackSource.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < stackSource.length; i++) {
    if (stackSource[i] === '{') depth++;
    if (stackSource[i] === '}' && --depth === 0) return stackSource.slice(open, i + 1);
  }
  return null;
}

describe('native back button after a pop onto a screen with no header (H3)', () => {
  it('never disables the back button when a pop starts', () => {
    const shouldPopItem = methodBody(
      'navigationBar:(UINavigationBar *)navigationBar shouldPopItem:',
    );
    // 4.17+ removed the method; 4.16 keeps it, patched.
    if (shouldPopItem === null) return;
    expect(shouldPopItem).not.toMatch(/userInteractionEnabled\s*=\s*(false|NO)/);
  });

  it('still refuses a second pop while a transition runs', () => {
    const shouldPopItem = methodBody(
      'navigationBar:(UINavigationBar *)navigationBar shouldPopItem:',
    );
    if (shouldPopItem === null) return;
    expect(shouldPopItem).toContain('self.transitionCoordinator == nil');
  });
});
