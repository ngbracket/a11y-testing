import { afterEach, describe, expect, it, vi } from 'vitest';
import { press, settle, shiftTab, tab, tabOrder } from '../src';

afterEach(() => {
  document.body.innerHTML = '';
});

function render(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector(selector) as unknown as T;

describe('press', () => {
  it('fills in key, code, keyCode and modifiers', async () => {
    render('<input id="a">');
    const seen: KeyboardEvent[] = [];
    $('#a').addEventListener('keydown', (e) => seen.push(e));

    await press($('#a'), 'Control+b');
    await press($('#a'), 'Shift+ArrowDown');
    await press($('#a'), 'Space');
    await press($('#a'), 'Shift+b');

    expect(seen.map((e) => [e.key, e.code, e.keyCode, e.ctrlKey, e.shiftKey])).toEqual([
      ['b', 'KeyB', 66, true, false],
      ['ArrowDown', 'ArrowDown', 40, false, true],
      [' ', 'Space', 32, false, false],
      ['B', 'KeyB', 66, false, true],
    ]);
  });

  it('parses a plus key and rejects unknown keys and modifiers', async () => {
    render('<input id="a">');
    const keys: string[] = [];
    $('#a').addEventListener('keydown', (e) => keys.push(`${e.ctrlKey ? 'C-' : ''}${e.key}`));
    await press($('#a'), 'Control++');
    expect(keys).toEqual(['C-+']);

    await expect(press($('#a'), 'Hyper')).rejects.toThrow(/unknown key "Hyper"/);
    await expect(press($('#a'), 'Enter+a')).rejects.toThrow(/isn't a modifier/);
  });

  it('presses on the focused element when no target is given and returns the keydown', async () => {
    render('<button id="b">B</button>');
    $('#b').focus();
    $('#b').addEventListener('keydown', (e) => e.preventDefault());

    const event = await press('Escape');

    expect(event.target).toBe($('#b'));
    expect(event.defaultPrevented).toBe(true);
  });

  it('sends keyup after keydown', async () => {
    render('<input id="a">');
    const types: string[] = [];
    $('#a').addEventListener('keydown', (e) => types.push(e.type));
    $('#a').addEventListener('keyup', (e) => types.push(e.type));
    await press($('#a'), 'a');
    expect(types).toEqual(['keydown', 'keyup']);
  });

  it('Enter clicks a native button, Space clicks a native button and checkbox', async () => {
    render('<button id="b">B</button><input id="c" type="checkbox">');
    const click = vi.fn();
    $('#b').addEventListener('click', click);

    $('#b').focus();
    await press($('#b'), 'Enter');
    await press($('#b'), ' ');
    $('#c').focus();
    await press($('#c'), ' ');

    expect(click).toHaveBeenCalledTimes(2);
    expect($<HTMLInputElement>('#c').checked).toBe(true);
  });

  it('runs no default action on an element that does not have focus', async () => {
    render('<button id="b">B</button><button id="other">Other</button>');
    const click = vi.fn();
    $('#b').addEventListener('click', click);
    $('#other').focus();

    await press($('#b'), 'Enter');
    await press($('#b'), 'Tab');

    expect(click).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('other');
  });

  it('does not activate a div with role="button": that needs its own key handler', async () => {
    render('<div id="d" role="button" tabindex="0">D</div>');
    const click = vi.fn();
    $('#d').addEventListener('click', click);
    $('#d').focus();

    await press($('#d'), 'Enter');
    await press($('#d'), ' ');

    expect(click).not.toHaveBeenCalled();
  });

  it('skips the default action when the keydown is cancelled', async () => {
    render('<button id="b">B</button>');
    const click = vi.fn();
    $('#b').addEventListener('click', click);
    $('#b').addEventListener('keydown', (e) => e.preventDefault());
    $('#b').focus();

    await press($('#b'), 'Enter');
    await press($('#b'), ' ');

    expect(click).not.toHaveBeenCalled();
  });

  it('does not click a disabled button', async () => {
    render('<button id="b" disabled>B</button>');
    const click = vi.fn();
    $('#b').addEventListener('click', click);
    await press($('#b'), 'Enter');
    expect(click).not.toHaveBeenCalled();
  });

  it('settles the fixture when given one', async () => {
    render('<input id="a">');
    const fixture = { detectChanges: vi.fn(), whenStable: vi.fn(async () => undefined) };
    await press($('#a'), 'a', { fixture });
    expect(fixture.detectChanges).toHaveBeenCalledOnce();
    expect(fixture.whenStable).toHaveBeenCalledOnce();
  });
});

describe('tab and shiftTab', () => {
  it('move focus through the tab order, skipping what Tab skips', async () => {
    render(`
      <button id="a">A</button>
      <button id="disabled" disabled>X</button>
      <div tabindex="-1" id="minus">X</div>
      <span hidden><button>X</button></span>
      <div inert><button>X</button></div>
      <button id="none" style="display: none">X</button>
      <details><summary id="sum">More</summary><button>inside</button></details>
      <input id="b">
    `);
    $('#a').focus();

    expect((await tab())?.id).toBe('sum');
    expect((await tab())?.id).toBe('b');
    expect((await shiftTab())?.id).toBe('sum');
  });

  it('treats a named radio group as one stop: the checked radio, else first or last', async () => {
    render(`
      <button id="a">A</button>
      <input type="radio" name="size" id="s"><input type="radio" name="size" id="m" checked><input type="radio" name="size" id="l">
      <input type="radio" name="colour" id="red"><input type="radio" name="colour" id="blue">
      <button id="z">Z</button>
    `);
    expect(tabOrder().map((el) => el.id)).toEqual(['a', 'm', 'red', 'z']);

    $('#a').focus();
    expect((await tab())?.id).toBe('m');
    expect((await tab())?.id).toBe('red');
    expect((await tab())?.id).toBe('z');
    expect((await shiftTab())?.id).toBe('blue');
    expect((await shiftTab())?.id).toBe('m');
  });

  it('counts a visibility: visible child of a hidden parent as shown', () => {
    render('<div style="visibility: hidden"><button id="a">A</button><button id="b" style="visibility: visible">B</button></div>');
    expect(tabOrder().map((el) => el.id)).toEqual(['b']);
  });

  it('puts positive tabindex first', () => {
    render('<button id="a">A</button><button id="b" tabindex="2">B</button><button id="c" tabindex="1">C</button>');
    expect(tabOrder().map((el) => el.id)).toEqual(['c', 'b', 'a']);
  });

  it('wraps past the ends of the page', async () => {
    render('<button id="a">A</button><button id="b">B</button>');
    $('#b').focus();
    expect((await tab())?.id).toBe('a');
    expect((await shiftTab())?.id).toBe('b');
  });

  it('starts from the body when nothing is focused', async () => {
    render('<button id="a">A</button><button id="b">B</button>');
    expect((await tab())?.id).toBe('a');
  });

  it('continues from the DOM position of a tabindex="-1" element', async () => {
    render('<button id="a">A</button><div id="panel" tabindex="-1"><button id="b">B</button></div><button id="c">C</button>');
    $('#panel').focus();
    expect((await tab())?.id).toBe('b');
    $('#panel').focus();
    expect((await shiftTab())?.id).toBe('a');
  });

  it('leaves focus alone when a keydown handler cancels Tab', async () => {
    render('<button id="a">A</button><button id="b">B</button>');
    $('#a').addEventListener('keydown', (e) => e.preventDefault());
    $('#a').focus();
    expect((await tab())?.id).toBe('a');
  });

  it('sends keyup to the element focus moved to', async () => {
    render('<button id="a">A</button><button id="b">B</button>');
    const keyup = vi.fn();
    $('#b').addEventListener('keyup', keyup);
    $('#a').focus();
    await tab();
    expect(keyup).toHaveBeenCalledOnce();
  });

  it('lands on focus-trap sentinels so a trap can send focus on', async () => {
    render(`
      <button id="outside">Out</button>
      <div id="start" tabindex="0" aria-hidden="true"></div>
      <div id="dialog"><button id="first">1</button><button id="last">2</button></div>
      <div id="end" tabindex="0" aria-hidden="true"></div>
    `);
    $('#end').addEventListener('focus', () => $('#first').focus());
    $('#start').addEventListener('focus', () => $('#last').focus());

    $('#last').focus();
    expect((await tab())?.id).toBe('first');
    expect((await shiftTab())?.id).toBe('last');
  });
});

describe('settle', () => {
  it('runs change detection, then waits for stability', async () => {
    const calls: string[] = [];
    await settle({
      detectChanges: () => calls.push('detectChanges'),
      whenStable: async () => calls.push('whenStable'),
    });
    expect(calls).toEqual(['detectChanges', 'whenStable']);
  });
});
