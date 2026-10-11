/**
 * Vitest matchers. Import once from a setup file:
 *
 * ```ts
 * // vitest setup file
 * import '@ngbracket/a11y-testing/vitest';
 * ```
 */
import { expect } from 'vitest';
import type { Announcement, AnnouncementRecorder } from './announcements.js';
import { formatViolations, type A11yCheckResult } from './check.js';
import { checkFocusTrapped, type FocusCheckOptions } from './focus.js';

type Announced = AnnouncementRecorder | readonly string[];

function messagesOf(received: unknown): readonly Announcement[] | readonly string[] | null {
  if (Array.isArray(received)) return received;
  if (received && typeof received === 'object' && 'messages' in received) {
    return (received as AnnouncementRecorder).messages;
  }
  return null;
}

expect.extend({
  toHaveAnnounced(received: Announced, expected: string | RegExp, options: { politeness?: Announcement['politeness'] } = {}) {
    const found = messagesOf(received);
    if (!found) {
      return {
        pass: false,
        message: () =>
          'toHaveAnnounced expects the array from captureAnnouncements() or a recorder from recordAnnouncements().',
      };
    }
    const messages: Announcement[] = found.map((m) => (typeof m === 'string' ? { text: m, politeness: 'polite' } : m));
    if (options.politeness && found.some((m) => typeof m === 'string')) {
      return {
        pass: false,
        message: () => 'toHaveAnnounced can only check politeness on a recorder from recordAnnouncements().',
      };
    }
    const matches = (text: string) => (typeof expected === 'string' ? text === expected : expected.test(text));
    const pass = messages.some(
      (m) => matches(m.text) && (!options.politeness || m.politeness === options.politeness),
    );
    const showPoliteness = Boolean(options.politeness);
    const list = messages.length
      ? messages.map((m) => `  "${m.text}"${showPoliteness ? ` (${m.politeness})` : ''}`).join('\n')
      : '  (nothing)';
    const what = `${typeof expected === 'string' ? `"${expected}"` : String(expected)}${options.politeness ? ` (${options.politeness})` : ''}`;
    return {
      pass,
      message: () =>
        pass
          ? `Expected no announcement matching ${what}, but it was announced. Announced:\n${list}`
          : `Expected an announcement matching ${what}. Announced:\n${list}`,
    };
  },

  toHaveNoAxeViolations(received: A11yCheckResult) {
    if (!received || !Array.isArray((received as A11yCheckResult).violations)) {
      return {
        pass: false,
        message: () => 'toHaveNoAxeViolations expects the result of `await checkA11y(fixture)`.',
      };
    }
    const pass = received.violations.length === 0;
    return {
      pass,
      message: () => (pass ? 'Expected axe violations, but there were none.' : formatViolations(received)),
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
   * (a string matches a whole message), or matching it (a RegExp). Pass
   * `{ politeness: 'assertive' }` to check that too (recorders only).
   */
  toHaveAnnounced(expected: string | RegExp, options?: { politeness?: 'polite' | 'assertive' }): R;
  /** The result of `await checkA11y(...)` has no violations. Failures list each one with its component. */
  toHaveNoAxeViolations(): R;
  /** Tab and Shift+Tab stay inside this element and reach every stop. Await it. */
  toBeFocusTrapped(options?: FocusCheckOptions): Promise<R>;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Matchers<T = any> extends A11yMatchers<T> {}
}
