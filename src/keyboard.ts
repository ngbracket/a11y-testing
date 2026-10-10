/**
 * Keyboard input for TestBed specs: one `press()` that fills in `key`, `code`
 * and `keyCode` (the CDK still switches on `keyCode`), carries modifiers, and
 * does what the browser would do when no handler cancels the event: Tab moves
 * focus, Enter activates a native button or link, Space activates a native
 * button, checkbox or radio. A `<div role="button">` gets no default action,
 * just as in a browser, so a missing key handler shows up as a failing test.
 */
import { settle, type AngularFixtureLike } from './fixture.js';
import { tabOrder } from './tab-order.js';

export interface PressOptions {
  /** Settle this fixture after the key press, so the DOM shows the result. */
  readonly fixture?: AngularFixtureLike;
}

interface KeyInfo {
  key: string;
  code: string;
  keyCode: number;
}

const NAMED_KEYS: Record<string, [code: string, keyCode: number]> = {
  Backspace: ['Backspace', 8],
  Tab: ['Tab', 9],
  Enter: ['Enter', 13],
  Shift: ['ShiftLeft', 16],
  Control: ['ControlLeft', 17],
  Alt: ['AltLeft', 18],
  Escape: ['Escape', 27],
  ' ': ['Space', 32],
  PageUp: ['PageUp', 33],
  PageDown: ['PageDown', 34],
  End: ['End', 35],
  Home: ['Home', 36],
  ArrowLeft: ['ArrowLeft', 37],
  ArrowUp: ['ArrowUp', 38],
  ArrowRight: ['ArrowRight', 39],
  ArrowDown: ['ArrowDown', 40],
  Delete: ['Delete', 46],
  Meta: ['MetaLeft', 91],
  ContextMenu: ['ContextMenu', 93],
};
for (let n = 1; n <= 12; n++) NAMED_KEYS[`F${n}`] = [`F${n}`, 111 + n];

const ALIASES: Record<string, string> = {
  Space: ' ',
  Spacebar: ' ',
  Esc: 'Escape',
  Ctrl: 'Control',
  Cmd: 'Meta',
  Command: 'Meta',
  Option: 'Alt',
  Del: 'Delete',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
};

const SHIFTED_PUNCTUATION: Record<string, [code: string, keyCode: number]> = {
  '-': ['Minus', 189],
  '=': ['Equal', 187],
  ',': ['Comma', 188],
  '.': ['Period', 190],
  '/': ['Slash', 191],
  '?': ['Slash', 191],
  '+': ['Equal', 187],
  '*': ['Digit8', 56],
};

function keyInfo(name: string, shift: boolean): KeyInfo {
  const key = ALIASES[name] ?? name;
  const named = NAMED_KEYS[key];
  if (named) return { key, code: named[0], keyCode: named[1] };
  if (/^[a-z]$/i.test(key)) {
    const upper = key.toUpperCase();
    return { key: shift ? upper : key.toLowerCase(), code: `Key${upper}`, keyCode: upper.charCodeAt(0) };
  }
  if (/^[0-9]$/.test(key)) return { key, code: `Digit${key}`, keyCode: key.charCodeAt(0) };
  const punct = SHIFTED_PUNCTUATION[key];
  if (punct) return { key, code: punct[0], keyCode: punct[1] };
  throw new Error(
    `press(): unknown key "${name}". Use a KeyboardEvent.key name such as "Enter", "ArrowDown" or "a".`,
  );
}

interface Combo {
  info: KeyInfo;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Parse `'Shift+Tab'`, `'Control+b'`, `'Meta+Shift+z'` or `'Control++'`. */
function parseCombo(combo: string): Combo {
  const parts = combo === '+' ? ['+'] : combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
  const names = parts.map((p) => ALIASES[p] ?? p);
  const main = names[names.length - 1];
  const mods = new Set(names.slice(0, -1));
  for (const mod of mods) {
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(mod)) {
      throw new Error(`press(): "${mod}" in "${combo}" isn't a modifier. Use Shift, Control, Alt or Meta.`);
    }
  }
  if (!main) throw new Error(`press(): no key in "${combo}".`);
  const shiftKey = mods.has('Shift');
  return {
    info: keyInfo(main, shiftKey),
    shiftKey,
    ctrlKey: mods.has('Control'),
    altKey: mods.has('Alt'),
    metaKey: mods.has('Meta'),
  };
}

