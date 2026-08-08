/**
 * @file
 * Markdown markers typed at the start of a block.
 */

import { defineBehavior, raise } from '@portabletext/editor/behaviors';
import { getFocusTextBlock } from '@portabletext/editor/selectors';

/**
 * What typing a marker then a space turns the block into.
 *
 * Only the markers people already have in their fingers from writing
 * markdown, and only at the very start of a block.
 */
const MARKDOWN = {
  '##': { style: 'h2' },
  '###': { style: 'h3' },
  '####': { style: 'h4' },
  '>': { style: 'blockquote' },
  '-': { listItem: 'bullet' },
  '*': { listItem: 'bullet' },
  '1.': { listItem: 'number' },
};

/**
 * Turns a markdown marker at the start of a block into real formatting.
 *
 * This is a behavior rather than a key handler because it has to run inside
 * the editor's own pipeline: the space arrives faster than the model settles
 * when someone types quickly, and a key handler would read a block that does
 * not hold the marker yet.
 */
const markdownBehavior = defineBehavior({
  on: 'insert.text',
  guard: ({ snapshot, event }) => {
    if (event.text !== ' ') {
      return false;
    }
    const block = getFocusTextBlock(snapshot);
    if (!block || block.node.listItem) {
      return false;
    }
    // The whole block has to be the marker, which also means the caret is
    // right after it, so where the caret is needs no asking about separately.
    const marker = (block.node.children || []).map((child) => child.text || '').join('');
    const rule = MARKDOWN[marker];
    return rule ? { block, marker, rule } : false;
  },
  actions: [
    (payload, { block, marker, rule }) => [
      // Take the marker away, and the space with it, then format the block
      // that is left.
      ...Array.from({ length: marker.length }, () =>
        raise({ type: 'delete.backward', unit: 'character' }),
      ),
      rule.style
        ? raise({ type: 'block.set', at: block.path, props: { style: rule.style } })
        : raise({ type: 'list item.toggle', listItem: rule.listItem }),
    ],
  ],
});

export { MARKDOWN, markdownBehavior };
