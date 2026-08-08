/**
 * @file
 * Registers Drupal.editors.portable_text, backed by @portabletext/editor.
 *
 * Build with `npm run build`; the result is committed as
 * js/portable-text-editor.js.
 */

import { Fragment, StrictMode, useEffect, useId, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  EditorProvider,
  PortableTextEditable,
  defineSchema,
  keyGenerator,
  useEditor,
} from '@portabletext/editor';
import { BehaviorPlugin, EventListenerPlugin } from '@portabletext/editor/plugins';
import { defineBehavior, execute, raise } from '@portabletext/editor/behaviors';
import {
  getActiveStyle,
  getFocusSpan,
  getFocusTextBlock,
  isActiveAnnotation,
  isActiveDecorator,
  isActiveListItem,
  isActiveStyle,
} from '@portabletext/editor/selectors';

const schemaDefinition = defineSchema({
  decorators: [
    { name: 'strong' },
    { name: 'em' },
    { name: 'underline' },
    { name: 'strike-through' },
    { name: 'code' },
    { name: 'superscript' },
    { name: 'subscript' },
    { name: 'highlight' },
  ],
  styles: [
    { name: 'normal' },
    { name: 'h2' },
    { name: 'h3' },
    { name: 'h4' },
    { name: 'blockquote' },
  ],
  lists: [{ name: 'bullet' }, { name: 'number' }],
  annotations: [{ name: 'link', fields: [{ name: 'href', type: 'string' }] }],
  blockObjects: [
    {
      name: 'media',
      fields: [
        { name: 'uuid', type: 'string' },
        { name: 'viewMode', type: 'string' },
      ],
    },
    {
      name: 'table',
      fields: [
        { name: 'rows', type: 'array' },
        { name: 'header', type: 'boolean' },
        { name: 'widths', type: 'array' },
      ],
    },
  ],
});

// A new table starts small; the controls grow it from there.
const NEW_TABLE_ROWS = 2;
const NEW_TABLE_COLUMNS = 2;

// How this platform writes the modifier the editor's built-in shortcuts use.
// The match is case insensitive because userAgentData reports "macOS" while
// the older navigator.platform reports "MacIntel".
const MOD = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '')
  ? '⌘'
  : 'Ctrl+';

// Formatting controls show a letter or symbol, the way word processors do,
// and structural ones show a drawn icon. Both are decorative: the accessible
// name and the tooltip carry the wording.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Icon({ children }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/**
 * The face of each button: a glyph class plus its text, or a drawn icon.
 */
const FACES = {
  bold: <span className="portable-text-editor__glyph--bold">B</span>,
  italic: <span className="portable-text-editor__glyph--italic">I</span>,
  underline: <span className="portable-text-editor__glyph--underline">U</span>,
  strike_through: <span className="portable-text-editor__glyph--strike">S</span>,
  code: <span className="portable-text-editor__glyph--code">&lt;/&gt;</span>,
  superscript: (
    <span>
      x<sup>2</sup>
    </span>
  ),
  subscript: (
    <span>
      x<sub>2</sub>
    </span>
  ),
  highlight: <span className="portable-text-editor__glyph--highlight">A</span>,
  clear_format: (
    <span>
      T<span className="portable-text-editor__glyph--times">×</span>
    </span>
  ),
  undo: (
    <Icon>
      <path d="M3 8h6.5a3.5 3.5 0 1 1 0 7H6M3 8l3-3M3 8l3 3" {...stroke} />
    </Icon>
  ),
  redo: (
    <Icon>
      <path d="M13 8H6.5a3.5 3.5 0 1 0 0 7H10M13 8l-3-3M13 8l-3 3" {...stroke} />
    </Icon>
  ),
  bulleted_list: (
    <Icon>
      <circle cx="2.5" cy="4" r="1.1" fill="currentColor" />
      <circle cx="2.5" cy="8" r="1.1" fill="currentColor" />
      <circle cx="2.5" cy="12" r="1.1" fill="currentColor" />
      <path d="M6 4h8.5M6 8h8.5M6 12h8.5" {...stroke} />
    </Icon>
  ),
  numbered_list: (
    <Icon>
      <path d="M6 4h8.5M6 8h8.5M6 12h8.5" {...stroke} />
      <text x="0" y="5.6" fontSize="5.5" fill="currentColor">
        1
      </text>
      <text x="0" y="9.6" fontSize="5.5" fill="currentColor">
        2
      </text>
      <text x="0" y="13.6" fontSize="5.5" fill="currentColor">
        3
      </text>
    </Icon>
  ),
  link: (
    <Icon>
      <path d="M6.6 9.4a2.9 2.9 0 0 1 0-4.1l1.7-1.7a2.9 2.9 0 1 1 4.1 4.1l-.9.9M9.4 6.6a2.9 2.9 0 0 1 0 4.1l-1.7 1.7a2.9 2.9 0 1 1-4.1-4.1l.9-.9" {...stroke} />
    </Icon>
  ),
  table: (
    <Icon>
      <path d="M2 3h12v10H2zM2 6.5h12M2 10h12M6.5 6.5V13M10 6.5V13" {...stroke} />
    </Icon>
  ),
  media: (
    <Icon>
      <path d="M2 3h12v10H2z" {...stroke} />
      <circle cx="5.7" cy="6.3" r="1.1" fill="currentColor" />
      <path d="m2 11 3.5-3 3 2.5L11 8l3 3" {...stroke} />
    </Icon>
  ),
};

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

