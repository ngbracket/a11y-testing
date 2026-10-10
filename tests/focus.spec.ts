import { afterEach, describe, expect, it } from 'vitest';
import {
  activeDescendant,
  checkFocusTrapped,
  describeElement,
  expectFocusReturn,
  expectFocusTrapped,
  press,
  stubLayout,
  tabWalkthrough,
} from '../src';

afterEach(() => {
  document.body.innerHTML = '';
});

function render(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

const $ = (selector: string) => document.querySelector(selector) as HTMLElement;

/** A minimal disclosure menu: opens on click, closes on Escape, optionally restores focus. */
function menu(restoreFocus: boolean): HTMLElement {
  render('<button id="trigger">Actions</button><div id="menu" hidden><button id="item">Rename</button></div>');
  $('#trigger').addEventListener('click', () => {
    $('#menu').hidden = false;
    $('#item').focus();
  });
  $('#menu').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $('#menu').hidden = true;
    if (restoreFocus) $('#trigger').focus();
  });
  return $('#trigger');
}

describe('expectFocusReturn', () => {
  it('passes when focus goes back to the trigger', async () => {
    const trigger = menu(true);
    await expectFocusReturn(trigger, () => trigger.click(), () => press('Escape'));
  });

  it('says where focus went when it does not return', async () => {
    const trigger = menu(false);
    await expect(expectFocusReturn(trigger, () => trigger.click(), () => press('Escape'))).rejects.toThrow(
      'Focus didn\'t return to button "Actions". It\'s on a hidden <button#item> ("Rename"), so in a browser focus would be lost to the page body.',
    );
  });
});

describe('checkFocusTrapped / expectFocusTrapped', () => {
  it('passes for a keydown-handler trap that wraps both ways', async () => {
    render('<button>Behind</button><div id="dialog"><button id="a">A</button><input id="b"><button id="c">C</button></div>');
    $('#dialog').addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const stops = [$('#a'), $('#b'), $('#c')];
      const i = stops.indexOf(document.activeElement as HTMLElement);
      if (!e.shiftKey && i === stops.length - 1) {
        e.preventDefault();
        stops[0].focus();
      } else if (e.shiftKey && i === 0) {
        e.preventDefault();
        stops[stops.length - 1].focus();
      }
    });
    await expectFocusTrapped($('#dialog'));
  });

  it('names where focus escaped to', async () => {
    render('<div id="dialog"><button>A</button><button>Last</button></div><a href="#x">Behind</a>');
    const result = await checkFocusTrapped($('#dialog'));
    expect(result.pass).toBe(false);
    expect(result.message).toBe('Tab from button "Last" moved focus out of the container, to link "Behind".');
  });

  it('fails a trap that keeps focus in but gets stuck', async () => {
    render('<div id="dialog"><button id="a">A</button><button id="b">B</button></div><button>Behind</button>');
    $('#dialog').addEventListener('keydown', (e) => {
      if (e.key === 'Tab') e.preventDefault();
    });
    await expect(expectFocusTrapped($('#dialog'))).rejects.toThrow(/never reached button "B"/);
  });

  it('fails a container with no trap that holds the only stops on the page', async () => {
    render('<div id="dialog"><button>A</button><button>B</button></div>');
    const result = await checkFocusTrapped($('#dialog'));
    expect(result.pass).toBe(false);
    expect(result.message).toBe(
      'Tab from button "B" went past the last stop on the page, so in a browser focus would leave the page. ' +
        'Nothing kept it inside the container.',
    );
  });

  it('counts a radio group as one stop', async () => {
    render(`
      <div id="dialog">
        <button id="first">First</button>
        <input type="radio" name="r" aria-label="One"><input type="radio" name="r" aria-label="Two">
      </div>
      <button>Behind</button>
    `);
    const stops = () => [...$('#dialog').querySelectorAll<HTMLElement>('button, input')];
    $('#dialog').addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const active = document.activeElement as HTMLElement;
      const last = stops()[stops().length - 1];
      if (!e.shiftKey && (active as HTMLInputElement).type === 'radio') {
        e.preventDefault();
        stops()[0].focus();
      } else if (e.shiftKey && active === stops()[0]) {
        e.preventDefault();
        last.focus();
      }
    });
    await expectFocusTrapped($('#dialog'));
  });

  it('fails a container with no tab stops', async () => {
    render('<div id="dialog"><p>Text</p></div>');
    await expect(expectFocusTrapped($('#dialog'))).rejects.toThrow(/no tab stops/);
  });

  it('hints at stubLayout when focus stays on a sentinel', async () => {
    // A sentinel trap whose redirect depends on layout, as the CDK's does.
    render(`
      <div class="anchor" tabindex="0" aria-hidden="true"></div>
      <div id="dialog"><button id="a">A</button><button id="b">B</button></div>
      <div class="anchor" tabindex="0" aria-hidden="true"></div>
    `);
    const [start, end] = document.querySelectorAll<HTMLElement>('.anchor');
    const visible = (el: HTMLElement) => el.offsetWidth > 0;
    end.addEventListener('focus', () => visible($('#a')) && $('#a').focus());
    start.addEventListener('focus', () => visible($('#b')) && $('#b').focus());

    const result = await checkFocusTrapped($('#dialog'));
    expect(result.message).toMatch(/focus-trap sentinel.*stubLayout\(\)/);

    const restore = stubLayout();
    try {
      await expectFocusTrapped($('#dialog'));
    } finally {
      restore();
    }
    expect($('#a').offsetWidth).toBe(0);
  });
});

