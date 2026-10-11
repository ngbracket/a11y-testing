/**
 * Capture what a component announces to assistive technology.
 *
 * axe checks a snapshot of the page. An announcement is text written into an
 * ARIA live region over time, so axe can't check it. This records text written
 * to any live region (`[aria-live]`, `role="status"`, `role="alert"`) so tests
 * can assert on it. It uses only the DOM, so it works in jsdom.
 */
const LIVE_SELECTOR = '[aria-live], [role="status"], [role="alert"]';

/** One message written to a live region, with how urgently it's announced. */
export interface Announcement {
  text: string;
  /**
   * `assertive` for `aria-live="assertive"` or `role="alert"`, else `polite`.
   * Read when the text is written, since announcers often switch it per message.
   */
  politeness: 'polite' | 'assertive';
}

export interface AnnouncementRecorder {
  /** Messages announced since recording started (or since the last `clear()`). */
  readonly announcements: readonly string[];
  /** The same messages with their politeness. */
  readonly messages: readonly Announcement[];
  /** Drop everything recorded so far (e.g. to ignore setup-time announcements). */
  clear(): void;
  /**
   * Resolve once no live region has changed for `quietMs` (default: the
   * recorder's `quietMs`, 100 unless set), so an announcer that writes its text
   * on a timer has finished. Uses real timers. Gives up waiting after
   * `timeoutMs` (default 2000) and resolves anyway.
   */
  whenQuiet(quietMs?: number, timeoutMs?: number): Promise<void>;
  /**
   * Resolve with the first message equal to `expected` (a string matches a whole
   * message) or matching it (a RegExp), as soon as it's written. Messages recorded
   * before the call count too, back to the last `clear()`. Rejects after
   * `timeoutMs` (default 1000), listing what was announced. Uses real timers.
   */
  waitFor(expected: string | RegExp, options?: WaitForOptions): Promise<Announcement>;
  /** Stop observing. A `waitFor()` still waiting rejects. */
  stop(): void;
}

export interface WaitForOptions {
  /** Only accept a message with this politeness. */
  readonly politeness?: Announcement['politeness'];
  /** How long to wait before rejecting, in milliseconds. Default 1000. */
  readonly timeoutMs?: number;
}

/** True when `message` is `expected` (whole text) or matches it, with the politeness if given. */
export function matchesAnnouncement(
  message: Announcement,
  expected: string | RegExp,
  politeness?: Announcement['politeness'],
): boolean {
  if (politeness && message.politeness !== politeness) return false;
  if (typeof expected === 'string') return message.text === expected;
  expected.lastIndex = 0; // a /g or /y RegExp keeps state between test() calls
  return expected.test(message.text);
}

/** `"3 results" (assertive)` or `/Grabbed/`: how failure messages name what was expected. */
export function describeExpected(expected: string | RegExp, politeness?: Announcement['politeness']): string {
  const what = typeof expected === 'string' ? `"${expected}"` : String(expected);
  return politeness ? `${what} (${politeness})` : what;
}

/** The recorded messages, one per line, for failure messages. */
export function listAnnouncements(messages: readonly Announcement[], showPoliteness: boolean): string {
  if (!messages.length) return '  (nothing)';
  return messages.map((m) => `  "${m.text}"${showPoliteness ? ` (${m.politeness})` : ''}`).join('\n');
}

/** True while Vitest or Jest fake timers (@sinonjs/fake-timers) replace setTimeout. */
export function fakeTimersInstalled(): boolean {
  return 'clock' in (globalThis.setTimeout as object);
}

function politenessOf(region: Element): Announcement['politeness'] {
  const live = region.getAttribute('aria-live');
  if (live === 'assertive') return 'assertive';
  if (live === null && region.getAttribute('role') === 'alert') return 'assertive';
  return 'polite';
}

export interface RecordOptions {
  /**
   * How long live regions must stay unchanged before `whenQuiet()` resolves, in
   * milliseconds. Default 100. Set it just above your announcer's delay: the CDK
   * `LiveAnnouncer` writes after 100 ms, so use 150 there; an announcer with a
   * 50 ms delay can use 75.
   */
  readonly quietMs?: number;
}

