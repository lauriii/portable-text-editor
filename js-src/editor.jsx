/**
 * @file
 * Registers Drupal.editors.portable_text, backed by @portabletext/editor.
 *
 * Build with `npm run build`; the result is committed as
 * js/portable-text-editor.js.
 */

import { StrictMode, useEffect, useId, useReducer, useState } from 'react';
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
  decorators: [{ name: 'strong' }, { name: 'em' }],
  styles: [{ name: 'normal' }, { name: 'h2' }, { name: 'h3' }],
  lists: [{ name: 'bullet' }, { name: 'number' }],
  annotations: [{ name: 'link', fields: [{ name: 'href', type: 'string' }] }],
});

// How this platform writes the modifier the editor's built-in shortcuts use.
// The match is case insensitive because userAgentData reports "macOS" while
// the older navigator.platform reports "MacIntel".
const MOD = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '')
  ? '⌘'
  : 'Ctrl+';

/**
 * Toolbar buttons, keyed by the IDs the Editor plugin stores in config.
 *
 * `selector` reports whether the button is currently applied, `event` is the
 * editor event a click sends, and `shortcut` is shown in the button's tooltip.
 */
const BUTTONS = {
  bold: {
    label: Drupal.t('Bold'),
    shortcut: `${MOD}B`,
    selector: isActiveDecorator('strong'),
    event: { type: 'decorator.toggle', decorator: 'strong' },
  },
  italic: {
    label: Drupal.t('Italic'),
    shortcut: `${MOD}I`,
    selector: isActiveDecorator('em'),
    event: { type: 'decorator.toggle', decorator: 'em' },
  },
  h2: {
    label: Drupal.t('Heading 2'),
    selector: isActiveStyle('h2'),
    event: { type: 'style.toggle', style: 'h2' },
  },
  h3: {
    label: Drupal.t('Heading 3'),
    selector: isActiveStyle('h3'),
    event: { type: 'style.toggle', style: 'h3' },
  },
  bulleted_list: {
    label: Drupal.t('Bulleted list'),
    selector: isActiveListItem('bullet'),
    event: { type: 'list item.toggle', listItem: 'bullet' },
  },
  numbered_list: {
    label: Drupal.t('Numbered list'),
    selector: isActiveListItem('number'),
    event: { type: 'list item.toggle', listItem: 'number' },
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
      tabIndex={index === 0 ? 0 : -1}
      title={shortcut ? `${label} (${shortcut})` : label}
      // Keep the selection in the editable while the button is used.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        editor.send(BUTTONS[id].event);
        editor.send({ type: 'focus' });
      }}
    >
      {label}
    </button>
  );
}

function LinkButton({ index, open, onOpen }) {
  const editor = useEditor();
  const active = useEditorState(editor, isActiveAnnotation('link'));

  return (
    <button
      type="button"
      className="portable-text-editor__button"
      aria-pressed={active || open}
      aria-expanded={open}
      tabIndex={index === 0 ? 0 : -1}
      title={`${active ? Drupal.t('Edit link') : Drupal.t('Link')} (${MOD}K)`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
    >
      {active ? Drupal.t('Edit link') : Drupal.t('Link')}
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

function renderStyle(props) {
  if (props.schemaType.value === 'h2') return <h2>{props.children}</h2>;
  if (props.schemaType.value === 'h3') return <h3>{props.children}</h3>;
  return props.children;
}

function renderDecorator(props) {
  if (props.value === 'strong') return <strong>{props.children}</strong>;
  if (props.value === 'em') return <em>{props.children}</em>;
  return props.children;
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
  const hasLink = toolbar.includes('link');

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
        {toolbar.map((id, index) =>
          id === 'link' ? (
            <LinkButton
              key={id}
              index={index}
              open={linkOpen}
              onOpen={() => setLinkOpen(true)}
            />
          ) : (
            <ToolbarButton key={id} id={id} index={index} />
          ),
        )}
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
