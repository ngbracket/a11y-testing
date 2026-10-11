/**
 * A computed approximation of what assistive technology gets for an element:
 * role, accessible name, description and states. It is not what any particular
 * screen reader says; real output depends on the screen reader, its mode and
 * verbosity, and the browser.
 *
 * Role and name come from axe-core's accessible-name code, the same source
 * `@ngbracket/a11y-devtools` uses for its Focus preview and walkthrough, so a
 * test and the devtools describe an element the same way.
 */
import axeCore from 'axe-core';
import type { AngularFixtureLike } from './fixture.js';
import { tabOrder } from './tab-order.js';

export interface ElementDescription {
  /** Computed ARIA role, or null when none resolves. */
  role: string | null;
  /** Computed accessible name, whitespace collapsed; '' when it has none. */
  name: string;
  /** Text of the `aria-describedby` targets, else the `title`; '' when neither. */
  description: string;
  /** State labels such as `expanded`, `checked`, `disabled`, `level 2`, `3 of 5`. */
  states: string[];
}

/** The axe internals used here, which aren't part of axe's published types. */
interface AxeCommons {
  _tree?: unknown;
  setup(root: Document | Element): unknown;
  teardown(): unknown;
  utils: { getNodeFromTree(node: Element): unknown };
  commons: {
    aria: { getRole(node: Element): string | null };
    text: { accessibleTextVirtual(vnode: unknown): string };
  };
}

const axe = axeCore as unknown as AxeCommons;

/** Describe one element. See the module comment for what this approximates. */
export function describeElement(element: Element): ElementDescription {
  return describeElements([element])[0];
}

/** {@link describeElement} for many elements, building axe's tree once. */
export function describeElements(elements: readonly Element[]): ElementDescription[] {
  if (elements.length === 0) return [];
  const doc = elements[0].ownerDocument ?? document;
  const computed = elements.map(() => ({ role: null as string | null, name: '' }));
  // axe allows one tree at a time. If another axe run owns it, setup throws and
  // we don't tear down a tree we didn't build.
  let didSetup = false;
  try {
    axe.setup(doc);
    didSetup = true;
    elements.forEach((element, i) => {
      const vnode = axe.utils.getNodeFromTree(element);
      computed[i] = {
        role: axe.commons.aria.getRole(element) ?? null,
        name: vnode ? (axe.commons.text.accessibleTextVirtual(vnode) ?? '').replace(/\s+/g, ' ').trim() : '',
      };
    });
  } finally {
    if (didSetup) axe.teardown();
  }
  return elements.map((element, i) => ({
    ...computed[i],
    description: accessibleDescription(element),
    states: ariaStates(element),
  }));
}

/** One line for an element: `button "Save" (expanded)`. Used in messages and walkthroughs. */
export function formatDescription(element: Element, description = describeElement(element)): string {
  const what = description.role ?? element.tagName.toLowerCase();
  const name = description.name ? `"${description.name}"` : '(no name)';
  const states = description.states.length ? ` (${description.states.join(', ')})` : '';
  return `${what} ${name}${states}`;
}

/**
 * The tab order of `root` as text, one line per stop, for snapshot tests:
 *
 * ```text
 * 1. textbox "Search"
 * 2. button "Filters" (collapsed, has menu popup)
 * 3. link "Help"
 * ```
 *
 * Given a fixture, it walks the component's own element. Pass `document` to
 * include overlays the CDK renders on `<body>`.
 */
export function tabWalkthrough(root: ParentNode | AngularFixtureLike = document): string {
  const scope: ParentNode =
    'whenStable' in root ? (root.nativeElement ?? document) : root;
  const stops = tabOrder(scope);
  const described = describeElements(stops);
  return stops
    .map((el, i) => {
      const tabindex = Number.parseInt(el.getAttribute('tabindex') ?? '', 10);
      const positive = tabindex > 0 ? ` [tabindex=${tabindex}]` : '';
      return `${i + 1}. ${formatDescription(el, described[i])}${positive}`;
    })
    .join('\n');
}

function accessibleDescription(element: Element): string {
  const ids = element.getAttribute('aria-describedby');
  if (ids) {
    const doc = element.ownerDocument ?? document;
    const text = ids
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => doc.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  return element.getAttribute('title')?.trim() ?? '';
}

function isOn(value: string | null): boolean {
  return value !== null && value !== 'false' && value !== 'undefined';
}

/** State labels, matching the devtools walkthrough. ARIA first, then native state. */
function ariaStates(element: Element): string[] {
  const states: string[] = [];
  const attr = (name: string) => element.getAttribute(name);

  const expanded = attr('aria-expanded');
  if (expanded === 'true') states.push('expanded');
  else if (expanded === 'false') states.push('collapsed');

  const checked = attr('aria-checked');
  if (checked === 'true') states.push('checked');
  else if (checked === 'false') states.push('not checked');
  else if (checked === 'mixed') states.push('mixed');
  else if ('checked' in element && (element as HTMLInputElement).checked) states.push('checked');

  const pressed = attr('aria-pressed');
  if (pressed === 'true') states.push('pressed');
  else if (pressed === 'false') states.push('not pressed');

  if (attr('aria-selected') === 'true') states.push('selected');

  if (isOn(attr('aria-disabled')) || ('disabled' in element && (element as HTMLInputElement).disabled)) {
    states.push('disabled');
  }
  if (isOn(attr('aria-required')) || ('required' in element && (element as HTMLInputElement).required)) {
    states.push('required');
  }
  if (attr('aria-invalid') === 'true') states.push('invalid');
  if (attr('aria-readonly') === 'true') states.push('read only');

  const current = attr('aria-current');
  if (isOn(current)) states.push(current === 'true' ? 'current' : `current ${current}`);

  const haspopup = attr('aria-haspopup');
  if (isOn(haspopup)) states.push(haspopup === 'true' ? 'has popup' : `has ${haspopup} popup`);

  const heading = /^h([1-6])$/.exec(element.tagName.toLowerCase());
  const level = attr('aria-level') ?? heading?.[1];
  if (level) states.push(`level ${level}`);

  const posinset = attr('aria-posinset');
  const setsize = attr('aria-setsize');
  if (posinset && setsize) states.push(`${posinset} of ${setsize}`);

  return states;
}
