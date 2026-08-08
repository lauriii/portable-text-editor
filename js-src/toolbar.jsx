/**
 * @file
 * The toolbar: which controls exist, what each one does, and how the caret
 * and the focus move around them.
 */

import { Fragment, useRef, useState } from 'react';
import { useEditor } from '@portabletext/editor';
import {
  getActiveStyle,
  isActiveAnnotation,
  isActiveDecorator,
  isActiveListItem,
} from '@portabletext/editor/selectors';
import { FACES } from './icons.jsx';
import { NEW_TABLE_ROWS, NEW_TABLE_COLUMNS } from './schema.jsx';
import { useEditorState } from './editor-state.js';
import { emptyRows } from './table.jsx';
import { openMediaLibrary } from './media.jsx';

// How this platform writes the modifier the editor's built-in shortcuts use.
// The match is case insensitive because userAgentData reports "macOS" while
// the older navigator.platform reports "MacIntel".
const MOD = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '')
  ? '⌘'
  : 'Ctrl+';

// The inline formatting "Remove formatting" strips.
const DECORATORS = [
  'strong',
  'em',
  'underline',
  'strike-through',
  'code',
  'superscript',
  'subscript',
  'highlight',
];

/**
 * Toolbar controls, keyed by the IDs the Editor plugin stores in config.
 *
 * `selector` reports whether the control is currently applied, `event` is the
 * editor event a click sends, `shortcut` is shown in the tooltip, and `group`
 * draws a divider wherever it changes.
 */
const BUTTONS = {
  undo: {
    label: Drupal.t('Undo'),
    shortcut: `${MOD}Z`,
    group: 'history',
    event: { type: 'history.undo' },
  },
  redo: {
    label: Drupal.t('Redo'),
    shortcut: `${MOD}\u21e7Z`,
    group: 'history',
    event: { type: 'history.redo' },
  },
  bold: {
    label: Drupal.t('Bold'),
    shortcut: `${MOD}B`,
    group: 'text',
    selector: isActiveDecorator('strong'),
    event: { type: 'decorator.toggle', decorator: 'strong' },
  },
  italic: {
    label: Drupal.t('Italic'),
    shortcut: `${MOD}I`,
    group: 'text',
    selector: isActiveDecorator('em'),
    event: { type: 'decorator.toggle', decorator: 'em' },
  },
  underline: {
    label: Drupal.t('Underline'),
    shortcut: `${MOD}U`,
    group: 'text',
    selector: isActiveDecorator('underline'),
    event: { type: 'decorator.toggle', decorator: 'underline' },
  },
  strike_through: {
    label: Drupal.t('Strike-through'),
    group: 'text',
    selector: isActiveDecorator('strike-through'),
    event: { type: 'decorator.toggle', decorator: 'strike-through' },
  },
  code: {
    label: Drupal.t('Code'),
    group: 'text',
    selector: isActiveDecorator('code'),
    event: { type: 'decorator.toggle', decorator: 'code' },
  },
  superscript: {
    label: Drupal.t('Superscript'),
    group: 'text',
    selector: isActiveDecorator('superscript'),
    event: { type: 'decorator.toggle', decorator: 'superscript' },
  },
  subscript: {
    label: Drupal.t('Subscript'),
    group: 'text',
    selector: isActiveDecorator('subscript'),
    event: { type: 'decorator.toggle', decorator: 'subscript' },
  },
  highlight: {
    label: Drupal.t('Highlight'),
    group: 'text',
    selector: isActiveDecorator('highlight'),
    event: { type: 'decorator.toggle', decorator: 'highlight' },
  },
  clear_format: {
    label: Drupal.t('Remove formatting'),
    group: 'text',
  },
  bulleted_list: {
    label: Drupal.t('Bulleted list'),
    group: 'list',
    selector: isActiveListItem('bullet'),
    event: { type: 'list item.toggle', listItem: 'bullet' },
  },
  numbered_list: {
    label: Drupal.t('Numbered list'),
    group: 'list',
    selector: isActiveListItem('number'),
    event: { type: 'list item.toggle', listItem: 'number' },
  },
  link: {
    label: Drupal.t('Link'),
    shortcut: `${MOD}K`,
    group: 'link',
  },
  table: {
    label: Drupal.t('Insert table'),
    group: 'insert',
  },
  media: {
    label: Drupal.t('Insert media'),
    group: 'insert',
  },
  styles: {
    label: Drupal.t('Block style'),
    group: 'style',
  },
};

// What the block style menu offers, in the order it lists them.
const STYLE_OPTIONS = [
  ['normal', Drupal.t('Paragraph')],
  ['h2', Drupal.t('Heading 2')],
  ['h3', Drupal.t('Heading 3')],
  ['h4', Drupal.t('Heading 4')],
  ['blockquote', Drupal.t('Block quote')],
];

/**
 * Moves focus between toolbar buttons, making the toolbar a single tab stop.
 *
 * @param {object} event
 *   The React keydown event on the toolbar.
 */
