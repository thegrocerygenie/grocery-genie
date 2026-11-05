/**
 * iOS only (AGENTS.md: "No Android-specific code or platform checks"). A
 * keyboard-avoiding view takes `behavior="padding"`, iOS's value, rather than
 * branching on Platform.OS. Reads the source of every screen and module.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'src'))];

describe('no platform checks', () => {
  it('gives every keyboard-avoiding view behavior="padding", with no Platform.OS branch', () => {
    const offenders = files
      .filter((file) => fs.readFileSync(file, 'utf8').includes('KeyboardAvoidingView'))
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${path.relative(ROOT, file)}:${i + 1}` }))
          .filter(({ line }) => /behavior=\{Platform\.OS/.test(line)),
      )
      .map(({ at }) => at);

    expect(offenders).toEqual([]);
  });
});
