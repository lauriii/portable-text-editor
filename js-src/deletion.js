/**
 * @file
 * Two things deleting should not do.
 */

import { defineBehavior, forward, raise } from '@portabletext/editor/behaviors';
import { getFocusTextBlock } from '@portabletext/editor/selectors';

/**
 * The block object immediately before the caret, if backspace would reach it.
 *
 * @param {object} snapshot
 *   The editor snapshot.
 *
 * @return {object|null}
 *   The block, or null when backspace is not about to reach one.
 */
function objectBefore(snapshot) {
  const block = getFocusTextBlock(snapshot);
  const { selection } = snapshot.context;
  // Only from the very start of a block, with nothing selected.
  if (!block || !selection || selection.anchor.offset !== 0 || selection.focus.offset !== 0) {
    return null;
  }
  const blocks = snapshot.context.value || [];
  const index = blocks.findIndex((node) => node._key === block.node._key);
  const before = index > 0 ? blocks[index - 1] : undefined;
  return before && before._type !== 'block' ? before : null;
}

/**
 * Where backspace should go instead of deleting a whole table or image.
 *
 * Backspace at the start of the paragraph after a table deleted the entire
 * table, in one keystroke, with nothing selected and no warning. It could be
 * undone, but only by someone who noticed, and what it took sits above the
 * caret and is often off screen.
 *
 * Selecting the block instead is what CKEditor does, but a collapsed selection
 * on a block object is normalised straight back into the nearest text here, so
 * the caret silently jumped over the table rather than landing on it. It now
 * steps into the thing, the way a word processor does: into the last cell of a
 * table, or onto the media, where a further backspace does delete it.
 *
 * @param {object} snapshot
 *   The editor snapshot.
 * @param {HTMLElement} editable
 *   The writing area.
 *
 * @return {HTMLElement|null}
 *   What to put the focus on, or null when backspace should do its usual job.
 */
function stepIntoBefore(snapshot, editable) {
  const before = objectBefore(snapshot);
  if (!before) {
    return null;
  }
  const node = editable.querySelector(`[data-block-key="${before._key}"]`);
  if (!node) {
    return null;
  }
  const cells = node.querySelectorAll('.portable-text-editor__cell');
  return cells.length > 0 ? cells[cells.length - 1] : node.querySelector('[tabindex="0"]');
}

/**
 * Whether a selection covers everything there is.
 *
 * @param {object} snapshot
 *   The editor snapshot.
 *
 * @return {boolean}
 *   TRUE when deleting would leave the document empty.
 */
function coversEverything(snapshot) {
  const blocks = snapshot.context.value || [];
  const { selection } = snapshot.context;
  if (!selection || blocks.length === 0) {
    return false;
  }
  const keyOf = (point) => point.path[0]?._key;
  const ends = [keyOf(selection.anchor), keyOf(selection.focus)];
  if (!ends.includes(blocks[0]._key) || !ends.includes(blocks[blocks.length - 1]._key)) {
    return false;
  }
  if (blocks.length > 1) {
    return true;
  }
  // One block, so the offsets have to say the whole of its text is going.
  const text = (blocks[0].children || []).map((child) => child.text || '').join('');
  const offsets = [selection.anchor.offset, selection.focus.offset];
  return Math.min(...offsets) === 0 && Math.max(...offsets) === text.length && text !== '';
}

/**
 * Clears the formatting off a document that has just been emptied.
 *
 * Selecting everything and deleting it left the text gone but the block's
 * style and list item behind, so an apparently blank field still carried a
 * heading and a bullet: the placeholder never came back, a stray marker sat
 * beside the caret, and the markdown shortcuts stopped working, since they
 * refuse to run on a list item. The leftover style reached the saved JSON too.
 *
 * Deleting the same text one character at a time already ended up clean, so
 * this only brings the other way of doing it into line. It is tied to deleting
 * everything rather than to a block merely being empty, because an empty block
 * with a style is also what typing "## " deliberately produces.
 */
const clearEmptiedBehavior = defineBehavior({
  on: 'delete',
  guard: ({ snapshot }) => coversEverything(snapshot),
  actions: [
    ({ event }) => [
      forward(event),
      raise({ type: 'style.add', style: 'normal' }),
      raise({ type: 'list item.remove', listItem: 'bullet' }),
      raise({ type: 'list item.remove', listItem: 'number' }),
    ],
  ],
});

export { stepIntoBefore, clearEmptiedBehavior };
