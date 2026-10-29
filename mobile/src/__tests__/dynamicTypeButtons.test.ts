/**
 * Dynamic Type: a button with a fixed height clips its label at the larger
 * accessibility sizes (design motion.jsx: "Test up to AX5"). Buttons grow from
 * a 50pt minimum instead. Jest can't render at AX5, so this reads the source.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('Dynamic Type button heights', () => {
  it('gives no button a fixed 50pt height', () => {
    const offenders = [
      ...sourceFiles(path.join(ROOT, 'app')),
      ...sourceFiles(path.join(ROOT, 'src')),
    ]
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${path.relative(ROOT, file)}:${i + 1}` }))
          .filter(({ line }) => /^\s*height: 50,/.test(line)),
      )
      .map(({ at }) => at);

    expect(offenders).toEqual([]);
  });
});
