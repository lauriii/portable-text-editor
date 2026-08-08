/**
 * @file
 * The toolbar: which controls exist, what each one does, and how the caret
 * and the focus move around them.
 */

import { Fragment, useId, useRef, useState } from 'react';
import { useEditor } from '@portabletext/editor';
import {
  getActiveStyle,
  getFocusSpan,
  getFocusTextBlock,
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
 * The URL field, shown on its own row so the toolbar does not move.
 *
 * ponytail: an inline row rather than window.prompt, because a native modal
 * cannot be reached by keyboard users predictably and blocks automated tests.
 */
function LinkForm({ at, onClose }) {
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
    // The editor ignores document changes while it is blurred, which it is
    // whenever the URL field has been used, so the focus goes back first. It
    // does not bring the selection with it, so the range the field was opened
    // on is passed along rather than trusted to still be there.
    editor.send({ type: 'focus' });
    editor.send({
      type: 'annotation.toggle',
      annotation: { name: 'link', value: { href } },
      ...(at ? { at } : {}),
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

/**
 * The toolbar, and the link field that belongs to it.
 */
function Toolbar({ items, media, link, onOpenLink, onCloseLink }) {
  // Config can outlive a control, so anything unknown here is dropped.
  const buttons = items.filter((id) => BUTTONS[id]);

  return (
    <>
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
              <LinkButton index={index} open={link !== null} onOpen={onOpenLink} />
            ) : null}
            {id !== 'styles' && id !== 'link' ? (
              <ToolbarButton id={id} index={index} media={media} />
            ) : null}
          </Fragment>
        ))}
      </div>
      {link !== null ? <LinkForm at={link.at} onClose={onCloseLink} /> : null}
    </>
  );
}

export { Toolbar };
