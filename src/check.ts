/**
 * Run axe-core on a component fixture and name the Angular component behind each
 * failure. axe checks roughly a third of WCAG success criteria, so no violations
 * means no automated failures found, which isn't the same as accessible.
 */
import axe from 'axe-core';
import { componentPath, DEFAULT_FRAMEWORK_PREFIXES, owningComponent } from './attribution.js';
import { settle, type AngularFixtureLike } from './fixture.js';

export interface CheckA11yOptions {
  /** Turn individual axe rules on or off: `{ 'image-alt': { enabled: false } }`. */
  readonly rules?: axe.RuleObject;
  /** Run only these rules or tags: `['wcag2a', 'wcag2aa']`. */
  readonly runOnly?: axe.RunOptions['runOnly'];
  /** Selectors to leave out, such as third-party widgets you can't change. */
  readonly exclude?: readonly string[];
  /**
   * Component-name prefixes to walk past when naming the owner, so a problem on
   * `<button matButton>` is reported against your component. Pass `[]` when
   * testing a component library's own code. Default: `Nb`, `Mat`, `Cdk`, `Mdc`.
   */
  readonly frameworkPrefixes?: readonly string[];
}

/** One element that failed a rule. */
export interface A11yViolationNode {
  /** The element, when it's still in the document. */
  element: Element | null;
  /** axe's CSS selector for the element. */
  target: string;
  /** The element's opening tag, as axe reports it. */
  html: string;
  /** The nearest component your app owns, or null without `window.ng`. */
  component: string | null;
  /** Owning components from the element up, nearest first. */
  componentPath: string[];
  /** axe's explanation of what to fix. */
  failureSummary: string;
}

/** One axe rule that failed, with every element that failed it. */
export interface A11yViolation {
  id: string;
  impact: axe.ImpactValue | null;
  help: string;
  helpUrl: string;
  nodes: A11yViolationNode[];
}

export interface A11yCheckResult {
  violations: A11yViolation[];
  /** Rules axe couldn't decide on these elements; check them by hand. */
  incomplete: A11yViolation[];
  /** Rules this package turned off for the run, one entry per rule, with the reason. */
  skipped: { id: string; reason: string }[];
}

/**
 * Rules about a whole page. A component on its own has no `<title>`, `lang` or
 * `<main>`, so they're off unless you check the whole `document`.
 */
const PAGE_RULES = [
  'bypass',
  'document-title',
  'html-has-lang',
  'html-lang-valid',
  'html-xml-lang-mismatch',
  'landmark-one-main',
  'meta-refresh',
  'meta-viewport',
  'page-has-heading-one',
  'region',
];

/** jsdom and happy-dom have no layout, so axe can't compute colour contrast. */
function hasNoLayout(): boolean {
  return /jsdom|HappyDOM/i.test(globalThis.navigator?.userAgent ?? '');
}

// axe allows one run at a time; queue calls so parallel checks in a test don't clash.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Run axe on `target` and return the violations, each element named by its
 * owning component. Given a fixture, it settles it first and checks the
 * component's element; pass `document` to include CDK overlays on `<body>`.
 *
 * In jsdom and happy-dom `color-contrast` is skipped, since there is no layout to
 * compute colours from. Run the check in Vitest browser mode to include it.
 */