function onToolbarKeyDown(event) {
  const offset = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[event.key];
  if (offset === undefined) {
    return;
  }
  // Left and right always move along the toolbar, including out of the block
  // style menu; up and down are left alone so they still change its value.
  const buttons = Array.from(event.currentTarget.querySelectorAll('button, select'));
  const from = buttons.indexOf(document.activeElement);
  if (from === -1) {
    return;
  }
  event.preventDefault();
  const to = Math.min(buttons.length - 1, Math.max(0, from + offset));
  buttons.forEach((button, index) => {
    button.tabIndex = index === to ? 0 : -1;
  });
  buttons[to].focus();
}

function ToolbarButton({ id, index, media }) {
  const editor = useEditor();
  const { label, shortcut, selector, event } = BUTTONS[id];
  const active = useEditorState(editor, selector || (() => false));

  return (
    <button
      type="button"
      className="portable-text-editor__button"
      aria-pressed={active}
      aria-label={label}
      tabIndex={index === 0 ? 0 : -1}
      title={shortcut ? `${label} (${shortcut})` : label}
      // Keep the selection in the editable while the button is used.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (id === 'media') {
          openMediaLibrary(media, (uuid) =>
            editor.send({
              type: 'insert.block',
              block: { _type: 'media', uuid },
              placement: 'auto',
            }),
          );
        }
        else if (id === 'table') {
          editor.send({
            type: 'insert.block',
            block: {
              _type: 'table',
              rows: emptyRows(NEW_TABLE_ROWS, NEW_TABLE_COLUMNS),
              header: true,
            },
            placement: 'auto',
          });
        }
        else if (event) {
          editor.send(event);
        }
        else {
          // "Remove formatting" clears the link and the decorators that are
          // actually applied. Skipping the rest keeps the undo history short,
          // because each removal is a step of its own.
          const snapshot = editor.getSnapshot();
          DECORATORS.filter((decorator) => isActiveDecorator(decorator)(snapshot)).forEach(
            (decorator) => editor.send({ type: 'decorator.remove', decorator }),
          );
          editor.send({ type: 'annotation.remove', annotation: { name: 'link' } });
        }
        editor.send({ type: 'focus' });
      }}
    >
      {FACES[id]}
    </button>
  );
}

/**
 * The block style menu, which also shows which style the caret is in.
 */
function StyleSelect({ index }) {
  const editor = useEditor();
  const style = useEditorState(editor, getActiveStyle);
  // There is no active style while the editor is blurred, which is exactly
  // what happens when the menu itself is being used, so the last one the caret
  // was in is kept rather than falling back to "Paragraph".
  const remembered = useRef('normal');
  if (style) {
    remembered.current = style;
  }
  const known = STYLE_OPTIONS.some(([name]) => name === remembered.current);

  return (
    <select
      className="portable-text-editor__select"
      aria-label={Drupal.t('Block style')}
      title={Drupal.t('Block style')}
      tabIndex={index === 0 ? 0 : -1}
      value={known ? remembered.current : 'normal'}
      onChange={(changed) => {
        // Setting the block directly rather than sending "style.add" for the
        // current selection, because using the menu blurs the writing area and
        // the selection the editor restores afterwards is not dependable.
        const block = getFocusTextBlock(editor.getSnapshot());
        if (block) {
          editor.send({ type: 'block.set', at: block.path, props: { style: changed.target.value } });
        }
        editor.send({ type: 'focus' });
      }}
    >
      {STYLE_OPTIONS.map(([name, optionLabel]) => (
        <option key={name} value={name}>
          {optionLabel}
        </option>
      ))}
    </select>
  );
}

function LinkButton({ index, open, onOpen }) {
  const editor = useEditor();
  const active = useEditorState(editor, isActiveAnnotation('link'));
  const label = active ? Drupal.t('Edit link') : Drupal.t('Link');

  return (
    <button
      type="button"
      className="portable-text-editor__button"
      aria-pressed={active || open}
      aria-expanded={open}
      aria-label={label}
      tabIndex={index === 0 ? 0 : -1}
      title={`${label} (${MOD}K)`}
      onMouseDown={(e) => e.preventDefault()}
      // The selection has to be taken now: giving the URL field the focus
      // collapses the editor's own selection, and then there is no longer a
      // range to put a link on.
      onClick={() => onOpen(editor.getSnapshot().context.selection)}
    >
      {FACES.link}
    </button>
  );
}

/**
 * The toolbar.
 */
/**
 * The toolbar.
 */
function Toolbar({ items, media, linkOpen, onOpenLink }) {
  // Config can outlive a control, so anything unknown here is dropped.
  const buttons = items.filter((id) => BUTTONS[id]);

  return (
    <div
      className="portable-text-editor__toolbar"
      role="toolbar"
      aria-label={Drupal.t('Text editor toolbar')}
      onKeyDown={onToolbarKeyDown}
    >
      {buttons.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && BUTTONS[id].group !== BUTTONS[buttons[index - 1]].group ? (
            <span className="portable-text-editor__divider" />
          ) : null}
          {id === 'styles' ? <StyleSelect index={index} /> : null}
          {id === 'link' ? (
            <LinkButton index={index} open={linkOpen} onOpen={onOpenLink} />
          ) : null}
          {id !== 'styles' && id !== 'link' ? (
            <ToolbarButton id={id} index={index} media={media} />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

export { Toolbar };
