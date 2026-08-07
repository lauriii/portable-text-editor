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
import { EventListenerPlugin } from '@portabletext/editor/plugins';
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
});

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
 * Reads an editor selector, re-rendering whenever its answer can change.
 *
 * `editor.subscribe()` only reports document changes, so the selection event
 * is needed as well for state such as "is the caret inside bold text".
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
    const value = editor.subscribe(rerender);
    const selection = editor.on('selection', rerender);
    return () => {
      value.unsubscribe();
      selection.unsubscribe();
    };
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

function ToolbarButton({ id, index }) {
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
        if (event) {
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
        sendWhenFocused(editor, { type: 'style.add', style: changed.target.value });
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

function Editor({ toolbar, initialValue, ariaLabel, placeholder, rows, onValue }) {
  const [linkOpen, setLinkOpen] = useState(false);
  // Config can outlive a button, so anything unknown here is dropped.
  const buttons = toolbar.filter((id) => BUTTONS[id]);
  const hasLink = buttons.includes('link');

  return (
    <EditorProvider initialConfig={{ schemaDefinition, initialValue }}>
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
            {id !== 'styles' && id !== 'link' ? <ToolbarButton id={id} index={index} /> : null}
          </Fragment>
        ))}
      </div>
      {linkOpen ? <LinkForm onClose={() => setLinkOpen(false)} /> : null}
      <PortableTextEditable
        className="portable-text-editor__editable"
        style={{ minHeight: `${Math.max(rows, 3) * 1.7}em` }}
        aria-label={ariaLabel}
        renderStyle={renderStyle}
        renderDecorator={renderDecorator}
        renderAnnotation={renderAnnotation}
        renderPlaceholder={() => (
          <span className="portable-text-editor__placeholder">{placeholder}</span>
        )}
        onKeyDown={(event) => {
          if (hasLink && event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            setLinkOpen(true);
          }
        }}
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
  const hasText = value.some(
    (block) =>
      Array.isArray(block.children) &&
      block.children.some((child) => typeof child.text === 'string' && child.text.trim() !== ''),
  );
  return hasText ? JSON.stringify(value) : '';
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

    const label = document.querySelector(`label[for="${element.id}"]`);
    record.root = createRoot(container);
    record.root.render(
      <StrictMode>
        <Editor
          toolbar={format.editorSettings.toolbar}
          initialValue={parseValue(element.value)}
          ariaLabel={label ? label.textContent.trim() : Drupal.t('Rich text editor')}
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
    // On "serialize" the editor stays alive and only the textarea is synced,
    // which onValue already does on every change.
    if (trigger === 'serialize') {
      return;
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