function keyboardEvent(type: 'keydown' | 'keyup', combo: Combo): KeyboardEvent {
  const { info, ...mods } = combo;
  const event = new KeyboardEvent(type, {
    key: info.key,
    code: info.code,
    keyCode: info.keyCode,
    which: info.keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...mods,
  } as KeyboardEventInit);
  // Some DOM shims ignore keyCode/which in the init dictionary; the CDK reads them.
  if (event.keyCode !== info.keyCode) {
    Object.defineProperty(event, 'keyCode', { get: () => info.keyCode });
    Object.defineProperty(event, 'which', { get: () => info.keyCode });
  }
  return event;
}

const ENTER_ACTIVATES = 'button, a[href], area[href], input[type="submit"], input[type="reset"], input[type="button"], input[type="image"], summary';
const SPACE_ACTIVATES = 'button, input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="reset"], input[type="button"], input[type="image"], summary';

function isEnabled(el: Element): boolean {
  return !(el as { disabled?: boolean }).disabled;
}

/**
 * Press a key or key combination on `target` (default: the focused element) and
 * return the `keydown` event, so a test can check `defaultPrevented`.
 *
 * Dispatches `keydown` then `keyup`. Unless a handler cancels the event, it then
 * does the browser's default action for Tab, Enter and Space (see the module
 * comment). Tab starts from `target`, as it would from the focused element.
 */
export async function press(target: Element, keys: string, options?: PressOptions): Promise<KeyboardEvent>;
export async function press(keys: string, options?: PressOptions): Promise<KeyboardEvent>;
export async function press(
  targetOrKeys: Element | string,
  keysOrOptions?: string | PressOptions,
  maybeOptions?: PressOptions,
): Promise<KeyboardEvent> {
  const explicitTarget = typeof targetOrKeys !== 'string';
  const target = explicitTarget ? targetOrKeys : (document.activeElement ?? document.body);
  const keys = explicitTarget ? (keysOrOptions as string) : targetOrKeys;
  const options = (explicitTarget ? maybeOptions : (keysOrOptions as PressOptions | undefined)) ?? {};

  const combo = parseCombo(keys);
  const down = keyboardEvent('keydown', combo);
  target.dispatchEvent(down);
  const plain = !combo.ctrlKey && !combo.altKey && !combo.metaKey;

  if (!down.defaultPrevented) {
    if (combo.info.key === 'Tab' && plain) moveFocus(target, combo.shiftKey);
    else if (combo.info.key === 'Enter' && plain && target.matches(ENTER_ACTIVATES) && isEnabled(target)) {
      (target as HTMLElement).click();
    }
  }

  // keyup goes wherever focus is now: after Tab, that's the new element.
  const upTarget = combo.info.key === 'Tab' && !down.defaultPrevented ? (document.activeElement ?? target) : target;
  const up = keyboardEvent('keyup', combo);
  upTarget.dispatchEvent(up);
  if (
    combo.info.key === ' ' &&
    plain &&
    !down.defaultPrevented &&
    !up.defaultPrevented &&
    target.matches(SPACE_ACTIVATES) &&
    isEnabled(target)
  ) {
    (target as HTMLElement).click();
  }

  if (options.fixture) await settle(options.fixture);
  else await Promise.resolve(); // let microtask focus moves (CDK menus) land
  return down;
}

/** Press Tab on the focused element and return the element focus lands on. */
export async function tab(options?: PressOptions): Promise<Element | null> {
  await press('Tab', options);
  return document.activeElement;
}

/** Press Shift+Tab on the focused element and return the element focus lands on. */
export async function shiftTab(options?: PressOptions): Promise<Element | null> {
  await press('Shift+Tab', options);
  return document.activeElement;
}

/**
 * Tab's default action: focus the next (or previous) stop after `from`. Focus-trap
 * sentinels count as stops, because the browser lands on them and the trap's
 * focus listener moves focus on. Past the last stop a browser leaves the page;
 * here focus wraps to the first stop, which is what a test can observe.
 */
function moveFocus(from: Element, backward: boolean): void {
  const doc = from.ownerDocument ?? document;
  const order = tabOrder(doc, { includeSentinels: true });
  if (order.length === 0) return;

  let next: Element | undefined;
  const index = order.indexOf(from);
  if (index !== -1) {
    next = order[(index + (backward ? -1 : 1) + order.length) % order.length];
  } else if (from === doc.body || from === doc.documentElement) {
    next = backward ? order[order.length - 1] : order[0];
  } else {
    // Focus is on something outside the order (tabindex="-1", say): the browser
    // continues from its position in the document.
    const follows = (el: Element) => (from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    next = backward
      ? ([...order].reverse().find((el) => !follows(el)) ?? order[order.length - 1])
      : (order.find(follows) ?? order[0]);
  }
  (next as HTMLElement).focus();
}
