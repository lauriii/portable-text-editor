/**
 * @file
 * Registers Drupal.editors.portable_text, backed by @portabletext/editor.
 *
 * Build with `npm run build`; the result is committed as
 * js/portable-text-editor.js.
 */

import { Fragment, StrictMode, useEffect, useId, useReducer, useState } from 'react';
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

// Icons are drawn rather than lettered, so that they do not need translating
// and stay legible at the size a toolbar button gives them.
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

const ICONS = {
  bold: (
    <Icon>
      <path d="M4.5 2.5h4a2.75 2.75 0 0 1 0 5.5h-4zM4.5 8h4.75a2.75 2.75 0 0 1 0 5.5H4.5z" {...stroke} />
    </Icon>
  ),
  italic: (
    <Icon>
      <path d="M10.5 2.75h-3m1 0-3 10.5m0 0h3m-3 0h-3" {...stroke} />
    </Icon>
  ),
  underline: (
    <Icon>
      <path d="M4 2.5v5a4 4 0 0 0 8 0v-5M3.5 14h9" {...stroke} />
    </Icon>
  ),
  strike_through: (
    <Icon>
      <path d="M2.5 8h11M11.5 4.2A3.5 3.5 0 0 0 8 2.5C5.8 2.5 4.5 3.6 4.5 5.1c0 1 .6 1.9 2 2.4M4.5 11.5A3.6 3.6 0 0 0 8 13.5c2.2 0 3.5-1 3.5-2.6 0-.8-.3-1.4-1-1.9" {...stroke} />
    </Icon>
  ),
  code: (
    <Icon>
      <path d="M5.75 3.75 1.5 8l4.25 4.25M10.25 3.75 14.5 8l-4.25 4.25" {...stroke} />
    </Icon>
  ),
  h2: (
    <Icon>
      <path d="M2 3v10M2 8h5M7 3v10M10.5 6.2a2 2 0 0 1 3.4 1.4c0 1.6-3.4 2.7-3.4 5.4h3.5" {...stroke} />
    </Icon>
  ),
  h3: (
    <Icon>
      <path d="M2 3v10M2 8h5M7 3v10M10.5 5.8a2 2 0 1 1 1.7 3.1 2 2 0 1 1-1.7 3.2" {...stroke} />
    </Icon>
  ),
  h4: (
    <Icon>
      <path d="M2 3v10M2 8h5M7 3v10M13.4 5.5v7.5M13.4 5.5 10.2 10.7h4" {...stroke} />
    </Icon>
  ),
  blockquote: (
    <Icon>
      <path d="M2.5 12.5V9c0-2.8 1.4-4.6 3.5-5.5M2.5 9h3v3.5h-3zM9.5 12.5V9c0-2.8 1.4-4.6 3.5-5.5M9.5 9h3v3.5h-3z" {...stroke} />
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
      <text x="0" y="5.4" fontSize="5" fill="currentColor">
        1
      </text>
      <text x="0" y="9.4" fontSize="5" fill="currentColor">
        2
      </text>
      <text x="0" y="13.4" fontSize="5" fill="currentColor">
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

/**
 * Toolbar buttons, keyed by the IDs the Editor plugin stores in config.
 *
 * `selector` reports whether the button is currently applied, `event` is the
 * editor event a click sends, `shortcut` is shown in the button's tooltip, and
 * `group` draws a divider wherever it changes.
 */
const BUTTONS = {
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
  h2: {
    label: Drupal.t('Heading 2'),
    group: 'block',
    selector: isActiveStyle('h2'),
    event: { type: 'style.toggle', style: 'h2' },
  },
  h3: {
    label: Drupal.t('Heading 3'),
    group: 'block',
    selector: isActiveStyle('h3'),
    event: { type: 'style.toggle', style: 'h3' },
  },
  h4: {
    label: Drupal.t('Heading 4'),
    group: 'block',
    selector: isActiveStyle('h4'),
    event: { type: 'style.toggle', style: 'h4' },
  },
  blockquote: {
    label: Drupal.t('Block quote'),
    group: 'block',
    selector: isActiveStyle('blockquote'),
    event: { type: 'style.toggle', style: 'blockquote' },
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
};

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
  const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
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
  const active = useEditorState(editor, BUTTONS[id].selector);
  const { label, shortcut } = BUTTONS[id];

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
        editor.send(BUTTONS[id].event);
        editor.send({ type: 'focus' });
      }}
    >
      {ICONS[id]}
    </button>
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
      {ICONS.link}
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
            {id === 'link' ? (
              <LinkButton index={index} open={linkOpen} onOpen={() => setLinkOpen(true)} />
            ) : (
              <ToolbarButton id={id} index={index} />
            )}
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
