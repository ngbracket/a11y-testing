/**
 * Capture what a component announces to assistive technology.
 *
 * axe cannot see this — announcements are a behavioral, time-dependent DOM change
 * (text pushed into an ARIA live region), not a static snapshot property. This
 * records text pushed into any live region (`[aria-live]`, `role="status"`,
 * `role="alert"`) so tests can assert on it. Pure DOM: works in jsdom, no browser
 * mode required.
 */
const LIVE_SELECTOR = '[aria-live], [role="status"], [role="alert"]';

export interface AnnouncementRecorder {
  /** Messages announced since recording started (or since the last `clear()`). */
  readonly announcements: readonly string[];
  /** Drop everything recorded so far (e.g. to ignore setup-time announcements). */
  clear(): void;
  /** Stop observing. */
  stop(): void;
}

export function recordAnnouncements(root: Element | Document = document): AnnouncementRecorder {
  const announcements: string[] = [];

  const capture = (region: Element): void => {
    const text = (region.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text && announcements[announcements.length - 1] !== text) {
      announcements.push(text);
    }
  };

  const process = (records: MutationRecord[]): void => {
    for (const record of records) {
      const node = record.target;
      const el = node instanceof Element ? node : node.parentElement;
      const region = el?.closest(LIVE_SELECTOR);
      // An explicit aria-live="off" suppresses announcements even on a
      // role="status"/"alert" element (which would otherwise imply a live region).
      if (region && region.getAttribute('aria-live') !== 'off') capture(region);
    }
  };
  const observer = new MutationObserver(process);

  observer.observe(root, { subtree: true, childList: true, characterData: true });

  return {
    announcements,
    clear: () => {
      announcements.length = 0;
    },
    stop: () => {
      // Handle changes the observer has queued but not yet delivered.
      process(observer.takeRecords());
      observer.disconnect();
    },
  };
}
