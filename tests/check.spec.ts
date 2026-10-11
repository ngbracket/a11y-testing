import { afterEach, describe, expect, it } from 'vitest';
import '../src/vitest';
import { checkA11y, expectNoAxeViolations, formatViolations } from '../src';

afterEach(() => {
  document.body.innerHTML = '';
});

function render(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe('checkA11y', () => {
  it('reports violations with the element and axe details', async () => {
    const host = render('<img src="shoe.png"><button></button>');
    const result = await checkA11y(host);

    expect(result.violations.map((v) => v.id).sort()).toEqual(['button-name', 'image-alt']);
    const img = result.violations.find((v) => v.id === 'image-alt')!;
    expect(img.impact).toBe('critical');
    expect(img.helpUrl).toMatch(/^https:\/\//);
    expect(img.nodes[0].element).toBe(host.querySelector('img'));
    expect(img.nodes[0].html).toBe('<img src="shoe.png">');
    expect(img.nodes[0].component).toBeNull(); // no Angular here
  });

  it('passes clean markup and says what it skipped', async () => {
    const host = render('<img src="shoe.png" alt="Red running shoe"><button>Add to basket</button>');
    const result = await checkA11y(host);
    expect(result.violations).toEqual([]);
    expect(result.skipped.map((s) => s.id)).toEqual(['color-contrast', 'page-level rules']);
    expect(result).toHaveNoAxeViolations();
  });

  it('runs page-level rules when given the whole document', async () => {
    render('<p>Text outside any landmark</p>');
    const result = await checkA11y(document);
    expect(result.violations.map((v) => v.id)).toEqual(expect.arrayContaining(['document-title', 'html-has-lang']));
    expect(result.skipped.map((s) => s.id)).toEqual(['color-contrast']);
  });

  it('takes rule overrides, runOnly and exclude', async () => {
    const host = render('<img src="a.png"><div class="third-party"><button></button></div>');

    const noImg = await checkA11y(host, { rules: { 'image-alt': { enabled: false } } });
    expect(noImg.violations.map((v) => v.id)).toEqual(['button-name']);

    const onlyImg = await checkA11y(host, { runOnly: ['image-alt'] });
    expect(onlyImg.violations.map((v) => v.id)).toEqual(['image-alt']);

    const excluded = await checkA11y(host, { exclude: ['.third-party'] });
    expect(excluded.violations.map((v) => v.id)).toEqual(['image-alt']);
  });

  it('queues parallel runs instead of failing with "Axe is already running"', async () => {
    const a = render('<img src="a.png">');
    const b = render('<button></button>');
    const [ra, rb] = await Promise.all([checkA11y(a), checkA11y(b)]);
    expect(ra.violations.map((v) => v.id)).toEqual(['image-alt']);
    expect(rb.violations.map((v) => v.id)).toEqual(['button-name']);
  });

  it('settles a fixture and checks its element', async () => {
    const host = render('<button></button>');
    render('<img src="outside.png">');
    let settled = false;
    const result = await checkA11y({
      nativeElement: host,
      detectChanges: () => undefined,
      whenStable: async () => {
        settled = true;
      },
    });
    expect(settled).toBe(true);
    expect(result.violations.map((v) => v.id)).toEqual(['button-name']);
  });
});

describe('formatViolations and the matcher', () => {
  it('lists each rule and element', async () => {
    const result = await checkA11y(render('<img src="shoe.png">'));
    const text = formatViolations(result);
    expect(text).toMatch(/^1 axe violation in 1 rule:\n\nimage-alt \(critical\): Images must have alternative text\n {2}https:\/\/\S+\n {2}- <img src="shoe.png">\n {4}Fix any of the following:\n {6}Element does not have an alt attribute\n/);
    expect(text).toMatch(/Not checked: color-contrast \(jsdom has no layout to compute colours from\); page-level rules/);
  });

  it('fails the matcher with the formatted list, and expectNoAxeViolations throws it', async () => {
    const host = render('<button></button>');
    const result = await checkA11y(host);
    expect(() => expect(result).toHaveNoAxeViolations()).toThrow(/button-name \(critical\)/);
    await expect(expectNoAxeViolations(host)).rejects.toThrow(/1 axe violation in 1 rule/);
    expect(formatViolations({ violations: [], incomplete: [], skipped: [] })).toBe('No axe violations.');
  });
});