export function recordAnnouncements(
  root: Element | Document = document,
  options: RecordOptions = {},
): AnnouncementRecorder {
  const announcements: string[] = [];
  const messages: Announcement[] = [];
  // The last text seen per region. Writing the same text again only counts as a
  // new announcement after the region was emptied, which is how announcers
  // repeat a message.
  const lastText = new WeakMap<Element, string>();
  let lastChange = Date.now();
  let stopped = false;
  // waitFor() calls still waiting: each checks the messages again after a new one.
  const waiters = new Set<{ check(): void; fail(error: Error): void }>();

  const capture = (region: Element): void => {
    const text = (region.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (lastText.get(region) === text) return;
    lastText.set(region, text);
    if (!text) return;
    announcements.push(text);
    messages.push({ text, politeness: politenessOf(region) });
    for (const waiter of [...waiters]) waiter.check();
  };

  const process = (records: MutationRecord[]): void => {
    for (const record of records) {
      const node = record.target;
      const el = node instanceof Element ? node : node.parentElement;
      const region = el?.closest(LIVE_SELECTOR);
      // An explicit aria-live="off" suppresses announcements even on a
      // role="status"/"alert" element (which would otherwise imply a live region).
      if (region && region.getAttribute('aria-live') !== 'off') {
        lastChange = Date.now();
        capture(region);
      }
    }
  };
  const observer = new MutationObserver(process);

  observer.observe(root, { subtree: true, childList: true, characterData: true });

  return {
    announcements,
    messages,
    clear: () => {
      announcements.length = 0;
      messages.length = 0;
    },
    whenQuiet: async (quietMs = options.quietMs ?? 100, timeoutMs = 2000) => {
      if (fakeTimersInstalled()) {
        throw new Error(
          'whenQuiet() waits on real timers, so it would never finish under fake timers. ' +
            'Advance the timers yourself (vi.advanceTimersByTime), then read recorder.messages.',
        );
      }
      const start = Date.now();
      lastChange = Math.max(lastChange, start);
      for (;;) {
        process(observer.takeRecords());
        const quietFor = Date.now() - lastChange;
        if (quietFor >= quietMs || Date.now() - start >= timeoutMs) return;
        await new Promise((resolve) => setTimeout(resolve, Math.min(quietMs - quietFor, 25) || 1));
      }
    },
    waitFor: (expected, { politeness, timeoutMs = 1000 } = {}) => {
      if (fakeTimersInstalled()) {
        return Promise.reject(
          new Error(
            'waitFor() waits on real timers, so it would never finish under fake timers. ' +
              'Advance the timers yourself (vi.advanceTimersByTime), then check the recorder with toHaveAnnounced().',
          ),
        );
      }
      process(observer.takeRecords());
      const find = () => messages.find((m) => matchesAnnouncement(m, expected, politeness));
      const already = find();
      if (already) return Promise.resolve(already);
      const what = describeExpected(expected, politeness);
      if (stopped) {
        return Promise.reject(new Error(`waitFor(${what}): the recorder was stopped.`));
      }
      return new Promise<Announcement>((resolve, reject) => {
        const waiter = {
          check: () => {
            const found = find();
            if (!found) return;
            done();
            resolve(found);
          },
          fail: (error: Error) => {
            done();
            reject(error);
          },
        };
        const timer = setTimeout(() => {
          process(observer.takeRecords());
          if (!waiters.has(waiter)) return; // the last records held a match
          waiter.fail(
            new Error(
              `Expected an announcement matching ${what} within ${timeoutMs} ms. Announced:\n` +
                listAnnouncements(messages, Boolean(politeness)),
            ),
          );
        }, timeoutMs);
        const done = () => {
          clearTimeout(timer);
          waiters.delete(waiter);
        };
        waiters.add(waiter);
      });
    },
    stop: () => {
      // Handle changes the observer has queued but not yet delivered.
      process(observer.takeRecords());
      observer.disconnect();
      stopped = true;
      for (const waiter of [...waiters]) waiter.fail(new Error('waitFor(): the recorder was stopped before the announcement came.'));
    },
  };
}
