import { afterEach, describe, expect, it } from 'vitest';
import '../src/vitest';
import { recordAnnouncements } from '../src';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('toHaveAnnounced', () => {
  it('matches a whole message with a string, part of one with a RegExp', () => {
    const announced = ['3 results', 'Sorted by name'];
    expect(announced).toHaveAnnounced('3 results');
    expect(announced).not.toHaveAnnounced('3');
    expect(announced).toHaveAnnounced(/sorted/i);
  });

  it('accepts a recorder', async () => {
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    document.body.appendChild(region);
    const recorder = recordAnnouncements();
    region.textContent = 'Saved';
    await new Promise((r) => setTimeout(r, 0));
    recorder.stop();
    expect(recorder).toHaveAnnounced('Saved');
  });

  it('lists what was announced when it fails', () => {
    expect(() => expect(['Saved']).toHaveAnnounced('Deleted')).toThrow(
      'Expected an announcement matching "Deleted". Announced:\n  "Saved"',
    );
    expect(() => expect([]).toHaveAnnounced('Deleted')).toThrow('(nothing)');
  });
});

describe('toBeFocusTrapped', () => {
  it('passes and fails like expectFocusTrapped', async () => {
    document.body.innerHTML = '<div id="d"><button>A</button></div><button>Behind</button>';
    const dialog = document.getElementById('d')!;
    await expect(dialog).not.toBeFocusTrapped();
    await expect(expect(dialog).toBeFocusTrapped()).rejects.toThrow(/moved focus out of the container/);
  });
});
