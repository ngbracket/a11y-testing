import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureAnnouncements, recordAnnouncements } from '../src';

/** Let queued MutationObserver callbacks flush. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Build a live region attached to the document (announcements need a real DOM). */
function liveRegion(politeness = 'polite'): HTMLElement {
  const region = document.createElement('div');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', politeness);
  document.body.appendChild(region);
  return region;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('recordAnnouncements', () => {
  it('records text pushed into a live region', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements(document);

    region.textContent = 'Saved 3 items';
    await tick();

    expect(recorder.announcements).toContain('Saved 3 items');
    recorder.stop();
  });

  it('records nothing for an empty region', async () => {
    liveRegion();
    const recorder = recordAnnouncements(document);
    await tick();

    expect(recorder.announcements).toEqual([]);
    recorder.stop();
  });

  it('ignores aria-live="off" regions', async () => {
    const region = liveRegion('off');
    const recorder = recordAnnouncements(document);

    region.textContent = 'should be ignored';
    await tick();

    expect(recorder.announcements).toEqual([]);
    recorder.stop();
  });

  it('clear() drops prior announcements', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements(document);

    region.textContent = 'first';
    await tick();
    recorder.clear();
    region.textContent = 'second';
    await tick();

    expect(recorder.announcements).toEqual(['second']);
    recorder.stop();
  });
});

describe('captureAnnouncements', () => {
  // A structural stand-in for a ComponentFixture: whatever settles pending work.
  const fixtureFor = (root: Element) => ({
    nativeElement: root,
    whenStable: () => tick(),
  });

  it('returns only what the action announced, stabilizing around it', async () => {
    const region = liveRegion();
    const fixture = fixtureFor(document.body);

    const announced = await captureAnnouncements(fixture, () => {
      region.textContent = 'Filters applied';
    });

    expect(announced).toEqual(['Filters applied']);
  });

  it('drops announcements made before the action (clears after setup)', async () => {
    const region = liveRegion();
    // whenStable() runs before the action: announce during it, as a component's
    // first render might.
    const fixture = {
      nativeElement: document.body,
      whenStable: async () => {
        if (!region.textContent) region.textContent = 'setup message';
        await tick();
      },
    };
    const announced = await captureAnnouncements(fixture, () => {
      region.textContent = 'the real one';
    });

    expect(announced).toEqual(['the real one']);
  });

  it('captures a delayed announcement in a region outside the fixture (CDK LiveAnnouncer)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fixture = fixtureFor(host);

    const announced = await captureAnnouncements(fixture, () => {
      // LiveAnnouncer: a region on <body>, text set after ~100 ms.
      const region = liveRegion('polite');
      setTimeout(() => {
        region.textContent = 'Saved';
      }, 100);
    });

    expect(announced).toEqual(['Saved']);
  });

  it('awaits stabilization so async announcements are captured', async () => {
    const region = liveRegion();
    const fixture = fixtureFor(document.body);

    const announced = await captureAnnouncements(fixture, () => {
      // Simulate a zoneless deferred update: text lands on a later task.
      setTimeout(() => {
        region.textContent = 'Loaded';
      }, 0);
    });

    expect(announced).toEqual(['Loaded']);
  });
});

describe('politeness, repeats and whenQuiet', () => {
  it('records politeness when the text is written', async () => {
    const region = liveRegion('polite');
    const alert = document.createElement('div');
    alert.setAttribute('role', 'alert');
    document.body.appendChild(alert);
    const recorder = recordAnnouncements();

    region.textContent = 'Saved';
    await tick();
    region.setAttribute('aria-live', 'assertive');
    region.textContent = 'Connection lost';
    alert.textContent = 'Error';
    await tick();

    expect(recorder.messages).toEqual([
      { text: 'Saved', politeness: 'polite' },
      { text: 'Connection lost', politeness: 'assertive' },
      { text: 'Error', politeness: 'assertive' },
    ]);
    recorder.stop();
  });

  it('counts the same message again after the region was emptied', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements();
    region.textContent = 'Saved';
    await tick();
    region.textContent = '';
    await tick();
    region.textContent = 'Saved';
    await tick();
    expect(recorder.announcements).toEqual(['Saved', 'Saved']);
    recorder.stop();
  });

  it('whenQuiet waits for a timer-delayed announcement', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements(document, { quietMs: 75 });
    region.textContent = '';
    setTimeout(() => (region.textContent = 'Dropped'), 50);
    await recorder.whenQuiet();
    expect(recorder.announcements).toEqual(['Dropped']);
    recorder.stop();
  });

  it('whenQuiet and captureAnnouncements refuse to hang under fake timers', async () => {
    const recorder = recordAnnouncements();
    vi.useFakeTimers();
    try {
      await expect(recorder.whenQuiet()).rejects.toThrow(/fake timers/);
      await expect(captureAnnouncements({ whenStable: async () => undefined }, () => undefined)).rejects.toThrow(
        /settleMs: 0/,
      );
    } finally {
      vi.useRealTimers();
      recorder.stop();
    }
  });
});
