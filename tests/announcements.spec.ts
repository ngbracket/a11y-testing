import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/vitest';
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

  it('whenQuiet, waitFor and captureAnnouncements refuse to hang under fake timers', async () => {
    const recorder = recordAnnouncements();
    vi.useFakeTimers();
    try {
      await expect(recorder.whenQuiet()).rejects.toThrow(/fake timers/);
      await expect(recorder.waitFor('x')).rejects.toThrow(/fake timers/);
      await expect(captureAnnouncements({ whenStable: async () => undefined }, () => undefined)).rejects.toThrow(
        /settleMs: 0/,
      );
      await expect(
        captureAnnouncements({ whenStable: async () => undefined }, () => undefined, { settleMs: 0 }),
      ).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
      recorder.stop();
    }
  });
});

describe('waitFor', () => {
  it('resolves as soon as the message is written, without waiting for quiet', async () => {
    const region = liveRegion('assertive');
    const recorder = recordAnnouncements(document, { quietMs: 1000 });
    region.textContent = '';
    setTimeout(() => (region.textContent = 'Grabbed Card A'), 50);

    const started = Date.now();
    const found = await recorder.waitFor(/Grabbed/, { politeness: 'assertive' });
    expect(Date.now() - started).toBeLessThan(500);
    expect(found).toEqual({ text: 'Grabbed Card A', politeness: 'assertive' });
    recorder.stop();
  });

  it('resolves at once for a message recorded before the call, back to the last clear()', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements(document);
    region.textContent = 'old';
    await tick();
    recorder.clear();
    region.textContent = 'Saved';
    // No tick: waitFor reads records the observer hasn't delivered yet.
    await expect(recorder.waitFor('Saved', { timeoutMs: 1 })).resolves.toEqual({ text: 'Saved', politeness: 'polite' });
    await expect(recorder.waitFor('old', { timeoutMs: 20 })).rejects.toThrow(/"old"/);
    recorder.stop();
  });

  it('keeps waiting past a message with the wrong politeness or a partial match', async () => {
    const polite = liveRegion('polite');
    const assertive = liveRegion('assertive');
    const recorder = recordAnnouncements(document);
    setTimeout(() => (polite.textContent = 'Moved'), 10);
    setTimeout(() => (assertive.textContent = 'Moved to Done'), 30);
    setTimeout(() => (assertive.textContent = 'Moved'), 50);

    await expect(recorder.waitFor('Moved', { politeness: 'assertive' })).resolves.toEqual({
      text: 'Moved',
      politeness: 'assertive',
    });
    expect(recorder.announcements).toEqual(['Moved', 'Moved to Done', 'Moved']);
    recorder.stop();
  });

  it('rejects after the timeout and lists what was announced', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements(document);
    region.textContent = '3 results';
    await expect(recorder.waitFor('4 results', { politeness: 'polite', timeoutMs: 30 })).rejects.toThrow(
      'Expected an announcement matching "4 results" (polite) within 30 ms. Announced:\n  "3 results" (polite)',
    );
    recorder.stop();
  });

  it('matches a global RegExp every time', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements(document);
    region.textContent = 'Saved';
    const saved = /Saved/g;
    await recorder.waitFor(saved);
    await recorder.waitFor(saved);
    expect(recorder).toHaveAnnounced(saved);
    recorder.stop();
  });

  it('resolves a pending wait whose message is still queued when the recorder stops', async () => {
    const region = liveRegion();
    const recorder = recordAnnouncements(document);
    const pending = recorder.waitFor('Saved');
    region.textContent = 'Saved'; // queued: the observer hasn't delivered it yet
    recorder.stop();
    await expect(pending).resolves.toEqual({ text: 'Saved', politeness: 'polite' });
  });

  it('rejects a pending wait when the recorder stops, and any wait after it', async () => {
    liveRegion();
    const recorder = recordAnnouncements(document);
    const pending = recorder.waitFor('never');
    recorder.stop();
    await expect(pending).rejects.toThrow(/stopped before the announcement came/);
    await expect(recorder.waitFor('never')).rejects.toThrow(/the recorder was stopped/);
  });
});
