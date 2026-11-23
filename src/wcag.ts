/**
 * WCAG 2.2 Level A and AA criteria as [number, name, slug], in document order.
 * The slug is W3C's Understanding page name, which the NgBracket reference
 * uses too. 4.1.1 Parsing is left out: WCAG 2.2 marks it obsolete.
 */
const CRITERIA: readonly (readonly [string, string, string])[] = [
  ['1.1.1', 'Non-text Content', 'non-text-content'],
  ['1.2.1', 'Audio-only and Video-only (Prerecorded)', 'audio-only-and-video-only-prerecorded'],
  ['1.2.2', 'Captions (Prerecorded)', 'captions-prerecorded'],
  ['1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'audio-description-or-media-alternative-prerecorded'],
  ['1.2.4', 'Captions (Live)', 'captions-live'],
  ['1.2.5', 'Audio Description (Prerecorded)', 'audio-description-prerecorded'],
  ['1.3.1', 'Info and Relationships', 'info-and-relationships'],
  ['1.3.2', 'Meaningful Sequence', 'meaningful-sequence'],
  ['1.3.3', 'Sensory Characteristics', 'sensory-characteristics'],
  ['1.3.4', 'Orientation', 'orientation'],
  ['1.3.5', 'Identify Input Purpose', 'identify-input-purpose'],
  ['1.4.1', 'Use of Color', 'use-of-color'],
  ['1.4.2', 'Audio Control', 'audio-control'],
  ['1.4.3', 'Contrast (Minimum)', 'contrast-minimum'],
  ['1.4.4', 'Resize Text', 'resize-text'],
  ['1.4.5', 'Images of Text', 'images-of-text'],
  ['1.4.10', 'Reflow', 'reflow'],
  ['1.4.11', 'Non-text Contrast', 'non-text-contrast'],
  ['1.4.12', 'Text Spacing', 'text-spacing'],
  ['1.4.13', 'Content on Hover or Focus', 'content-on-hover-or-focus'],
  ['2.1.1', 'Keyboard', 'keyboard'],
  ['2.1.2', 'No Keyboard Trap', 'no-keyboard-trap'],
  ['2.1.4', 'Character Key Shortcuts', 'character-key-shortcuts'],
  ['2.2.1', 'Timing Adjustable', 'timing-adjustable'],
  ['2.2.2', 'Pause, Stop, Hide', 'pause-stop-hide'],
  ['2.3.1', 'Three Flashes or Below Threshold', 'three-flashes-or-below-threshold'],
  ['2.4.1', 'Bypass Blocks', 'bypass-blocks'],
  ['2.4.2', 'Page Titled', 'page-titled'],
  ['2.4.3', 'Focus Order', 'focus-order'],
  ['2.4.4', 'Link Purpose (In Context)', 'link-purpose-in-context'],
  ['2.4.5', 'Multiple Ways', 'multiple-ways'],
  ['2.4.6', 'Headings and Labels', 'headings-and-labels'],
  ['2.4.7', 'Focus Visible', 'focus-visible'],
  ['2.4.11', 'Focus Not Obscured (Minimum)', 'focus-not-obscured-minimum'],
  ['2.5.1', 'Pointer Gestures', 'pointer-gestures'],
  ['2.5.2', 'Pointer Cancellation', 'pointer-cancellation'],
  ['2.5.3', 'Label in Name', 'label-in-name'],
  ['2.5.4', 'Motion Actuation', 'motion-actuation'],
  ['2.5.7', 'Dragging Movements', 'dragging-movements'],
  ['2.5.8', 'Target Size (Minimum)', 'target-size-minimum'],
  ['3.1.1', 'Language of Page', 'language-of-page'],
  ['3.1.2', 'Language of Parts', 'language-of-parts'],
  ['3.2.1', 'On Focus', 'on-focus'],
  ['3.2.2', 'On Input', 'on-input'],
  ['3.2.3', 'Consistent Navigation', 'consistent-navigation'],
  ['3.2.4', 'Consistent Identification', 'consistent-identification'],
  ['3.2.6', 'Consistent Help', 'consistent-help'],
  ['3.3.1', 'Error Identification', 'error-identification'],
  ['3.3.2', 'Labels or Instructions', 'labels-or-instructions'],
  ['3.3.3', 'Error Suggestion', 'error-suggestion'],
  ['3.3.4', 'Error Prevention (Legal, Financial, Data)', 'error-prevention-legal-financial-data'],
  ['3.3.7', 'Redundant Entry', 'redundant-entry'],
  ['3.3.8', 'Accessible Authentication (Minimum)', 'accessible-authentication-minimum'],
  ['4.1.2', 'Name, Role, Value', 'name-role-value'],
  ['4.1.3', 'Status Messages', 'status-messages'],
];

/** A WCAG criterion a violation relates to, with its page in the NgBracket accessibility reference. */
export interface WcagCriterion {
  /** e.g. `1.4.3`. */
  id: string;
  /** e.g. `Contrast (Minimum)`. */
  name: string;
  /** e.g. `https://ngbracket.com/reference/wcag/contrast-minimum`. */
  reference: string;
}

const BY_DIGITS = new Map(
  CRITERIA.map(([id, name, slug]) => [
    id.replace(/\./g, ''),
    { id, name, reference: `https://ngbracket.com/reference/wcag/${slug}` },
  ]),
);

/**
 * The WCAG 2.2 A and AA criteria an axe rule's tags name (`wcag143` → 1.4.3),
 * in document order. Level tags such as `wcag2aa`, best-practice rules and AAA
 * criteria give none. Dropping the dots is unambiguous within the A and AA set.
 */
export function criteriaForTags(tags: readonly string[]): WcagCriterion[] {
  const found = new Set(tags.flatMap((tag) => /^wcag(\d{3,4})$/.exec(tag)?.[1] ?? []));
  return [...BY_DIGITS].filter(([digits]) => found.has(digits)).map(([, c]) => c);
}