describe('activeDescendant', () => {
  it('returns the element aria-activedescendant points at', () => {
    render('<input id="combo" aria-activedescendant="opt2"><ul><li id="opt1">One</li><li id="opt2">Two</li></ul>');
    $('#combo').focus();
    expect(activeDescendant()?.textContent).toBe('Two');
    expect(activeDescendant($('#opt1'))).toBeNull();
  });

  it('returns null when the id points at nothing', () => {
    render('<input id="combo" aria-activedescendant="gone">');
    expect(activeDescendant($('#combo'))).toBeNull();
  });
});

describe('stubLayout', () => {
  it('gives connected, displayed elements a 1x1 box and puts things back', () => {
    render('<button id="a">A</button><button id="b" style="display:none">B</button>');
    const detached = document.createElement('button');
    const restore = stubLayout();
    expect([$('#a').offsetWidth, $('#b').offsetWidth, detached.offsetHeight]).toEqual([1, 0, 0]);
    restore();
    expect($('#a').offsetWidth).toBe(0);
  });

  it('restores once: a second call does not reinstate an outer stub', () => {
    render('<button id="a">A</button>');
    const outer = stubLayout();
    const inner = stubLayout();
    inner();
    outer();
    inner();
    expect($('#a').offsetWidth).toBe(0);
  });
});

describe('describeElement and tabWalkthrough', () => {
  it('computes role, name, description and states', () => {
    render(`
      <button id="b" aria-expanded="false" aria-haspopup="menu" aria-describedby="hint">Filters</button>
      <span id="hint">Narrow the list</span>
      <input id="email" aria-label="Email" required aria-invalid="true">
    `);
    expect(describeElement($('#b'))).toEqual({
      role: 'button',
      name: 'Filters',
      description: 'Narrow the list',
      states: ['collapsed', 'has menu popup'],
    });
    expect(describeElement($('#email'))).toMatchObject({ role: 'textbox', name: 'Email', states: ['required', 'invalid'] });
  });

  it('writes one line per tab stop', () => {
    render(`
      <label>Search <input type="search"></label>
      <button aria-pressed="true">Bold</button>
      <a href="/help">Help</a>
      <div role="button" tabindex="0"></div>
      <button tabindex="3">Skip</button>
    `);
    expect(tabWalkthrough()).toBe(
      [
        '1. button "Skip" [tabindex=3]',
        '2. searchbox "Search"',
        '3. button "Bold" (pressed)',
        '4. link "Help"',
        '5. button (no name)',
      ].join('\n'),
    );
  });

  it('walks a fixture\'s own element', () => {
    const host = render('<button>Inside</button>');
    render('<button>Outside</button>');
    expect(tabWalkthrough({ nativeElement: host, whenStable: async () => undefined })).toBe('1. button "Inside"');
  });
});
