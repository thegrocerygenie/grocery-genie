/**
 * DoD boxes 13 and 14: an app-wide accessibility check on every screen and
 * component, not only the ones a test happens to render.
 *
 * It parses each .tsx file under app/ and src/ and checks every Pressable,
 * TextInput and Switch:
 * - name: an accessibilityLabel (or aria-label / accessibilityLabelledBy), or,
 *   for a Pressable, a Text inside it, which VoiceOver reads as its name;
 * - role: a Pressable sets accessibilityRole (TextInput and Switch have one);
 * - size (Apple HIG 44pt): a Pressable has hitSlop, or a style in its file's
 *   StyleSheet with minHeight or height of at least 44 (a literal or the
 *   touchTarget token), and no width or minWidth below 44;
 * - nesting: a Pressable VoiceOver can reach holds no other control. iOS
 *   reads an accessible view as one element, so the controls inside it
 *   can't be reached. A wrapper that only catches taps (a sheet's backdrop)
 *   sets accessible={false}.
 *
 * An element with accessible={false} is skipped: VoiceOver never reaches it.
 * An element that spreads props ({...rest}) passes the name and role checks,
 * since its caller sets them. The size check reads styles only from the
 * file's own StyleSheet.create, so a style passed in from elsewhere fails:
 * add hitSlop or a touch-target style in the file.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = ['app', 'src'];
const MIN_TARGET = 44;
const NAME_PROPS = ['accessibilityLabel', 'aria-label', 'accessibilityLabelledBy'];
const ROLE_PROPS = ['accessibilityRole', 'role'];
const CHECKED = new Set(['Pressable', 'TextInput', 'Switch']);

interface Problem {
  file: string;
  line: number;
  element: string;
  rule: 'name' | 'role' | 'size' | 'nesting';
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [full] : [];
  });
}

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function attributes(node: Opening) {
  const byName = new Map<string, ts.JsxAttribute>();
  let spread = false;
  for (const prop of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(prop)) spread = true;
    else byName.set(prop.name.getText(), prop);
  }
  return { byName, spread };
}

function isAccessibleFalse(attr: ts.JsxAttribute | undefined): boolean {
  const init = attr?.initializer;
  return !!init && ts.isJsxExpression(init) && init.expression?.kind === ts.SyntaxKind.FalseKeyword;
}

/** Whether a tag inside node's children (not node itself) matches. */
function containsTag(node: ts.JsxElement, matches: (tag: string) => boolean): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
      if (matches(child.tagName.getText())) found = true;
    }
    ts.forEachChild(child, visit);
  };
  node.children.forEach(visit);
  return found;
}

const containsText = (node: ts.JsxElement) => containsTag(node, (tag) => /Text$/.test(tag));
// TextInput ends in "Text" too, but it is a control, not a label.
const containsControl = (node: ts.JsxElement) => containsTag(node, (tag) => CHECKED.has(tag));

/** Style objects declared with StyleSheet.create in this file, by key. */
function styleSheets(file: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const styles = new Map<string, ts.ObjectLiteralExpression>();
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === 'StyleSheet.create' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const prop of node.arguments[0].properties) {
        if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
          styles.set(prop.name.getText(file), prop.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return styles;
}

/** A dimension value: a number, a touchTarget token (44), or unknown. */
function dimension(expr: ts.Expression): number | null {
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (/touchTarget\.(minHeight|minWidth)/.test(expr.getText())) return MIN_TARGET;
  return null;
}

function objectMeetsTarget(obj: ts.ObjectLiteralExpression): {
  tall: boolean;
  narrow: boolean;
} {
  let tall = false;
  let narrow = false;
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop) && /touchTarget/.test(prop.expression.getText())) {
      tall = true;
      continue;
    }
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText();
    const value = dimension(prop.initializer);
    if ((key === 'minHeight' || key === 'height') && value !== null && value >= MIN_TARGET) {
      tall = true;
    }
    if ((key === 'width' || key === 'minWidth') && value !== null && value < MIN_TARGET) {
      narrow = true;
    }
  }
  return { tall, narrow };
}

function meetsTarget(
  styleAttr: ts.JsxAttribute | undefined,
  sheets: Map<string, ts.ObjectLiteralExpression>,
): boolean {
  if (!styleAttr?.initializer) return false;
  let tall = false;
  let narrow = false;
  const visit = (node: ts.Node) => {
    let obj: ts.ObjectLiteralExpression | undefined;
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      obj = sheets.get(node.name.text);
    } else if (ts.isObjectLiteralExpression(node)) {
      obj = node;
    }
    if (obj) {
      const result = objectMeetsTarget(obj);
      tall ||= result.tall;
      narrow ||= result.narrow;
    }
    ts.forEachChild(node, visit);
  };
  visit(styleAttr.initializer);
  return tall && !narrow;
}