// What the block style menu offers, in the order it lists them.
const STYLE_OPTIONS = [
  ['normal', Drupal.t('Paragraph')],
  ['h2', Drupal.t('Heading 2')],
  ['h3', Drupal.t('Heading 3')],
  ['h4', Drupal.t('Heading 4')],
  ['blockquote', Drupal.t('Block quote')],
];

/**
 * Reads an editor selector, re-rendering whenever its answer can change.
 *
 * Both events are needed and neither is enough. "selection" alone leaves a
 * control showing what was true before the change it just made, because the
 * next render only comes with the next caret move. "operation" alone misses
 * state that depends on where the caret is, such as "is it inside bold text".
 *
 * It has to be "operation" rather than "mutation" or "patch": those are held
 * back until the editor is dirty and arrive about a second late, which is long
 * enough to watch the toolbar catch up. `editor.subscribe()` never fires at
 * all.
 *
 * @param {object} editor
 *   The editor from useEditor().
 * @param {Function} selector
 *   A selector from @portabletext/editor/selectors.
 *
 * @return {*}
 *   The selector's current answer.
 */
function useEditorState(editor, selector) {
  const [, rerender] = useReducer((count) => count + 1, 0);
  useEffect(() => {
    const subscriptions = ['selection', 'operation'].map((event) => editor.on(event, rerender));
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  }, [editor]);
  return selector(editor.getSnapshot());
}

/**
 * Runs an editor event once the focus the editor was just given has landed.
 *
 * The editor ignores document changes while it is blurred, which is the state
 * it is in whenever a toolbar control took the focus.
 *
 * @param {object} editor
 *   The editor from useEditor().
 * @param {object} event
 *   The editor event to send.
 */
function sendWhenFocused(editor, event) {
  editor.send({ type: 'focus' });
  requestAnimationFrame(() => editor.send(event));
}

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
      onClick={onOpen}
    >
      {FACES.link}
    </button>
  );
}

/**
 * The URL field, shown on its own row so the toolbar does not move.
 *
 * ponytail: an inline row rather than window.prompt, because a native modal
 * cannot be reached by keyboard users predictably and blocks automated tests.
 */
