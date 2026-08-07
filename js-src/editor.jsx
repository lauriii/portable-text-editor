/**
 * @file
 * Registers Drupal.editors.portable_text, backed by @portabletext/editor.
 *
 * Build with `npm run build`; the result is committed as
 * js/portable-text-editor.js.
 */

import { StrictMode, useEffect, useReducer, useState } from 'react';
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

/**
 * Toolbar buttons, keyed by the IDs the Editor plugin stores in config.
 *
 * `selector` reports whether the button is currently applied, `event` is the
 * editor event a click sends.
 */
const BUTTONS = {
  bold: {
    label: Drupal.t('Bold'),
    selector: isActiveDecorator('strong'),
    event: { type: 'decorator.toggle', decorator: 'strong' },
  },
  italic: {
    label: Drupal.t('Italic'),
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

function ToolbarButton({ id }) {
  const editor = useEditor();
  const active = useEditorState(editor, BUTTONS[id].selector);
  const { label, event } = BUTTONS[id];

  return (
    <button
      type="button"
      className="portable-text-editor__button"
      aria-pressed={active}
      // Keep the selection in the editable while the button is used.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        editor.send(event);
        editor.send({ type: 'focus' });
      }}
    >
      {label}
    </button>
  );
}

/**
 * Toggles a link, asking for the URL in an inline field when adding one.
 *
 * ponytail: an inline field rather than window.prompt, because a native modal
 * cannot be reached by keyboard users predictably and blocks automated tests.
 */
function LinkButton() {
  const editor = useEditor();
  const active = useEditorState(editor, isActiveAnnotation('link'));
  // A string means the URL field is open; null means it is closed.
  const [href, setHref] = useState(null);

  const close = () => {
    setHref(null);
    editor.send({ type: 'focus' });
  };

  if (href !== null) {
    return (
      <span className="portable-text-editor__link-form">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          type="text"
          autoFocus
          className="portable-text-editor__link-input"
          aria-label={Drupal.t('Link URL')}
          placeholder="https://"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              close();
            }
            if (e.key !== 'Enter') {
              return;
            }
            e.preventDefault();
            if (href !== '') {
              // The editor keeps its own selection while this field has DOM
              // focus, but it ignores changes while it is blurred, so the
              // toggle waits until the focus it was given has landed.
              editor.send({ type: 'focus' });
              requestAnimationFrame(() => {
                editor.send({
                  type: 'annotation.toggle',
                  annotation: { name: 'link', value: { href } },
                });
              });
            }
            close();
          }}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className="portable-text-editor__button"
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        // Removing a link only needs the annotation name, so the URL is asked
        // for just when one is being added.
        if (active) {
          editor.send({
            type: 'annotation.toggle',
            annotation: { name: 'link', value: {} },
          });
          editor.send({ type: 'focus' });
          return;
        }
        setHref('');
      }}
    >
      {Drupal.t('Link')}
    </button>
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
    return <span className="portable-text-editor__link">{props.children}</span>;
  }
  return props.children;
}

function Editor({ toolbar, initialValue, ariaLabel, onValue }) {
  return (
    <EditorProvider initialConfig={{ schemaDefinition, initialValue }}>
      <EventListenerPlugin
        on={(event) => {
          if (event.type === 'mutation') {
            onValue(event.value);
          }
        }}
      />
      <div className="portable-text-editor__toolbar">
        {toolbar.map((id) =>
          id === 'link' ? <LinkButton key={id} /> : <ToolbarButton key={id} id={id} />,
        )}
      </div>
      <PortableTextEditable
        className="portable-text-editor__editable"
        aria-label={ariaLabel}
        renderStyle={renderStyle}
        renderDecorator={renderDecorator}
        renderAnnotation={renderAnnotation}
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

// One record per attached textarea: the React root, its container, the latest
// value, and the change callback Drupal registers after attaching.
const instances = new WeakMap();

Drupal.editors.portable_text = {
  attach(element, format) {
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
