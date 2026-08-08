/**
 * @file
 * Registers Drupal.editors.portable_text, backed by @portabletext/editor.
 *
 * This file is the Drupal side: it implements the contract in core's
 * editor.js and mounts the React editor. Everything about how the editor
 * itself looks and behaves lives in the modules it imports.
 *
 * Build with `npm run build`; the result is committed as
 * js/portable-text-editor.js.
 *
 * @see core/modules/editor/js/editor.js
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProvider, PortableTextEditable, useEditor } from '@portabletext/editor';
import { BehaviorPlugin, EventListenerPlugin } from '@portabletext/editor/plugins';
import { schemaDefinition, renderStyle, renderDecorator } from './schema.jsx';
import { markdownBehavior } from './markdown.js';
import { Toolbar } from './toolbar.jsx';
import { buildRenderBlock, renderAnnotation } from './render.jsx';
import { LinkBalloon } from './link.jsx';
import { SlashMenu } from './slash.jsx';
import { parseValue, serializeValue } from './value.js';

// Stable, so the plugin does not unregister and register on every render.
const BEHAVIORS = [markdownBehavior];

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

/**
 * The writing area itself, inside the provider so that it can reach the
 * editor, which the link shortcut needs.
 */
function Editable({ media, ariaLabel, placeholder, rows, hasLink, onOpenLink }) {
  const editor = useEditor();

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
          onOpenLink(editor.getSnapshot().context.selection);
        }
      }}
    />
  );
}

function Editor({ toolbar, media, initialValue, ariaLabel, placeholder, rows, onReady, onValue }) {
  // Null unless the toolbar or the shortcut asked to edit a link, in which
  // case it carries the range the link should go on.
  const [link, setLink] = useState(null);

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
      <Toolbar
        items={toolbar}
        media={media}
        linkOpen={link !== null}
        onOpenLink={(at) => setLink({ at })}
      />
      {toolbar.includes('link') ? (
        <LinkBalloon request={link} onClose={() => setLink(null)} />
      ) : null}
      <SlashMenu media={media} />
      <Editable
        media={media}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        rows={rows}
        hasLink={toolbar.includes('link')}
        onOpenLink={(at) => setLink({ at })}
      />
    </EditorProvider>
  );
}

// One record per attached textarea: the React root, its container, the editor
// once React has it, and the change callback Drupal registers after attaching.
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
          placeholder={element.placeholder || Drupal.t('Start writing…')}
          rows={Number(element.rows) || 5}
          onReady={(editor) => {
            record.editor = editor;
          }}
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