function LinkForm({ onClose }) {
  const editor = useEditor();
  // The link being edited has to be read before the field takes the focus,
  // because that moves the selection out of the editor.
  const [target] = useState(() => {
    const snapshot = editor.getSnapshot();
    const block = getFocusTextBlock(snapshot);
    const span = getFocusSpan(snapshot);
    if (!block || !span) {
      return null;
    }
    // A span's marks are either decorator names or keys of the block's mark
    // definitions, which is where a link keeps its URL.
    const markDefs = block.node.markDefs || [];
    const link = (span.node.marks || [])
      .map((mark) => markDefs.find((markDef) => markDef._key === mark))
      .find((markDef) => markDef && markDef._type === 'link');
    if (!link) {
      return null;
    }
    return {
      href: typeof link.href === 'string' ? link.href : '',
      // @see the "annotation.set" behavior, which expects a path ending in the
      // mark definition's key.
      at: [...block.path, 'markDefs', { _key: link._key }],
      // Removing needs a selection that covers the link rather than a path,
      // and the caret alone does not qualify.
      // ponytail: the focused span is the whole link unless a decorator splits
      // it; widen this to the neighbouring spans if that ever matters.
      range: {
        anchor: { path: span.path, offset: 0 },
        focus: { path: span.path, offset: (span.node.text || '').length },
      },
    };
  });
  const [href, setHref] = useState(target ? target.href : '');
  // More than one editor can be on a page, so the field needs its own id.
  const fieldId = useId();

  const close = () => {
    onClose();
    editor.send({ type: 'focus' });
  };

  const apply = () => {
    if (href === '') {
      return;
    }
    onClose();
    if (target && target.at) {
      // Changing an existing link edits its mark definition in place, so it
      // works even when nothing is selected.
      editor.send({ type: 'annotation.set', at: target.at, props: { href } });
      editor.send({ type: 'focus' });
      return;
    }
    sendWhenFocused(editor, {
      type: 'annotation.toggle',
      annotation: { name: 'link', value: { href } },
    });
  };

  const remove = () => {
    onClose();
    editor.send({
      type: 'annotation.remove',
      annotation: { name: 'link' },
      at: target.range,
    });
    editor.send({ type: 'focus' });
  };

  return (
    <div className="portable-text-editor__link-form">
      <label className="portable-text-editor__link-label" htmlFor={fieldId}>
        {Drupal.t('Link URL')}
      </label>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input
        type="text"
        autoFocus
        id={fieldId}
        className="portable-text-editor__link-input"
        placeholder="https://"
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      />
      <button type="button" className="portable-text-editor__button" disabled={href === ''} onClick={apply}>
        {target ? Drupal.t('Update') : Drupal.t('Apply')}
      </button>
      {target ? (
        <button type="button" className="portable-text-editor__button" onClick={remove}>
          {Drupal.t('Remove')}
        </button>
      ) : null}
      <button type="button" className="portable-text-editor__button" onClick={close}>
        {Drupal.t('Cancel')}
      </button>
    </div>
  );
}

// The element each block style and inline decorator is drawn with while
// editing. The filter makes the same choices when rendering for a visitor.
const STYLE_TAGS = { h2: 'h2', h3: 'h3', h4: 'h4', blockquote: 'blockquote' };
const DECORATOR_TAGS = {
  strong: 'strong',
  em: 'em',
  underline: 'u',
  'strike-through': 's',
  code: 'code',
  superscript: 'sup',
  subscript: 'sub',
  highlight: 'mark',
};

function renderStyle(props) {
  // A block can carry both a style and a list item, but the filter renders it
  // as a list item and drops the style, so the writing area does the same.
  const Tag = props.block.listItem ? undefined : STYLE_TAGS[props.schemaType.value];
  return Tag ? <Tag>{props.children}</Tag> : props.children;
}

function renderDecorator(props) {
  const Tag = DECORATOR_TAGS[props.value];
  return Tag ? <Tag>{props.children}</Tag> : props.children;
}

/**
 * Builds an empty grid.
 *
 * @param {number} rows
 *   How many rows.
 * @param {number} columns
 *   How many columns.
 *
 * @return {Array}
 *   Rows of empty cell strings.
 */
function emptyRows(rows, columns) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''));
}

/**
 * Moves the focus to a cell, if the table still has one there.
 *
 * @param {HTMLElement} table
 *   The table's wrapper.
 * @param {number} row
 *   The row to focus, counting from zero.
 * @param {number} column
 *   The column to focus, counting from zero.
 */