function check(filePath: string, text = fs.readFileSync(filePath, 'utf8')): Problem[] {
  const file = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sheets = styleSheets(file);
  const problems: Problem[] = [];
  const relative = path.relative(ROOT, filePath);

  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : undefined;
    const tag = opening?.tagName.getText(file);
    if (opening && tag && CHECKED.has(tag)) {
      const { byName, spread } = attributes(opening);
      if (!isAccessibleFalse(byName.get('accessible'))) {
        const line = file.getLineAndCharacterOfPosition(opening.getStart(file)).line + 1;
        const report = (rule: Problem['rule']) =>
          problems.push({ file: relative, line, element: tag, rule });
        const named =
          spread ||
          NAME_PROPS.some((p) => byName.has(p)) ||
          (tag === 'Pressable' && ts.isJsxElement(node) && containsText(node));
        if (tag === 'Pressable' && ts.isJsxElement(node) && containsControl(node)) {
          report('nesting');
        }
        if (!named) report('name');
        if (tag === 'Pressable') {
          if (!spread && !ROLE_PROPS.some((p) => byName.has(p))) report('role');
          if (!byName.has('hitSlop') && !meetsTarget(byName.get('style'), sheets)) {
            report('size');
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return problems;
}

const problems = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).flatMap((f) =>
  check(f),
);
const describeProblems = (rule: Problem['rule']) =>
  problems.filter((p) => p.rule === rule).map((p) => `${p.file}:${p.line} <${p.element}>`);

describe('accessibility sweep', () => {
  it('finds the interactive elements it checks', () => {
    // Guards the sweep itself: a parser change that finds nothing would pass.
    const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(20);
  });

  it('gives every interactive element a name VoiceOver can read', () => {
    expect(describeProblems('name')).toEqual([]);
  });

  it('gives every Pressable an accessibility role', () => {
    expect(describeProblems('role')).toEqual([]);
  });

  it('makes every Pressable at least 44pt tall, or extends it with hitSlop', () => {
    expect(describeProblems('size')).toEqual([]);
  });

  it('puts no control inside a Pressable VoiceOver can reach', () => {
    expect(describeProblems('nesting')).toEqual([]);
  });
});

// Each rule must be able to fail, or a pass means nothing.
describe('accessibility sweep rules', () => {
  const rules = (source: string) =>
    check(path.join(ROOT, 'fixture.tsx'), source)
      .map((p) => p.rule)
      .sort();
  const STYLES = `const styles = StyleSheet.create({
    big: { minHeight: 44 }, token: { ...touchTarget }, small: { height: 22 },
    narrow: { minHeight: 44, width: 22 },
  });`;

  it('passes a named, roled, 44pt Pressable', () => {
    expect(
      rules(`<Pressable accessibilityRole="button" style={styles.big}><Text>Save</Text></Pressable>;
        ${STYLES}`),
    ).toEqual([]);
  });

  it('flags a Pressable with no name, role or size', () => {
    expect(rules(`<Pressable onPress={go} style={styles.small} />; ${STYLES}`)).toEqual([
      'name',
      'role',
      'size',
    ]);
  });

  it('flags a 44pt-tall Pressable narrower than 44pt', () => {
    expect(
      rules(`<Pressable accessibilityRole="button" accessibilityLabel="Add" style={styles.narrow} />;
        ${STYLES}`),
    ).toEqual(['size']);
  });

  it('accepts hitSlop, the touchTarget token, or a spread caller', () => {
    expect(
      rules(`<>
        <Pressable accessibilityRole="button" accessibilityLabel="A" hitSlop={11} />
        <Pressable accessibilityRole="button" accessibilityLabel="B" style={styles.token} />
        <Pressable {...rest} style={styles.big} />
      </>; ${STYLES}`),
    ).toEqual([]);
  });

  it('flags a TextInput with no label', () => {
    expect(rules(`<TextInput value={v} />;`)).toEqual(['name']);
  });

  it('flags the old sheet: an accessible backdrop around the options', () => {
    expect(
      rules(`<Pressable style={styles.big} onPress={close} accessibilityRole="button">
        <Pressable accessibilityRole="button" style={styles.big}><Text>Groceries</Text></Pressable>
      </Pressable>; ${STYLES}`),
    ).toEqual(['nesting']);
  });

  it('passes the fixed sheet: the backdrop is accessible={false}', () => {
    expect(
      rules(`<Pressable style={styles.big} onPress={close} accessible={false}>
        <Pressable accessibilityRole="button" style={styles.big}><Text>Groceries</Text></Pressable>
      </Pressable>; ${STYLES}`),
    ).toEqual([]);
  });
});
