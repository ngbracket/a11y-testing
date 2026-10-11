/**
 * Vitest matchers. Import once from a setup file:
 *
 * ```ts
 * // vitest setup file
 * import '@ngbracket/a11y-testing/vitest';
 * ```
 */
import { expect } from 'vitest';
import type { AnnouncementRecorder } from './announcements.js';
import { checkFocusTrapped, type FocusCheckOptions } from './focus.js';

type Announced = AnnouncementRecorder | readonly string[];

function announcementsOf(received: unknown): readonly string[] | null {
  if (Array.isArray(received)) return received;
  if (received && typeof received === 'object' && 'announcements' in received) {
    return (received as AnnouncementRecorder).announcements;
  }
  return null;
}

expect.extend({
  toHaveAnnounced(received: Announced, expected: string | RegExp) {
    const announced = announcementsOf(received);
    if (!announced) {
      return {
        pass: false,
        message: () =>
          'toHaveAnnounced expects the array from captureAnnouncements() or a recorder from recordAnnouncements().',
      };
    }
    const pass = announced.some((text) => (typeof expected === 'string' ? text === expected : expected.test(text)));
    const list = announced.length ? announced.map((t) => `  "${t}"`).join('\n') : '  (nothing)';
    return {
      pass,
      message: () =>
        pass
          ? `Expected no announcement matching ${String(expected)}, but it was announced. Announced:\n${list}`
          : `Expected an announcement matching ${typeof expected === 'string' ? `"${expected}"` : String(expected)}. Announced:\n${list}`,
    };
  },

  async toBeFocusTrapped(received: Element, options?: FocusCheckOptions) {
    const result = await checkFocusTrapped(received, options);
    return {
      pass: result.pass,
      message: () => (result.pass ? `Expected focus to escape the container. ${result.message}` : result.message),
    };
  },
});

interface A11yMatchers<R = unknown> {
  /**
   * The recorder or captured array holds an announcement equal to `expected`
   * (a string matches a whole message), or matching it (a RegExp).
   */
  toHaveAnnounced(expected: string | RegExp): R;
  /** Tab and Shift+Tab stay inside this element and reach every stop. Await it. */
  toBeFocusTrapped(options?: FocusCheckOptions): Promise<R>;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Matchers<T = any> extends A11yMatchers<T> {}
}
