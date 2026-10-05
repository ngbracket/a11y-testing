# @ngbracket/a11y-testing

Test what an Angular component announces to screen readers, in your existing
Vitest and TestBed setup. axe checks a snapshot of the page; an announcement is a
change over time, so it needs a different kind of test.

This first release captures text written to ARIA live regions (including the CDK
`LiveAnnouncer`) and waits for Angular to settle, which matters in zoneless apps.

Part of the `@ngbracket` Angular accessibility tooling, alongside
[`@ngbracket/a11y-devtools`](https://github.com/ngbracket/a11y-devtools).

## Design: framework-agnostic core

The package has no Angular dependency and doesn't need AnalogJS. An announcement
is a live region's text changing, which is plain DOM, so the core works on the
DOM alone. The one Angular-aware helper accepts anything with a `whenStable()`
method, and a `ComponentFixture` has one. Use it inside your existing Angular
Vitest setup (Angular 21 and later ship one); the package is a set of functions
you import.

## Install

```bash
npm i -D @ngbracket/a11y-testing
```

## Usage

### `captureAnnouncements(fixture, action)`

Runs your action and returns what it announced, waiting for change detection to
settle before and after. In a zoneless app (the default since Angular 21) a signal
change updates the live region asynchronously, so a test that reads the region
straight away would miss the text.

It listens to the whole document, because the CDK `LiveAnnouncer` puts its live
region on `<body>`, outside your component. After the fixture settles it keeps
listening for 150 ms, since `LiveAnnouncer` writes its message about 100 ms after
`announce()`. Change that with a third argument: `{ settleMs: 300 }`. The wait
uses a real timer, so with `vi.useFakeTimers()` either switch back to real timers
for the test or pass `{ settleMs: 0 }` and advance the timers yourself.

```ts
import { captureAnnouncements } from '@ngbracket/a11y-testing';

it('announces the result count', async () => {
  const fixture = TestBed.createComponent(FilterComponent);

  const announced = await captureAnnouncements(fixture, () => {
    fixture.componentInstance.applyFilters();
  });

  expect(announced).toEqual(['3 results']);
});
```

### `recordAnnouncements(root?)`

The lower-level recorder, for tests that need more control.

```ts
import { recordAnnouncements } from '@ngbracket/a11y-testing';

const recorder = recordAnnouncements(document);
await fixture.whenStable();
fixture.componentInstance.save();
await fixture.whenStable();
expect(recorder.announcements).toContain('Saved');
recorder.stop();
```

It captures text written to any `[aria-live]` region (except `aria-live="off"`)
and any `role="status"` or `role="alert"` element, including the CDK
`LiveAnnouncer` region.

## Develop

```bash
npm install
npm test        # vitest + jsdom, no Angular toolchain
npm run build   # tsc -> dist/ (ESM + .d.ts)
```

The package only relies on `whenStable()`, so it doesn't depend on how your
TestBed is set up.

## Roadmap

- Focus order, and focus returning to the right place after a dialog or menu
  closes. This needs Vitest browser mode.
- Colour contrast checks with axe, also in browser mode.
- A baseline file, so an existing app fails only on new problems.
- A `toHaveAnnounced` Vitest matcher.
