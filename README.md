# @ngbracket/a11y-testing

Accessibility helpers for Angular component tests in Vitest and TestBed. Press keys
the way a browser does, check Tab order and focus, read an element's computed role
and name, and capture what a component announces through ARIA live regions.

```ts
await press(trigger, 'ArrowDown', { fixture });
expect(document.activeElement?.textContent).toBe('Rename');

await expectFocusReturn(trigger, () => trigger.click(), () => press('Escape'), { fixture });
await expect(dialogPanel).toBeFocusTrapped({ fixture });
expect(tabWalkthrough(fixture)).toMatchInlineSnapshot();
```

Part of the `@ngbracket` Angular accessibility tooling, alongside
[`@ngbracket/a11y-devtools`](https://github.com/ngbracket/a11y-devtools). Which
elements count as tab stops, and the role, name and state text, follow the same
rules as the devtools walkthrough. One difference: while a dialog is open, the
devtools lists only the dialog's stops, while `tab()` lets the page's own focus
trap keep focus in.

## Install

```bash
npm i -D @ngbracket/a11y-testing
```

To use the Vitest matchers, import them once in your test setup file:

```ts
import '@ngbracket/a11y-testing/vitest';
```

The helpers work in jsdom and need no browser mode. They take a `ComponentFixture`
where waiting matters, but only call `detectChanges()` and `whenStable()` on it, so
the package has no dependency on Angular. It is tested against Angular 22 and the
CDK in zoneless TestBed.

## Keyboard

### `press(target, keys, options?)`

Dispatches `keydown` and `keyup` on `target`, or on the focused element when you
leave `target` out. It fills in `key`, `code` and `keyCode` (the CDK menu and list
key managers still read `keyCode`) and the modifier flags. It returns the `keydown`
event, so you can check `defaultPrevented`.

```ts
await press(listbox, 'ArrowDown');
await press(editor, 'Control+b');
await press('Shift+Tab');
await press(grid, 'Home', { fixture }); // settles the fixture afterwards
```

Key names are `KeyboardEvent.key` values (`Enter`, `Escape`, `ArrowDown`, `a`,
`F10`). `Space`, `Esc`, `Ctrl` and `Cmd` work as aliases.

When `target` has focus and no handler cancels the `keydown`, `press()` also does
what the browser would:

| Key | Default action |
|---|---|
| Tab, Shift+Tab | Moves focus to the next or previous stop |
| Enter | Clicks a native button, link or `<summary>` |
| Space | Clicks a native button, checkbox, radio or `<summary>` (on `keyup`) |

A browser sends keys to the focused element, so the default actions need focus.
If focus was lost, pressing Enter on a button clicks nothing and your test fails.
A `<div role="button">` gets no default action either, as in a browser. If it has
no key handler of its own, pressing Enter on it does nothing.

Two browser behaviours aren't emulated: Enter in a text field doesn't submit the
form, and Shift with a digit or punctuation key keeps the unshifted `key`.

### `tab(options?)` and `shiftTab(options?)`

Press Tab or Shift+Tab on the focused element and return the element that has focus
afterwards. Focus moves through the real tab order: positive `tabindex` first, then
DOM order, skipping disabled, `inert`, `hidden`, `display: none` and closed
`<details>` content. A named radio group is one stop. Past the last stop a browser
leaves the page; here focus wraps to the first stop.

Focus-trap sentinels, such as the CDK's `cdk-focus-trap-anchor`, count as stops.
The browser lands on them and the trap sends focus on, so a real trap's own code
decides where focus goes.

### `settle(fixture)`

Runs `detectChanges()` and waits for `whenStable()`. With zoneless change detection
(the default since Angular 21) a signal change renders on a later tick, so read the
DOM after `settle()`. Every helper that takes `{ fixture }` calls it for you.

### `tabOrder(root?)`

The elements Tab visits inside `root`, in order. `isTabbable(el)` and `isHidden(el)`
are exported too.

## Focus

### `expectFocusReturn(trigger, open, close, options?)`

Focuses `trigger`, runs `open`, runs `close`, and throws unless focus is back on
`trigger`. The error says where focus went:

```text
Focus didn't return to button "Actions". It's on the page body (focus was lost).
```

### `expectFocusTrapped(container, options?)`

Presses Tab, then Shift+Tab, enough times to go round `container` once in each
direction. It throws if focus leaves the container or never reaches one of its
stops. It also throws if Tab goes past the last stop on the page: in a fixture that
holds only a dialog, focus wrapping back to the start doesn't mean anything trapped
it. `checkFocusTrapped()` returns `{ pass, message }` instead of throwing, and
the `toBeFocusTrapped()` matcher wraps it:

```ts
await expect(dialogPanel).toBeFocusTrapped({ fixture });
```

```text
Tab from button "Delete" moved focus out of the container, to link "Help".
```

### CDK focus traps in jsdom: `stubLayout()`

The CDK decides whether an element can take focus by reading `offsetWidth` and
`offsetHeight`. jsdom has no layout and reports 0 for both, so a CDK focus trap
(`cdkTrapFocus`, CDK and Material dialogs, drawers) finds nothing to focus and
focus stays on its anchor. `stubLayout()` reports a 1×1 box for connected elements
that aren't `display: none` or `visibility: hidden`, and returns a function that
puts things back.

```ts
let restoreLayout: () => void;
beforeEach(() => (restoreLayout = stubLayout()));
afterEach(() => restoreLayout());
```

When a trap check fails because focus stayed on an anchor, the message suggests
`stubLayout()`.

### `activeDescendant(el?)`

The element that `aria-activedescendant` on `el` points at, or `null`. `el`
defaults to the focused element.

```ts
await press(combobox, 'ArrowDown', { fixture });
expect(activeDescendant(combobox)?.textContent).toBe('Paris');
```

## Names and walkthroughs

### `describeElement(el)`

Returns the computed `role`, accessible `name`, `description` and `states` of an
element. Role and name come from axe-core's accessible-name code. axe-core is a
dependency of this package, about 1 MB, loaded when you import it.

```ts
expect(describeElement(sortButton)).toEqual({
  role: 'button',
  name: 'Sort by date',
  description: '',
  states: ['pressed'],
});
```

This is a computed approximation. What a screen reader says depends on the screen
reader, its mode and settings, and the browser.

### `tabWalkthrough(root?)`

The tab order as text, one line per stop, for snapshot tests. Given a fixture it
walks the component's element. Pass `document` to include overlays the CDK renders
on `<body>`.

```ts
expect(tabWalkthrough(fixture)).toMatchInlineSnapshot(`
  "1. searchbox "Search orders"
  2. button "Filters" (collapsed, has menu popup)
  3. link "Export CSV""
`);
```

A changed name, a lost state or a reordered stop shows up as a snapshot diff.

## Announcements

### `captureAnnouncements(fixture, action, options?)`

Runs `action` and returns what it announced. It settles the fixture before and
after, and listens to the whole document, because the CDK `LiveAnnouncer` puts its
live region on `<body>`. After the fixture settles it keeps listening for 150 ms,
since `LiveAnnouncer` writes its message about 100 ms after `announce()`. Change
that with `{ settleMs: 300 }`. The wait uses a real timer, so with
`vi.useFakeTimers()` pass `{ settleMs: 0 }` and advance the timers yourself.

```ts
const announced = await captureAnnouncements(fixture, () => {
  fixture.componentInstance.applyFilters();
});
expect(announced).toHaveAnnounced('3 results');
```

`toHaveAnnounced()` takes a string, which must equal a whole message, or a RegExp.
It accepts the array from `captureAnnouncements()` or a recorder. On failure it
lists everything that was announced.

### `recordAnnouncements(root?)`

The lower-level recorder:

```ts
const recorder = recordAnnouncements(document);
fixture.componentInstance.save();
await settle(fixture);
expect(recorder).toHaveAnnounced('Saved');
recorder.stop();
```

It records text written to any `[aria-live]` region (except `aria-live="off"`) and
any `role="status"` or `role="alert"` element.

## How it compares

Some of this overlaps with tools you may already use:

- Testing Library's `user-event` has `tab()` and keyboard input. It doesn't settle an
  Angular fixture. CDK focus traps need `stubLayout()` with either tool.
- `jest-dom` has `toHaveAccessibleName()` and `toHaveFocus()`. `describeElement()`
  returns role, name and states together, using axe-core's name computation.
- `vitest-axe` and `jest-axe` run axe on a container. This package doesn't run axe
  rules yet.

What this package adds is Angular-specific: settling zoneless fixtures, running real
CDK focus traps in jsdom, keyCode for the CDK key managers, live-region
announcements, focus checks in one line, and walkthrough snapshots that match
a11y-devtools.

## Develop

```bash
npm install
npm test        # vitest + jsdom, including a real Angular + CDK suite
npm run build   # tsc -> dist/ (ESM + .d.ts)
```

## Roadmap

- `checkA11y(fixture)`: axe rules on the fixture, with each failure naming the
  Angular component that rendered it, and a `toHaveNoAxeViolations()` matcher.
- A baseline file, so an existing app fails only on new problems.
