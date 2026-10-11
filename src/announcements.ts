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
  /** Stop observing. */
  stop(): void;
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

  const capture = (region: Element): void => {
    const text = (region.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (lastText.get(region) === text) return;
    lastText.set(region, text);
    if (!text) return;
    announcements.push(text);
    messages.push({ text, politeness: politenessOf(region) });
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
    stop: () => {
      // Handle changes the observer has queued but not yet delivered.
      process(observer.takeRecords());
      observer.disconnect();
    },
  };
}
