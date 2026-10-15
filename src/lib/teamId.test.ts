import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { newTeamId } from './teamId';

/**
 * Team ids are optional fields carried on Staff and Supervisor entries for the
 * TAK module. These tests keep them working as core code changes:
 * - every place that creates a team or supervisor gives it an id;
 * - every place that updates one (status, location, rename, logs, ...)
 *   copies the existing entry with a spread, so the id survives.
 * They check the source itself, since those updates live inside page
 * components.
 */

const SRC = path.resolve(__dirname, '..');

/**
 * Object literals that look like team entries but are never stored, so they
 * don't need ids. Keyed by file and enclosing function. Keep each reason.
 */
const NOT_STORED: Record<string, string> = {
  // Adapts a supervisor to the team card's Staff shape for rendering. The
  // handlers it feeds look the stored supervisor up by name and spread it.
  'components/dispatch/leftpanellists.tsx#supervisorAsStaff': 'view adapter',
  // Per-team rows of an analytics report, derived from stored data.
  'lib/analyticsUtils.ts#*': 'derived report rows',
};

function enclosingFunctionName(node: ts.Node): string {
  for (let n = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) return n.name.getText();
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent)) return n.parent.name.getText();
  }
  return '';
}
const TEAM_FIELDS = new Set(['team', 'status', 'location', 'log', 'originalPost', 'members', 'member', 'statusSince']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (p.includes(path.join('features', 'tak'))) continue;
      sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

const propNames = (o: ts.ObjectLiteralExpression) =>
  o.properties.flatMap((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? [p.name.text] : []));
const hasSpread = (o: ts.ObjectLiteralExpression) => o.properties.some(ts.isSpreadAssignment);

/** The `.map(` call an object literal is returned from, if any (arrow body, ternary branch, or return statement). */
function enclosingMapCall(node: ts.Node): ts.CallExpression | undefined {
  let n: ts.Node = node;
  while (n.parent) {
    const parent = n.parent;
    if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
      const call = parent.parent;
      if (call && ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'map') {
        return call;
      }
      return undefined;
    }
    if (ts.isObjectLiteralExpression(parent) || ts.isArrayLiteralExpression(parent)) return undefined; // nested value, not the returned entry
    n = parent;
  }
  return undefined;
}

interface Finding {
  file: string;
  line: number;
  text: string;
}

function audit() {
  const missingId: Finding[] = [];
  const missingSpread: Finding[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const where = (n: ts.Node): Finding => ({
      file: path.relative(SRC, file).split(path.sep).join('/'),
      line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
      text: n.getText().slice(0, 80).replace(/\s+/g, ' '),
    });
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node) && !NOT_STORED[`${rel}#${enclosingFunctionName(node)}`] && !NOT_STORED[`${rel}#*`]) {
        const names = propNames(node);
        const isNewTeam = names.includes('team') && (names.includes('members') || names.includes('member')) && !hasSpread(node);
        if (isNewTeam && !names.includes('id')) missingId.push(where(node));

        const call = enclosingMapCall(node);
        if (call && ts.isPropertyAccessExpression(call.expression)) {
          const target = call.expression.expression.getText();
          const updatesTeam = names.some((n) => TEAM_FIELDS.has(n));
          if (/\b(staff|supervisors?)\b/i.test(target) && updatesTeam && !hasSpread(node) && !isNewTeam) {
            missingSpread.push(where(node));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { missingId, missingSpread };
}

describe('team ids', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, newTeamId));
    expect(ids.size).toBe(1000);
  });

  const { missingId, missingSpread } = audit();

  it('every new team or supervisor gets an id', () => {
    expect(missingId).toEqual([]);
  });

  it('every team or supervisor update copies the existing entry, keeping its id', () => {
    expect(missingSpread).toEqual([]);
  });
});
