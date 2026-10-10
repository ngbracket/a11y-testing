/**
 * One-line focus checks: focus goes back to the trigger when an overlay closes,
 * Tab and Shift+Tab stay inside a modal, and which option an
 * `aria-activedescendant` widget points at. Failures say where focus went, as
 * `button "Save"` rather than an element dump.
 */
import { formatDescription } from './describe.js';
import { settle, type AngularFixtureLike } from './fixture.js';
import { shiftTab, tab } from './keyboard.js';
import { isFocusSentinel, isHidden, tabOrder } from './tab-order.js';

export interface FocusCheckOptions {
  /** Settle this fixture after each step, so the DOM shows the result. */
  readonly fixture?: AngularFixtureLike;
}

/** The outcome of a check, for callers that want a result instead of a throw. */
export interface FocusCheckResult {
  pass: boolean;
  message: string;
}

/** `button "Save"`, or a note that focus is on nothing in particular. */
function where(el: Element | null): string {
  if (!el || el === document.body || el === document.documentElement) return 'the page body (focus was lost)';
  if (isHidden(el)) {
    // jsdom keeps focus on an element after it's hidden; a browser moves it to the body.
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const id = el.id ? `#${el.id}` : '';
    return `a hidden <${el.tagName.toLowerCase()}${id}>${text ? ` ("${text}")` : ''}, so in a browser focus would be lost to the page body`;
  }
  return formatDescription(el);
}

async function step(options: FocusCheckOptions): Promise<void> {
  if (options.fixture) await settle(options.fixture);
  else await Promise.resolve();
}

/**
 * Focus `trigger`, run `open`, run `close`, then check focus is back on `trigger`.
 * Throws when it isn't, naming where focus ended up.
 *
 * ```ts
 * await expectFocusReturn(
 *   trigger,
 *   () => trigger.click(),
 *   () => press('Escape'),
 *   { fixture },
 * );
 * ```
 */
export async function expectFocusReturn(
  trigger: HTMLElement,
  open: () => unknown,
  close: () => unknown,
  options: FocusCheckOptions = {},
): Promise<void> {
  trigger.focus();
  if (document.activeElement !== trigger) {
    throw new Error(`expectFocusReturn: couldn't focus the trigger, ${where(trigger)}. Is it focusable and visible?`);
  }
  await open();
  await step(options);
  await close();
  await step(options);
  const active = document.activeElement;
  if (active !== trigger) {
    throw new Error(`Focus didn't return to ${where(trigger)}. It's on ${where(active)}.`);
  }
}

/**
 * Press Tab, then Shift+Tab, enough times to go round `container` once each way,
 * and check focus stays inside it and reaches every stop. Focus starts on the
 * first stop if it isn't inside already.
 *
 * Returns a result rather than throwing; {@link expectFocusTrapped} throws.
 */
export async function checkFocusTrapped(
  container: Element,
  options: FocusCheckOptions = {},
): Promise<FocusCheckResult> {
  const stops = tabOrder(container);
  if (stops.length === 0) {
    return { pass: false, message: 'The container has no tab stops, so there is nothing to trap focus on.' };
  }
  if (!container.contains(document.activeElement)) {
    (stops[0] as HTMLElement).focus();
    await step(options);
  }

  for (const [direction, move] of [
    ['Tab', tab],
    ['Shift+Tab', shiftTab],
  ] as const) {
    const visited = new Set<Element>();
    for (let i = 0; i <= stops.length; i++) {
      const from = document.activeElement;
      const to = await move(options);
      if (!to || !container.contains(to)) {
        const hint =
          to && isFocusSentinel(to)
            ? ' Focus stayed on a focus-trap sentinel: the trap did not move it back in. ' +
              'A CDK focus trap checks layout, which jsdom does not have; call stubLayout() before the test.'
            : '';
        return {
          pass: false,
          message: `${direction} from ${where(from)} moved focus out of the container, to ${where(to)}.${hint}`,
        };
      }
      visited.add(to);
    }
    const missed = stops.filter((s) => !visited.has(s));
    if (missed.length > 0) {
      return {
        pass: false,
        message:
          `${direction} stayed inside the container but never reached ${missed.map(where).join(', ')}. ` +
          `Focus may be stuck on ${where(document.activeElement)}.`,
      };
    }
  }
  return { pass: true, message: `Tab and Shift+Tab stay inside the container and reach all ${stops.length} stops.` };
}

/** {@link checkFocusTrapped}, throwing when focus escapes or misses a stop. */
export async function expectFocusTrapped(container: Element, options: FocusCheckOptions = {}): Promise<void> {
  const result = await checkFocusTrapped(container, options);
  if (!result.pass) throw new Error(result.message);
}

/**
 * The element `aria-activedescendant` on `el` (default: the focused element)
 * points at, or null when it's unset or points at nothing.
 */
export function activeDescendant(el: Element | null = document.activeElement): Element | null {
  const id = el?.getAttribute('aria-activedescendant');
  if (!el || !id) return null;
  const root = el.getRootNode() as Document | ShadowRoot;
  return root.getElementById?.(id) ?? null;
}
