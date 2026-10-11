/**
 * The helpers against real Angular: zoneless TestBed (the default without
 * zone.js), CDK menus that switch on keyCode, CDK focus traps and dialogs, and
 * the CDK LiveAnnouncer. Components are JIT-compiled and written without
 * decorators so this suite needs no Angular build step.
 */
import '@angular/compiler';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, inject, signal } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import '../src/vitest';
import {
  captureAnnouncements,
  checkA11y,
  checkFocusTrapped,
  expectFocusReturn,
  expectFocusTrapped,
  press,
  settle,
  stubLayout,
  tab,
  tabWalkthrough,
} from '../src';

beforeAll(() => {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    teardown: { destroyAfterEach: true },
  });
});

let restoreLayout: (() => void) | undefined;
afterEach(() => {
  restoreLayout?.();
  restoreLayout = undefined;
});

const Counter = Component({
  selector: 'test-counter',
  template: `<button type="button" (click)="count.set(count() + 1)">Add</button><output>{{ count() }}</output>`,
})(
  class {
    count = signal(0);
  },
);

const MenuHost = Component({
  selector: 'test-menu-host',
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem],
  template: `
    <button type="button" [cdkMenuTriggerFor]="menu">Actions</button>
    <ng-template #menu>
      <div cdkMenu aria-label="Actions">
        <button type="button" cdkMenuItem>Rename</button>
        <button type="button" cdkMenuItem>Delete</button>
      </div>
    </ng-template>
  `,
})(class {});

const TrapHost = Component({
  selector: 'test-trap-host',
  imports: [CdkTrapFocus],
  template: `
    <button type="button">Behind</button>
    <div cdkTrapFocus id="panel">
      <button type="button">First</button>
      <input aria-label="Name" />
      <button type="button">Last</button>
    </div>
  `,
})(class {});

const DialogContent = Component({
  selector: 'test-dialog-content',
  template: `<h2>Delete file?</h2><button type="button">Cancel</button><button type="button">Delete</button>`,
})(class {});

const DialogHost = Component({
  selector: 'test-dialog-host',
  template: `<button type="button" (click)="open()">Delete…</button>`,
})(
  class {
    private readonly dialog = inject(Dialog);
    open(): void {
      this.dialog.open(DialogContent, { ariaLabel: 'Delete file' });
    }
  },
);

const AnnouncerHost = Component({
  selector: 'test-announcer-host',
  template: `<button type="button" (click)="save()">Save</button>`,
})(
  class {
    private readonly announcer = inject(LiveAnnouncer);
    save(): void {
      void this.announcer.announce('Saved');
    }
  },
);

// A stand-in for a UI-library primitive: its class name starts with "Mat".
const MatIconButton = Component({
  selector: 'test-icon-button',
  template: `<button type="button"><svg aria-hidden="true"></svg></button>`,
})(class MatIconButton {});

const ProductCard = Component({
  selector: 'test-product-card',
  imports: [MatIconButton],
  template: `<img src="shoe.png" /><test-icon-button />`,
})(class ProductCard {});

const ProductPage = Component({
  selector: 'test-product-page',
  imports: [ProductCard],
  template: `<h2>Shoes</h2><test-product-card />`,
})(class ProductPage {});

describe('with Angular and the CDK', () => {
  it('checkA11y names the component behind each violation, walking past UI primitives', async () => {
    const fixture = TestBed.createComponent(ProductPage);
    const result = await checkA11y(fixture);

    const byRule = Object.fromEntries(result.violations.map((v) => [v.id, v.nodes[0]]));
    expect(byRule['image-alt'].component).toBe('ProductCard');
    expect(byRule['image-alt'].componentPath).toEqual(['ProductCard', 'ProductPage']);
    // The nameless button sits inside MatIconButton, but the fix belongs in ProductCard.
    expect(byRule['button-name'].componentPath).toEqual(['MatIconButton', 'ProductCard', 'ProductPage']);
    expect(byRule['button-name'].component).toBe('ProductCard');

    const libraryView = await checkA11y(fixture, { frameworkPrefixes: [] });
    expect(libraryView.violations.find((v) => v.id === 'button-name')!.nodes[0].component).toBe('MatIconButton');
  });

  it('press(Enter) clicks a native button and settles a zoneless fixture', async () => {
    const fixture = TestBed.createComponent(Counter);
    await settle(fixture);
    const button = fixture.nativeElement.querySelector('button') as HTMLElement;
    button.focus();

    await press(button, 'Enter', { fixture });

    expect(fixture.nativeElement.querySelector('output').textContent).toBe('1');
  });

  it('opens a CDK menu with ArrowDown (keyCode) and returns focus on Escape', async () => {
    const fixture = TestBed.createComponent(MenuHost);
    await settle(fixture);
    const trigger = fixture.nativeElement.querySelector('button') as HTMLElement;

    await expectFocusReturn(
      trigger,
      async () => {
        await press(trigger, 'ArrowDown', { fixture });
        expect(document.activeElement?.textContent).toBe('Rename');
      },
      () => press('Escape', { fixture }),
      { fixture },
    );
  });

  it('cdkTrapFocus: fails in plain jsdom with a hint, passes with stubLayout()', async () => {
    const fixture = TestBed.createComponent(TrapHost);
    await settle(fixture);
    const panel = fixture.nativeElement.querySelector('#panel') as HTMLElement;

    const withoutLayout = await checkFocusTrapped(panel, { fixture });
    expect(withoutLayout.pass).toBe(false);
    expect(withoutLayout.message).toMatch(/stubLayout\(\)/);

    restoreLayout = stubLayout();
    await expect(panel).toBeFocusTrapped({ fixture });
  });

  it('CDK dialog: traps focus, and Escape returns focus to the trigger', async () => {
    restoreLayout = stubLayout();
    const fixture = TestBed.createComponent(DialogHost);
    await settle(fixture);
    const trigger = fixture.nativeElement.querySelector('button') as HTMLElement;

    await expectFocusReturn(
      trigger,
      async () => {
        trigger.click();
        await settle(fixture);
        const container = document.querySelector('.cdk-dialog-container')!;
        expect(container.contains(document.activeElement)).toBe(true);
        await expectFocusTrapped(container, { fixture });
      },
      () => press('Escape', { fixture }),
      { fixture },
    );
  });

  it('captures a LiveAnnouncer message', async () => {
    const fixture = TestBed.createComponent(AnnouncerHost);
    const button = fixture.nativeElement.querySelector('button') as HTMLElement;
    button.focus();

    const announced = await captureAnnouncements(fixture, () => press(button, 'Enter'));

    expect(announced).toHaveAnnounced('Saved');
  });

  it('tab() and tabWalkthrough() follow the rendered component', async () => {
    const fixture = TestBed.createComponent(MenuHost);
    await settle(fixture);
    expect(tabWalkthrough(fixture)).toBe('1. button "Actions" (collapsed, has menu popup)');
    expect((await tab({ fixture }))?.textContent).toBe('Actions');
  });
});
