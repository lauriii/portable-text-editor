/**
 * @file
 * What Tab does, which is mostly to stay out of the way.
 *
 * The editor indents a list item on Tab and outdents it on Shift+Tab, and
 * consumes the key either way. In a form that is a keyboard trap: a writer who
 * types a bulleted list, which is the most ordinary structural thing there is,
 * can no longer reach Save or anything else on the page without a mouse. It
 * also indented without limit, past the five levels the stylesheet draws, so
 * beyond that there was not even any feedback.
 *
 * Tab is therefore only taken when it has somewhere to go: indenting an item
 * that has a sibling above it to nest under and room left to nest, or
 * outdenting one that is nested. Otherwise it is left alone and moves the focus
 * out of the field, the way Tab does everywhere else in a form.
 *
 * @see https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html
 */

import { defineBehavior } from '@portabletext/editor/behaviors';
import { getFocusTextBlock } from '@portabletext/editor/selectors';

// As deep as the stylesheet draws, and deeper than a body field needs.
const MAX_LEVEL = 5;

/**
 * The blocks of the document, and where the focused one sits among them.
 *
 * @param {object} snapshot
 *   The editor snapshot.
 *
 * @return {object|null}
 *   The focused block, its level, and the block before it, or null when the
 *   caret is not in a list item.
 */
function listContext(snapshot) {
  const block = getFocusTextBlock(snapshot);
  if (!block || !block.node.listItem) {
    return null;
  }
  const blocks = snapshot.context.value || [];
  const index = blocks.findIndex((node) => node._key === block.node._key);
  const before = index > 0 ? blocks[index - 1] : undefined;
  return {
    path: block.path,
    level: block.node.level || 1,
    // Only a list item directly above can be nested under, which is the same
    // rule an HTML list follows.
    beforeLevel: before && before.listItem ? before.level || 1 : 0,
  };
}

/**
 * The level Tab would move a list item to, if it would move it at all.
 *
 * @param {object} snapshot
 *   The editor snapshot.
 * @param {boolean} backwards
 *   Whether Shift was held.
 *
 * @return {object|null}
 *   The block's path and its new level, or null when Tab has nothing to do
 *   here and should leave the field instead.
 */
function indentTarget(snapshot, backwards) {
  const context = listContext(snapshot);
  if (!context) {
    return null;
  }
  if (backwards) {
    return context.level > 1 ? { path: context.path, level: context.level - 1 } : null;
  }
  // A list item cannot nest deeper than one level below the item above it,
  // and not deeper than the stylesheet draws.
  return context.level < MAX_LEVEL && context.level <= context.beforeLevel
    ? { path: context.path, level: context.level + 1 }
    : null;
}

/**
 * Takes Tab away from the editor, which would otherwise always indent.
 *
 * The key is then acted on in one place, in the writing area's own handler,
 * which either indents or moves the focus out of the field.
 */
const tabBehavior = defineBehavior({
  on: 'keyboard.keydown',
  guard: ({ event }) => event.originEvent.key === 'Tab',
  actions: [() => []],
});

// What the browser would move between, in the order it would use.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Moves the focus out of the writing area, the way Tab does in a form.
 *
 * @param {HTMLElement} from
 *   The writing area.
 * @param {boolean} backwards
 *   Whether Shift was held.
 */
function moveFocus(from, backwards) {
  const field = from.closest('.portable-text-editor') || from;
  // Ordered by where things are in the document rather than by where the
  // writing area sits among them: it is contenteditable rather than a form
  // control, so it is not in this list itself, and looking for it landed on
  // the first focusable thing on the page instead, which is the skip link.
  const outside = Array.from(document.querySelectorAll(FOCUSABLE)).filter(
    (element) => !field.contains(element),
  );
  const after = (element) =>
    // eslint-disable-next-line no-bitwise
    Boolean(field.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  const candidates = backwards
    ? outside.filter((element) => !after(element)).reverse()
    : outside.filter(after);

  // Whether the focus actually landed is the only dependable test. The nearest
  // candidate going backwards is the textarea this editor replaces, which our
  // own stylesheet hides, and asking a hidden element to take the focus does
  // nothing at all rather than failing.
  candidates.some((element) => {
    element.focus();
    return document.activeElement === element;
  });
}

export { tabBehavior, indentTarget, moveFocus, MAX_LEVEL };
