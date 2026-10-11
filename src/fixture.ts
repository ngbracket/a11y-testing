/**
 * A component fixture we can wait on. Typed structurally so this package needs no
 * hard dependency on `@angular/core/testing`. A real `ComponentFixture`
 * satisfies it, and so does anything with `whenStable()`.
 */
export interface AngularFixtureLike {
  whenStable(): Promise<unknown>;
  detectChanges?(): void;
  readonly nativeElement?: Element;
}

/**
 * Run change detection and wait until the fixture is stable, so the DOM shows
 * the result of whatever the test just did. Under zoneless change detection (the
 * Angular default since v21) a signal change renders on a later tick; reading the
 * DOM straight away sees the old state.
 */
export async function settle(fixture: AngularFixtureLike): Promise<void> {
  fixture.detectChanges?.();
  await fixture.whenStable();
}
