/**
 * Which Angular component rendered an element. Angular publishes debug helpers
 * on `window.ng` in dev mode, and TestBed runs in dev mode, so specs have them.
 * The rules match `@ngbracket/a11y-devtools` (src/attribution.ts): ask the host
 * first (`getComponent`), then the owner (`getOwningComponent`), walking up the
 * DOM, and skip third-party UI primitives to reach the component where the fix
 * belongs.
 */
interface NgDebugGlobal {
  getComponent?(element: Element): unknown;
  getOwningComponent?(element: Element): unknown;
}

/**
 * Component-name prefixes treated as third-party UI primitives: Nebular `Nb`,
 * Angular Material `Mat`, the CDK `Cdk` and `Mdc`. A problem on `<button matButton>`
 * is fixed in the component that placed the button, so attribution walks past them.
 */
export const DEFAULT_FRAMEWORK_PREFIXES: readonly string[] = ['Nb', 'Mat', 'Cdk', 'Mdc'];

function nameOf(instance: unknown): string | null {
  if (!instance || typeof instance !== 'object') return null;
  // Angular's dev output can prefix class names with underscores (`_Login`).
  const name = (instance.constructor as { name?: string }).name?.replace(/^_+/, '');
  return name || null;
}

/** True when `name` starts with a prefix at a CamelCase boundary: `MatCard`, not `MatchList`. */
function isPrimitive(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (!prefix || name.length <= prefix.length || !name.startsWith(prefix)) return false;
    const next = name.charCodeAt(prefix.length);
    return next >= 65 && next <= 90;
  });
}

/**
 * The owning components from `node` up to the root, nearest first, each listed
 * once. Empty when `window.ng` isn't there (a production build, or no Angular).
 */
export function componentPath(node: Element): string[] {
  const ng = (globalThis as { ng?: NgDebugGlobal }).ng;
  if (typeof ng?.getOwningComponent !== 'function') return [];
  const path: string[] = [];
  for (let el: Element | null = node; el; el = el.parentElement) {
    let owner: unknown = null;
    try {
      owner = ng.getComponent?.(el) ?? ng.getOwningComponent(el);
    } catch {
      owner = null; // not part of a live view
    }
    const name = nameOf(owner);
    if (name && !path.includes(name)) path.push(name);
  }
  return path;
}

/** The nearest component in `path` that isn't a UI primitive, else the nearest one. */
export function owningComponent(
  path: readonly string[],
  frameworkPrefixes: readonly string[] = DEFAULT_FRAMEWORK_PREFIXES,
): string | null {
  return path.find((name) => !isPrimitive(name, frameworkPrefixes)) ?? path[0] ?? null;
}
