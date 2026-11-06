/**
 * iOS only (AGENTS.md: "No Android-specific code or platform checks"). A
 * keyboard-avoiding view takes `behavior="padding"`, iOS's value, and no
 * screen or module branches on Platform.OS. Reads the source of every screen
 * and module.
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

function linesMatching(pattern: RegExp, only: (text: string) => boolean = () => true): string[] {
  return files.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    if (!only(text)) return [];
    return text
      .split('\n')
      .map((line, i) => ({ line, at: `${path.relative(ROOT, file)}:${i + 1}` }))
      .filter(({ line }) => pattern.test(line))
      .map(({ at }) => at);
  });
}

describe('no platform checks', () => {
  it('gives every keyboard-avoiding view behavior="padding", with no Platform.OS branch', () => {
    const offenders = linesMatching(/behavior=\{Platform\.OS/, (text) =>
      text.includes('KeyboardAvoidingView'),
    );

    expect(offenders).toEqual([]);
  });

  it('branches on Platform.OS nowhere in app/ or src/', () => {
    expect(linesMatching(/Platform\.OS\b/)).toEqual([]);
  });
});