export async function checkA11y(
  target: AngularFixtureLike | Element | Document,
  options: CheckA11yOptions = {},
): Promise<A11yCheckResult> {
  let root: Element | Document;
  if ('whenStable' in target) {
    await settle(target);
    root = target.nativeElement ?? document;
  } else {
    root = target;
  }

  // Rules a user names in `rules` or `runOnly` are theirs to decide, so they stay on.
  const named = new Set([...Object.keys(options.rules ?? {}), ...runOnlyNames(options.runOnly)]);
  const skipped: A11yCheckResult['skipped'] = [];
  if (hasNoLayout()) skipped.push({ id: 'color-contrast', reason: NO_LAYOUT });
  // nodeType, not instanceof: a Document from another realm fails instanceof.
  if (root.nodeType !== Node.DOCUMENT_NODE) {
    for (const id of PAGE_RULES) skipped.push({ id, reason: PAGE_RULE });
  }
  const off = skipped.filter((s) => !named.has(s.id));
  const rules: axe.RuleObject = Object.fromEntries(off.map((s) => [s.id, { enabled: false }]));
  Object.assign(rules, options.rules);

  for (const selector of options.exclude ?? []) {
    try {
      document.querySelector(selector);
    } catch {
      throw new Error(`checkA11y: the exclude selector "${selector}" isn't a valid CSS selector.`);
    }
  }
  const context: axe.ElementContext = options.exclude?.length
    ? { include: root, exclude: [...options.exclude] }
    : root;
  const runOptions: axe.RunOptions = {
    rules,
    elementRef: true,
    resultTypes: ['violations', 'incomplete'],
    ...(options.runOnly ? { runOnly: options.runOnly } : {}),
  };

  const run = queue.then(() => axe.run(context, runOptions));
  queue = run.catch(() => undefined);
  const results = await run;

  const prefixes = options.frameworkPrefixes ?? DEFAULT_FRAMEWORK_PREFIXES;
  const convert = (result: axe.Result): A11yViolation => ({
    id: result.id,
    impact: result.impact ?? null,
    help: result.help,
    helpUrl: result.helpUrl,
    nodes: result.nodes.map((node) => {
      const element = node.element ?? null;
      const path = element ? componentPath(element) : [];
      return {
        element,
        target: node.target.map(String).join(' '),
        html: node.html,
        component: owningComponent(path, prefixes),
        componentPath: path,
        failureSummary: node.failureSummary ?? '',
      };
    }),
  });

  return {
    violations: results.violations.map(convert),
    incomplete: results.incomplete.map(convert),
    skipped: off,
  };
}

const NO_LAYOUT = 'jsdom has no layout to compute colours from';
const PAGE_RULE = 'page-level, runs only when you check the whole document';

/** The rule ids or tags a `runOnly` option names. */
function runOnlyNames(runOnly: CheckA11yOptions['runOnly']): string[] {
  if (!runOnly) return [];
  if (typeof runOnly === 'string') return [runOnly];
  if (Array.isArray(runOnly)) return [...runOnly];
  return [...runOnly.values];
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * The violations as readable text, one block per rule, each element listed with
 * its component:
 *
 * ```text
 * image-alt (critical): Images must have alternative text
 *   https://dequeuniversity.com/rules/axe/4.14/image-alt?application=axeAPI
 *   - in ProductCard: <img src="shoe.png">
 *     Fix any of the following:
 *       Element does not have an alt attribute
 *       aria-label attribute does not exist or is empty
 * ```
 */
export function formatViolations(result: A11yCheckResult): string {
  if (result.violations.length === 0) return 'No axe violations.';
  const count = result.violations.reduce((sum, v) => sum + v.nodes.length, 0);
  const header = `${count} axe violation${count === 1 ? '' : 's'} in ${result.violations.length} rule${result.violations.length === 1 ? '' : 's'}:`;
  const blocks = result.violations.map((v) => {
    const lines = [`${v.id} (${v.impact ?? 'unknown impact'}): ${v.help}`, `  ${v.helpUrl}`];
    for (const node of v.nodes) {
      const where = node.component ? `in ${node.component}: ` : '';
      lines.push(`  - ${where}${truncate(node.html, 120)}`);
      // axe's summary is a heading line ("Fix any of the following:") then one line per fix.
      const [heading, ...fixes] = node.failureSummary.split('\n').map((l) => l.trim()).filter(Boolean);
      if (heading) lines.push(`    ${heading}`);
      for (const fix of fixes) lines.push(`      ${truncate(fix, 120)}`);
    }
    return lines.join('\n');
  });
  // One line per reason: "page-level rules" would otherwise list ten rules on ten lines.
  const byReason = new Map<string, string[]>();
  for (const s of result.skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.id]);
  const skipped = byReason.size
    ? `\n\nNot checked:\n${[...byReason].map(([reason, ids]) => `  ${ids.join(', ')}: ${reason}`).join('\n')}`
    : '';
  return `${header}\n\n${blocks.join('\n\n')}${skipped}`;
}

/** {@link checkA11y}, throwing with {@link formatViolations} when there are violations. */
export async function expectNoAxeViolations(
  target: AngularFixtureLike | Element | Document,
  options: CheckA11yOptions = {},
): Promise<void> {
  const result = await checkA11y(target, options);
  if (result.violations.length > 0) throw new Error(formatViolations(result));
}