function focusCell(table, row, column) {
  const cell = table.querySelector(`[data-row="${row}"][data-column="${column}"]`);
  if (cell) {
    cell.focus();
    cell.setSelectionRange(cell.value.length, cell.value.length);
  }
}

/**
 * A table cell, which grows to fit what is written in it.
 */
function TableCell({ row, column, value, header, onChange, onFocus, onKeyDown }) {
  const field = useRef(null);

  useEffect(() => {
    // A textarea does not size itself, and a one line cell that scrolls its
    // own text is the worst part of a table editor.
    const element = field.current;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={field}
      rows={1}
      data-row={row}
      data-column={column}
      className="portable-text-editor__cell"
      aria-label={
        header
          ? Drupal.t('Column @column heading', { '@column': column + 1 })
          : Drupal.t('Row @row, column @column', { '@row': row + 1, '@column': column + 1 })
      }
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * The editing grid for a table block.
 *
 * The block is a block object, so the editor treats it as one opaque thing and
 * this owns everything inside it: what a cell holds, how the caret moves
 * between cells, and the controls, which only appear while the table is being
 * worked on. Cells hold plain text with line breaks; formatting inside a cell
 * would need an editor per cell.
 */
function TableBlock({ value, path }) {
  const editor = useEditor();
  const wrapper = useRef(null);
  // The cell last used, which is what the controls act on, and whether the
  // table has the focus at all, which is what shows them.
  const [at, setAt] = useState({ row: 0, column: 0 });
  const [active, setActive] = useState(false);

  const rows = Array.isArray(value.rows) ? value.rows : [];
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const header = value.header !== false;
  // Widths are only used when there is one per column; adding or removing a
  // column drops them rather than trying to guess what should give way.
  const widths =
    Array.isArray(value.widths) && value.widths.length === columns ? value.widths : null;

  const update = (props) => editor.send({ type: 'block.set', at: path, props });
  const setRows = (next) => update({ rows: next });

  /**
   * Drags the boundary between two columns.
   *
   * The columns are sized directly while dragging and only written to the
   * document when the pointer is let go, so that a drag is one undo step
   * rather than one per pixel.
   */
  const startResize = (event, index) => {
    event.preventDefault();
    const table = wrapper.current.querySelector('table');
    const columnElements = table.querySelectorAll('col');
    const total = table.getBoundingClientRect().width;
    const from = event.clientX;
    const starting = widths || Array.from({ length: columns }, () => 100 / columns);
    const pair = starting[index] + starting[index + 1];
    let next = starting;

    const move = (moved) => {
      const delta = ((moved.clientX - from) / total) * 100;
      // Neither column may collapse to nothing.
      const left = Math.max(6, Math.min(pair - 6, starting[index] + delta));
      next = [...starting];
      next[index] = Math.round(left * 10) / 10;
      next[index + 1] = Math.round((pair - left) * 10) / 10;
      columnElements[index].style.width = `${next[index]}%`;
      columnElements[index + 1].style.width = `${next[index + 1]}%`;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      update({ widths: next });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  const blank = (length) => Array.from({ length }, () => '');

  // Every control works from the cell that was last used, the way a word
  // processor does, rather than only appending at the far edge.
  const insertRow = (offset) => {
    const index = at.row + offset;
    setRows([...rows.slice(0, index), blank(columns), ...rows.slice(index)]);
    requestAnimationFrame(() => focusCell(wrapper.current, index, at.column));
  };
  const insertColumn = (offset) => {
    const index = at.column + offset;
    update({
      rows: rows.map((row) => [...row.slice(0, index), '', ...row.slice(index)]),
      widths: null,
    });
    requestAnimationFrame(() => focusCell(wrapper.current, at.row, index));
  };
  const removeRow = () => {
    setRows(rows.filter((row, index) => index !== at.row));
    requestAnimationFrame(() => focusCell(wrapper.current, Math.max(0, at.row - 1), at.column));
  };
  const removeColumn = () => {
    update({
      rows: rows.map((row) => row.filter((cell, index) => index !== at.column)),
      widths: null,
    });
    requestAnimationFrame(() =>
      focusCell(wrapper.current, at.row, Math.max(0, at.column - 1)),
    );
  };

  /**
   * Keeps the caret moving the way it does in a spreadsheet.
   */
  const onCellKeyDown = (event, row, column) => {
    const element = event.target;
    const atStart = element.selectionStart === 0 && element.selectionEnd === 0;
    const atEnd =
      element.selectionStart === element.value.length &&
      element.selectionEnd === element.value.length;

    if (event.key === 'Tab') {
      event.preventDefault();
      const forward = !event.shiftKey;
      const flat = row * columns + column + (forward ? 1 : -1);
      if (flat < 0) {
        return;
      }
      if (flat >= rows.length * columns) {
        // Tab past the last cell grows the table, which is how every editor
        // worth using behaves.
        setRows([...rows, blank(columns)]);
        requestAnimationFrame(() => focusCell(wrapper.current, rows.length, 0));
        return;
      }
      focusCell(wrapper.current, Math.floor(flat / columns), flat % columns);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.send({ type: 'focus' });
      return;
    }
    // Up and down leave the cell only from its first or last line, so that a
    // cell holding several lines can still be moved around in.
    if (event.key === 'ArrowUp' && !element.value.slice(0, element.selectionStart).includes('\n')) {
      event.preventDefault();
      focusCell(wrapper.current, row - 1, column);
      return;
    }
    if (event.key === 'ArrowDown' && !element.value.slice(element.selectionEnd).includes('\n')) {
      event.preventDefault();
      focusCell(wrapper.current, row + 1, column);
      return;
    }
    if (event.key === 'ArrowLeft' && atStart) {
      event.preventDefault();
      focusCell(wrapper.current, row, column - 1);
    }
    if (event.key === 'ArrowRight' && atEnd) {
      event.preventDefault();
      focusCell(wrapper.current, row, column + 1);
    }
  };

  return (
    <div
      ref={wrapper}
      className="portable-text-editor__table"
      contentEditable={false}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setActive(false);
        }
      }}
    >
      <table>
        <colgroup>
          {Array.from({ length: columns }, (ignored, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <col key={index} style={widths ? { width: `${widths[index]}%` } : undefined} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, rowIndex) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={rowIndex}>
              {Array.from({ length: columns }, (ignored, columnIndex) => {
                const isHeading = header && rowIndex === 0;
                const Wrapper = isHeading ? 'th' : 'td';
                return (
                  <Wrapper
                    // eslint-disable-next-line react/no-array-index-key
                    key={columnIndex}
                    className={
                      active && (at.row === rowIndex || at.column === columnIndex)
                        ? 'portable-text-editor__cell--in-line'
                        : undefined
                    }
                  >
                    {rowIndex === 0 && columnIndex < columns - 1 ? (
                      <span
                        className="portable-text-editor__resize"
                        role="separator"
                        aria-label={Drupal.t('Resize column @column', {
                          '@column': columnIndex + 1,
                        })}
                        onPointerDown={(down) => startResize(down, columnIndex)}
                      />
                    ) : null}
                    <TableCell
                      row={rowIndex}
                      column={columnIndex}
                      header={isHeading}
                      value={row[columnIndex] || ''}
                      onChange={(changed) =>
                        setRows(
                          rows.map((current, index) =>
                            index === rowIndex
                              ? Object.assign([], current, { [columnIndex]: changed.target.value })
                              : current,
                          ),
                        )
                      }
                      onFocus={() => {
                        // The focused cell is what the controls act on, so it
                        // is read from the focus rather than from the last key
                        // pressed, which would always be one cell behind.
                        setAt({ row: rowIndex, column: columnIndex });
                        setActive(true);
                      }}
                      onKeyDown={(event) => onCellKeyDown(event, rowIndex, columnIndex)}
                    />
                  </Wrapper>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {active ? (
        <div className="portable-text-editor__table-actions" role="toolbar" aria-label={Drupal.t('Table')}>
          <span className="portable-text-editor__table-where">
            {Drupal.t('Row @row, column @column', {
              '@row': at.row + 1,
              '@column': at.column + 1,
            })}
          </span>
          <button type="button" onClick={() => insertRow(0)}>
            {Drupal.t('Row above')}
          </button>
          <button type="button" onClick={() => insertRow(1)}>
            {Drupal.t('Row below')}
          </button>
          <button type="button" onClick={() => insertColumn(0)}>
            {Drupal.t('Column left')}
          </button>
          <button type="button" onClick={() => insertColumn(1)}>
            {Drupal.t('Column right')}
          </button>
          <span className="portable-text-editor__divider" />
          <button type="button" disabled={rows.length < 2} onClick={removeRow}>
            {Drupal.t('Delete row')}
          </button>
          <button type="button" disabled={columns < 2} onClick={removeColumn}>
            {Drupal.t('Delete column')}
          </button>
          <span className="portable-text-editor__divider" />
          <button
            type="button"
            aria-pressed={header}
            onClick={() => update({ header: !header })}
          >
            {Drupal.t('Header row')}
          </button>
          <button type="button" onClick={() => editor.send({ type: 'delete.block', at: path })}>
            {Drupal.t('Delete table')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Opens Drupal's media library and reports back what was chosen.
 *
 * The library is Drupal's own dialog, so what it can offer, and to whom, is
 * decided by Drupal rather than here.
 *
 * @param {object} media
 *   The media settings from the Editor plugin.
 * @param {Function} onSelect
 *   Called with the chosen media's UUID.
 *
 * @see \Drupal\media_library\MediaLibraryEditorOpener
 */
function openMediaLibrary(media, onSelect) {
  // The library reports its choice through this event, which is how core's
  // own editors receive it too.
  const received = (event, values) => {
    jQuery(window).off('editor:dialogsave', received);
    const uuid = values?.attributes?.['data-entity-uuid'];
    if (uuid) {
      onSelect(uuid);
    }
  };
  jQuery(window).on('editor:dialogsave', received);

  Drupal.ajax({
    url: media.libraryUrl,
    dialog: {
      title: Drupal.t('Add or select media'),
      width: 'auto',
      classes: { 'ui-dialog': 'ui-dialog--narrow' },
    },
    dialogType: 'modal',
    selector: '.portable-text-editor-media-loading',
    progress: { type: 'fullscreen' },
    submit: { editor_object: {} },
  }).execute();
}

/**
 * An embedded media item, shown as Drupal renders it.
 */
function MediaBlock({ value, path, media }) {
  const editor = useEditor();
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let current = true;
    const element = `<drupal-media data-entity-type="media" data-entity-uuid="${value.uuid}"></drupal-media>`;
    fetch(`${media.previewUrl}?${new URLSearchParams({ text: element, uuid: value.uuid })}`, {
      headers: { 'X-Drupal-MediaPreview-CSRF-Token': media.previewCsrfToken },
    })
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then((html) => {
        if (current) {
          setPreview({ html });
        }
      })
      .catch(() => {
        if (current) {
          setPreview({ failed: true });
        }
      });
    return () => {
      current = false;
    };
  }, [value.uuid, media.previewUrl, media.previewCsrfToken]);

  return (
    <div className="portable-text-editor__media" contentEditable={false}>
      {preview === null ? (
        <p className="portable-text-editor__media-message">{Drupal.t('Loading media…')}</p>
      ) : null}
      {preview?.failed ? (
        <p className="portable-text-editor__media-message">
          {Drupal.t('This media could not be shown. It may have been deleted.')}
        </p>
      ) : null}
      {preview?.html !== undefined ? (
        // Drupal rendered this, for this text format and this user, through
        // its own media pipeline. It is markup on purpose.
        // eslint-disable-next-line react/no-danger
        <div dangerouslySetInnerHTML={{ __html: preview.html }} />
      ) : null}
      <div className="portable-text-editor__media-actions">
        <button
          type="button"
          onClick={() =>
            openMediaLibrary(media, (uuid) =>
              editor.send({ type: 'block.set', at: path, props: { uuid } }),
            )
          }
        >
          {Drupal.t('Replace media')}
        </button>
        <button type="button" onClick={() => editor.send({ type: 'delete.block', at: path })}>
          {Drupal.t('Remove media')}
        </button>
      </div>
    </div>
  );
}

function buildRenderBlock(media) {
  return function renderBlock(props) {
    if (props.value._type === 'table') {
      return <TableBlock value={props.value} path={props.path} />;
    }
    if (props.value._type === 'media') {
      return media ? (
        <MediaBlock value={props.value} path={props.path} media={media} />
      ) : (
        // The format no longer embeds media, so say so rather than showing an
        // empty space that hides content which is still stored.
        <div className="portable-text-editor__media" contentEditable={false}>
          <p className="portable-text-editor__media-message">
            {Drupal.t('Embedded media, which this text format can no longer show.')}
          </p>
        </div>
      );
    }
    return props.children;
  };
}

function renderAnnotation(props) {
  if (props.schemaType.name === 'link') {
    return (
      <span className="portable-text-editor__link" title={props.value.href}>
        {props.children}
      </span>
    );
  }
  return props.children;
}

/**
 * Hands the editor to the code outside React, which needs to read its value.
 */
function ValueBridge({ onReady }) {
  const editor = useEditor();
  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);
  return null;
}

// Stable, so the plugin does not unregister and register on every render.
const BEHAVIORS = [markdownBehavior];

/**
 * The writing area itself, inside the provider so that it can reach the
 * editor, which the markdown rules and the link shortcut both need.
 */
function Editable({ media, ariaLabel, placeholder, rows, hasLink, onOpenLink }) {
  return (
    <PortableTextEditable
      className="portable-text-editor__editable"
      style={{ minHeight: `${Math.max(rows, 3) * 1.7}em` }}
      aria-label={ariaLabel}
      renderStyle={renderStyle}
      renderDecorator={renderDecorator}
      renderAnnotation={renderAnnotation}
      renderBlock={buildRenderBlock(media)}
      renderPlaceholder={() => (
        <span className="portable-text-editor__placeholder">{placeholder}</span>
      )}
      onKeyDown={(event) => {
        if (hasLink && event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onOpenLink();
          return;
        }
      }}
    />
  );
}

function Editor({ toolbar, media, initialValue, ariaLabel, placeholder, rows, onReady, onValue }) {
  const [linkOpen, setLinkOpen] = useState(false);
  // Config can outlive a button, so anything unknown here is dropped.
  const buttons = toolbar.filter((id) => BUTTONS[id]);
  const hasLink = buttons.includes('link');

  return (
    <EditorProvider initialConfig={{ schemaDefinition, initialValue }}>
      <ValueBridge onReady={onReady} />
      <BehaviorPlugin behaviors={BEHAVIORS} />
      <EventListenerPlugin
        on={(event) => {
          if (event.type === 'mutation') {
            onValue(event.value);
          }
        }}
      />
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
              <LinkButton index={index} open={linkOpen} onOpen={() => setLinkOpen(true)} />
            ) : null}
            {id !== 'styles' && id !== 'link' ? (
              <ToolbarButton id={id} index={index} media={media} />
            ) : null}
          </Fragment>
        ))}
      </div>
      {linkOpen ? <LinkForm onClose={() => setLinkOpen(false)} /> : null}
      <Editable
        media={media}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        rows={rows}
        hasLink={hasLink}
        onOpenLink={() => setLinkOpen(true)}
      />
    </EditorProvider>
  );
}

/**
 * Turns a textarea value into an initial Portable Text value.
 *
 * @param {string} text
 *   The textarea value.
 *
 * @return {Array|undefined}
 *   Portable Text blocks, or undefined for an empty field.
 */
function parseValue(text) {
  const trimmed = (text || '').trim();
  if (trimmed === '') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Not Portable Text. This is what a value authored in another text format
    // looks like, so it is kept as a single paragraph rather than dropped.
  }
  return [
    {
      _type: 'block',
      _key: keyGenerator(),
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: keyGenerator(), text: trimmed, marks: [] }],
    },
  ];
}

/**
 * Turns a Portable Text value into the string the textarea submits.
 *
 * @param {Array|undefined} value
 *   The Portable Text value.
 *
 * @return {string}
 *   The JSON to store, or an empty string when there is no content, so that
 *   required-field validation treats the field as empty.
 */
function serializeValue(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }
  // ponytail: "empty" means no span has text. Revisit if block objects such as
  // images are ever added to the schema, since those carry no text.
  const hasContent = value.some((block) =>
    Array.isArray(block.children)
      ? block.children.some((child) => typeof child.text === 'string' && child.text.trim() !== '')
      : // Anything that is not a text block, such as a table, is content in
        // its own right even when every cell is still empty.
        block._type !== 'block',
  );
  return hasContent ? JSON.stringify(value) : '';
}

// One record per attached textarea: the React root, its container, and the
// change callback Drupal registers after attaching.
const instances = new WeakMap();

Drupal.editors.portable_text = {
  attach(element, format) {
    // Drupal can run attach twice for the same element, for instance when a
    // form is rebuilt over AJAX.
    if (instances.has(element)) {
      this.detach(element, format, 'unload');
    }

    const container = document.createElement('div');
    container.className = 'portable-text-editor';
    element.parentNode.insertBefore(container, element.nextSibling);
    element.setAttribute('style', 'display: none;');

    // A hidden field cannot be focused, so a browser refuses to submit the
    // form when it is both required and empty. Core's CKEditor 5 integration
    // moves the attribute aside the same way.
    const wasRequired = element.hasAttribute('required');
    if (wasRequired) {
      element.removeAttribute('required');
    }

    const record = { container, wasRequired, callback: null };
    instances.set(element, record);

    // Core asks the editor to serialize on submit, but through a handler that
    // closed over whichever text format was active when the page loaded, so it
    // asks the wrong editor once the format has been switched. Syncing here as
    // well means what was typed is stored either way.
    // @see Drupal.behaviors.editor.attach()
    record.sync = () => {
      if (record.editor) {
        element.value = serializeValue(record.editor.getSnapshot().context.value);
      }
    };
    if (element.form) {
      element.form.addEventListener('submit', record.sync);
    }

    const label = document.querySelector(`label[for="${element.id}"]`);
    record.root = createRoot(container);
    record.root.render(
      <StrictMode>
        <Editor
          toolbar={format.editorSettings.toolbar}
          media={format.editorSettings.media}
          initialValue={parseValue(element.value)}
          ariaLabel={label ? label.textContent.trim() : Drupal.t('Rich text editor')}
          onReady={(editor) => {
            record.editor = editor;
          }}
          placeholder={element.placeholder || Drupal.t('Start writing…')}
          rows={Number(element.rows) || 5}
          onValue={(value) => {
            element.value = serializeValue(value);
            if (record.callback) {
              record.callback(element.value);
            }
          }}
        />
      </StrictMode>,
    );
  },

  detach(element, format, trigger) {
    const record = instances.get(element);
    if (!record) {
      return;
    }
    // "serialize" means the form is about to be submitted, over AJAX or not.
    // The editor stays alive and only the textarea is synced, from the editor
    // itself: the mutation event that normally keeps it up to date is held
    // back for about a second, so the last thing typed would not be stored.
    if (trigger === 'serialize') {
      record.sync();
      return;
    }
    if (element.form) {
      element.form.removeEventListener('submit', record.sync);
    }
    record.root.unmount();
    record.container.remove();
    element.removeAttribute('style');
    if (record.wasRequired) {
      element.setAttribute('required', 'required');
    }
    instances.delete(element);
  },

  onChange(element, callback) {
    const record = instances.get(element);
    if (record) {
      record.callback = callback;
    }
  },
};
