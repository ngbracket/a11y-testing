import { fakeTimersInstalled, recordAnnouncements } from './announcements.js';
import type { AngularFixtureLike } from './fixture.js';

export interface CaptureOptions {
  /**
   * How long to keep listening after the fixture settles, in milliseconds. The
   * CDK `LiveAnnouncer` writes its message about 100 ms after `announce()`.
   * Default 150; 0 skips the wait (for fake timers).
   */
  readonly settleMs?: number;
}

/**
 * Run `action`, then return everything it announced.
 *
 * Under zoneless change detection (the Angular default since v21) a signal change
 * renders on a later tick, so the live region isn't updated until the fixture
 * settles. We call `whenStable()` after the action so the announcement is in the
 * DOM before we read it. Setup-time announcements are cleared, so only
 * `action`'s output is returned.
 *
 * The whole document is observed, not only the fixture: the CDK `LiveAnnouncer`
 * puts its live region on `<body>`, outside the component.
 */
export async function captureAnnouncements(
  fixture: AngularFixtureLike,
  action: () => unknown,
  options: CaptureOptions = {},
): Promise<string[]> {
  const recorder = recordAnnouncements(document);
  await fixture.whenStable(); // settle initial render
  recorder.clear();

  await action();
  await fixture.whenStable(); // zoneless: wait for the signal-triggered CD
  const settleMs = options.settleMs ?? 150;
  if (settleMs > 0 && fakeTimersInstalled()) {
    recorder.stop();
    throw new Error(
      'captureAnnouncements() waits settleMs on a real timer, which never fires under fake timers. ' +
        'Pass { settleMs: 0 } and advance the timers in the action.',
    );
  }
  if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));

  recorder.stop();
  return [...recorder.announcements];
}
