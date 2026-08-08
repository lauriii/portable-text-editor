/**
 * @file
 * The "/" menu: type a slash on an empty block to insert something.
 *
 * What the menu offers comes from the editor's own schema at the caret's
 * position, so it cannot offer something the editor would refuse, and it stays
 * honest when a text format has buttons turned off.
 */

import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@portabletext/editor';
import { getApplicableSchema, getFocusTextBlock } from '@portabletext/editor/selectors';
import { useEditorState } from './editor-state.js';
import { NEW_TABLE_ROWS, NEW_TABLE_COLUMNS } from './schema.jsx';
import { emptyRows } from './table.jsx';
import { openMediaLibrary } from './media.jsx';

/**
 * What the menu can insert.
 *
 * `applies` says whether the editor accepts the item where the caret is, and
 * `run` puts it there once the typed marker has been taken away.
 */
const ITEMS = [
  {
    label: Drupal.t('Paragraph'),
    applies: (schema) => schema.styles.has('normal'),
    run: (editor, block) =>
      editor.send({ type: 'block.set', at: block.path, props: { style: 'normal' } }),
  },
  {
    label: Drupal.t('Heading 2'),
    applies: (schema) => schema.styles.has('h2'),
    run: (editor, block) =>
      editor.send({ type: 'block.set', at: block.path, props: { style: 'h2' } }),
  },
  {
    label: Drupal.t('Heading 3'),
    applies: (schema) => schema.styles.has('h3'),
    run: (editor, block) =>
      editor.send({ type: 'block.set', at: block.path, props: { style: 'h3' } }),
  },
  {
    label: Drupal.t('Heading 4'),
    applies: (schema) => schema.styles.has('h4'),
    run: (editor, block) =>
      editor.send({ type: 'block.set', at: block.path, props: { style: 'h4' } }),
  },
  {
    label: Drupal.t('Block quote'),
    applies: (schema) => schema.styles.has('blockquote'),
    run: (editor, block) =>
      editor.send({ type: 'block.set', at: block.path, props: { style: 'blockquote' } }),
  },
  {
    label: Drupal.t('Bulleted list'),
    applies: (schema) => schema.lists.has('bullet'),
    run: (editor) => editor.send({ type: 'list item.toggle', listItem: 'bullet' }),
  },
  {
    label: Drupal.t('Numbered list'),
    applies: (schema) => schema.lists.has('number'),
    run: (editor) => editor.send({ type: 'list item.toggle', listItem: 'number' }),
  },
  {
    label: Drupal.t('Table'),
    applies: (schema) => schema.blockObjects.has('table'),
    run: (editor) =>
      editor.send({
        type: 'insert.block',
        block: {
          _type: 'table',
          rows: emptyRows(NEW_TABLE_ROWS, NEW_TABLE_COLUMNS),
          header: true,
        },
        placement: 'auto',
      }),
  },
  {
    label: Drupal.t('Media'),
    applies: (schema, media) => media !== undefined && schema.blockObjects.has('media'),
    run: (editor, block, media) =>
      openMediaLibrary(media, (uuid) =>
        editor.send({
          type: 'insert.block',
          block: { _type: 'media', uuid },
          placement: 'auto',
        }),
      ),
  },
];

/**
 * Reads the marker the caret sits after, if it is one.
 *
 * @param {object} snapshot
 *   The editor snapshot.
 *
 * @return {object|null}
 *   The block and what has been typed after the slash, or null.
 */
function readMarker(snapshot) {
  const block = getFocusTextBlock(snapshot);
  if (!block || block.node.listItem) {
    return null;
  }
  // The whole block has to be the marker, which keeps the menu out of the way
  // of a slash typed in the middle of a sentence.
  const text = (block.node.children || []).map((child) => child.text || '').join('');
  const marker = /^\/([\p{L}\p{N} ]*)$/u.exec(text);
  return marker ? { block, typed: marker[0], query: marker[1].trim().toLowerCase() } : null;
}

/**
 * The insert menu, anchored to the caret.
 */
function SlashMenu({ media }) {
  const editor = useEditor();
  const schema = useEditorState(editor, getApplicableSchema);
  const marker = useEditorState(editor, readMarker);
  // The block the menu was dismissed on, so that Escape leaves the slash as
  // ordinary text rather than reopening on the next keystroke.
  const [dismissed, setDismissed] = useState(null);
  const [index, setIndex] = useState(0);

  const matches = marker
    ? ITEMS.filter(
        (item) =>
          item.applies(schema, media) &&
          item.label.toLowerCase().includes(marker.query),
      )
    : [];
  const open = marker !== null && dismissed !== marker.block.node._key && matches.length > 0;
  // The keyboard handler runs outside React, so it reads the current state
  // from here rather than from a closure that was built a render ago.
  const now = useRef({});
  now.current = { open, matches, index, marker };

  const choose = (item) => {
    const { marker: at } = now.current;
    setDismissed(null);
    setIndex(0);
    // Take the typed marker away first, so the block is empty and ready.
    for (let step = 0; step < at.typed.length; step += 1) {
      editor.send({ type: 'delete.backward', unit: 'character' });
    }
    item.run(editor, at.block, media);
  };

  useEffect(() => {
    const element = editor.dom.getEditorElement();
    if (!element) {
      return undefined;
    }
    const onKeyDown = (event) => {
      const state = now.current;
      if (!state.open) {
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setIndex((was) => (was + step + state.matches.length) % state.matches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        choose(state.matches[state.index % state.matches.length]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(state.marker.block.node._key);
      }
    };
    // Captured, because the editor handles these keys itself otherwise.
    element.addEventListener('keydown', onKeyDown, true);
    return () => element.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);

  if (!open) {
    return null;
  }

  const caret = editor.dom.getSelectionRect(editor.getSnapshot());
  const chosen = index % matches.length;

  return (
    <ul
      className="portable-text-editor__slash"
      style={caret ? { top: `${caret.bottom + 4}px`, left: `${caret.left}px` } : undefined}
    >
      {matches.map((item, position) => (
        <li key={item.label}>
          <button
            type="button"
            aria-current={position === chosen}
            // The editable keeps the focus, so the caret stays where it is.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(item)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

export { SlashMenu };
