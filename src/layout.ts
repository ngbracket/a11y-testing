import { defaultIsVisible } from './tab-order.js';

/**
 * jsdom has no layout: every element's `offsetWidth` and `offsetHeight` are 0.
 * The CDK's `InteractivityChecker` reads those to decide whether an element is
 * visible, so in jsdom it finds nothing to focus and a CDK focus trap (dialogs,
 * drawers, `cdkTrapFocus`) can't move focus. `stubLayout()` reports a 1×1 box
 * for elements that are connected and not `display: none` / `visibility: hidden`,
 * so the CDK's own trap code runs as it would in a browser.
 *
 * It patches `HTMLElement.prototype`, so call the returned function (or use
 * `afterEach`) to put things back.
 */
export function stubLayout(): () => void {
  const proto = HTMLElement.prototype;
  const originals = {
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
    offsetHeight: Object.getOwnPropertyDescriptor(proto, 'offsetHeight'),
  };

  const size = function (this: HTMLElement): number {
    if (!this.isConnected) return 0;
    return defaultIsVisible(this) ? 1 : 0;
  };
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: size });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: size });

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const [prop, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(proto, prop, descriptor);
      else delete (proto as unknown as Record<string, unknown>)[prop];
    }
  };
}
