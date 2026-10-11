/**
 * Which elements Tab reaches, and in what order. The rules match
 * `@ngbracket/a11y-devtools` (src/keyboard/tab-sequence.ts) so a test and the
 * devtools overlay agree about the same page: positive `tabindex` first, in
 * ascending order, then `tabindex="0"` and native stops in DOM order. Disabled,
 * `inert`, `hidden` and closed-`<details>` content is skipped, and a named radio
 * group is one stop.
 */

/** Elements that can hold focus and so may appear in the tab order. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'audio[controls]',
  'video[controls]',
  'summary',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]',
].join(',');

export interface TabOrderOptions {
  /**
   * Keep focus-trap sentinels (see {@link isFocusSentinel}) in the order. Off by
   * default, since focus never rests on them. `tab()` turns it on: the browser
   * does move focus onto a sentinel, and the trap's focus listener sends it on.
   */
  includeSentinels?: boolean;
  /**
   * Visibility check override. The default reads computed `display` and
   * `visibility` up the tree, which jsdom supports for inline styles and simple
   * stylesheets.
   */
  isVisible?: (element: Element) => boolean;
}

/**
 * A focus-trap sentinel: an empty tab stop that sends focus back into a modal,
 * such as the CDK's `cdk-focus-trap-anchor` (`tabindex="0"`,
 * `aria-hidden="true"`) or a `data-focus-guard` element.
 */
export function isFocusSentinel(el: Element): boolean {
  if (el.childElementCount > 0 || (el.textContent ?? '').trim() !== '') return false;
  return el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('data-focus-guard');
}

/** True when the element takes focus without a `tabindex` attribute. */
function isNativelyFocusable(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case 'a':
    case 'area':
      return element.hasAttribute('href');
    case 'button':
    case 'select':
    case 'textarea':
    case 'summary':
    case 'iframe':
    case 'object':
    case 'embed':
      return true;
    case 'input':
      return element.getAttribute('type')?.toLowerCase() !== 'hidden';
    case 'audio':
    case 'video':
      return element.hasAttribute('controls');
  }
  const editable = element.getAttribute('contenteditable');
  return editable !== null && editable !== 'false';
}

/** The tabindex the browser uses: a numeric attribute, else the native default. */
function resolvedTabIndex(element: Element): number {
  const native = isNativelyFocusable(element) ? 0 : -1;
  const attr = element.getAttribute('tabindex');
  if (attr === null) return native;
  const parsed = Number.parseInt(attr, 10);
  return Number.isNaN(parsed) ? native : parsed;
}

function isDisabled(element: Element): boolean {
  if ('disabled' in element && (element as { disabled?: boolean }).disabled) return true;
  return element.closest('fieldset[disabled]') !== null && element.closest('legend') === null;
}

/** Hidden by markup: `inert`, `hidden`, or non-summary content of a closed `<details>`. */
function isStructurallyHidden(element: Element): boolean {
  if (element.closest('[inert]') || element.closest('[hidden]')) return true;
  for (
    let details = element.closest('details:not([open])');
    details;
    details = details.parentElement?.closest('details:not([open])') ?? null
  ) {
    if (details === element) continue;
    const summary = [...details.children].find((child) => child.tagName.toLowerCase() === 'summary');
    if (!summary?.contains(element)) return true;
  }
  return false;
}

/**
 * `display: none` on any ancestor hides an element. `visibility` inherits, and a
 * `visibility: visible` child of a hidden parent is shown, so only the element's
 * own computed value counts.
 */
export function defaultIsVisible(element: Element): boolean {
  const view = element.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return true;
  const visibility = view.getComputedStyle(element).visibility;
  if (visibility === 'hidden' || visibility === 'collapse') return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (view.getComputedStyle(node).display === 'none') return false;
  }
  return true;
}

/** True when `element` isn't shown: hidden by markup, `display: none` or `visibility: hidden`. */
export function isHidden(element: Element): boolean {
  return isStructurallyHidden(element) || !defaultIsVisible(element);
}

/** True when Tab can reach `element`. */
export function isTabbable(element: Element, isVisible: (el: Element) => boolean = defaultIsVisible): boolean {
  if (resolvedTabIndex(element) < 0) return false;
  if (isDisabled(element)) return false;
  if (isStructurallyHidden(element)) return false;
  const editable = element.getAttribute('contenteditable');
  if (editable === 'false' && !isNativelyFocusable(element) && !element.hasAttribute('tabindex')) {
    return false;
  }
  return isVisible(element);
}

function isNamedRadio(el: Element): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === 'radio' && el.name !== '';
}

/** True when `a` and `b` are radios in the same named group. */
export function sameRadioGroup(a: Element, b: Element): boolean {
  return isNamedRadio(a) && isNamedRadio(b) && a.name === b.name && a.form === b.form;
}

/**
 * A named radio group is one tab stop: the checked radio, or the first one when
 * none is checked. (Going backwards with none checked, the browser stops on the
 * last radio; `tab()` handles that.)
 */
function collapseRadioGroups(elements: Element[]): Element[] {
  return elements.filter((el) => {
    if (!isNamedRadio(el)) return true;
    const group = elements.filter((other) => sameRadioGroup(el, other));
    const checked = group.find((r) => (r as HTMLInputElement).checked);
    return el === (checked ?? group[0]);
  });
}

/** The tabbable radios in `radio`'s named group, in DOM order. */
export function radioGroupOf(radio: Element, root: ParentNode = radio.ownerDocument ?? document): Element[] {
  if (!isNamedRadio(radio)) return [radio];
  return [...root.querySelectorAll('input[type="radio"]')].filter((r) => sameRadioGroup(radio, r) && isTabbable(r));
}

/** The elements Tab visits inside `root`, in the order the browser visits them. */
export function tabOrder(root: ParentNode = document, options: TabOrderOptions = {}): Element[] {
  const isVisible = options.isVisible ?? defaultIsVisible;
  let candidates = [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => isTabbable(el, isVisible));
  if (!options.includeSentinels) candidates = candidates.filter((el) => !isFocusSentinel(el));
  candidates = collapseRadioGroups(candidates);

  const withMeta = candidates.map((element, domIndex) => ({
    element,
    domIndex,
    tabindex: resolvedTabIndex(element),
  }));
  const positives = withMeta
    .filter((m) => m.tabindex > 0)
    .sort((a, b) => a.tabindex - b.tabindex || a.domIndex - b.domIndex);
  const zeros = withMeta.filter((m) => m.tabindex === 0);
  return [...positives, ...zeros].map((m) => m.element);
}
