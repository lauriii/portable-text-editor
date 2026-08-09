/**
 * @file
 * Links, and the balloon that shows and edits them.
 *
 * The balloon appears by itself whenever the caret is in a link, so a link can
 * be seen and changed without knowing a shortcut, and it floats, so opening it
 * never moves the text being written.
 */

import { useId, useState } from 'react';
import { useEditor } from '@portabletext/editor';
import { getFocusSpan, getFocusTextBlock } from '@portabletext/editor/selectors';
import { useEditorState } from './editor-state.js';
import { useAnchor } from './anchor.js';

/**
 * The link the caret is in, if it is in one.
 *
 * @param {object} snapshot
 *   The editor snapshot.
 *
 * @return {object|null}
 *   The link's URL and the two things needed to change it: the path of its
 *   mark definition, and a range covering the text it is on.
 */
function activeLink(snapshot) {
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
    // Removing needs a selection covering the link rather than a path, and the
    // caret alone does not qualify. It has to cover every span the link is on,
    // not just the one the caret is in: a link is one mark definition but as
    // many spans as the formatting inside it splits it into, so unlinking from
    // the focused span alone left the rest of it linked.
    range: spanning(block, link._key),
  };
}

/**
 * A range covering every span a mark definition is applied to.
 *
 * @param {object} block
 *   The focused block, as the selector reports it.
 * @param {string} key
 *   The mark definition's key.
 *
 * @return {object}
 *   A range from the start of the first span carrying the mark to the end of
 *   the last one.
 */
function spanning(block, key) {
  const children = block.node.children || [];
  const carries = (child) => (child.marks || []).includes(key);
  const first = children.findIndex(carries);
  const last = children.findLastIndex(carries);
  const pathTo = (child) => [...block.path, 'children', { _key: child._key }];
  return {
    anchor: { path: pathTo(children[first]), offset: 0 },
    focus: {
      path: pathTo(children[last]),
      offset: (children[last].text || '').length,
    },
  };
}

/**
 * Shortens a URL enough to read at a glance.
 *
 * @param {string} href
 *   The URL.
 *
 * @return {string}
 *   The URL, shortened in the middle if it is long.
 */
function readable(href) {
  const shown = href.replace(/^https?:\/\//, '');
  return shown.length > 44 ? `${shown.slice(0, 30)}…${shown.slice(-10)}` : shown;
}

/**
 * Adds the scheme a bare domain is missing.
 *
 * Typing "example.com" and getting a link to it is the expectation everywhere,
 * and core's own editor sets the same default. Stored as typed, it is a
 * relative path, so it published as a link to a page under the current one.
 *
 * @param {string} href
 *   What was typed.
 *
 * @return {string}
 *   The same, with a scheme when it needed one.
 */
function withScheme(href) {
  // A path, a fragment, a query or something already carrying a scheme is
  // meant as written. Everything else is a domain someone typed short.
  if (href === '' || /^([a-z][a-z0-9+.-]*:|[/#?])/i.test(href)) {
    return href;
  }
  return `https://${href}`;
}

/**
 * The link balloon.
 *
 * @param {object|null} request
 *   Set when the toolbar or the shortcut asked to edit, carrying the range the
 *   link should go on. Null the rest of the time, when the balloon only
 *   appears because the caret is in a link.
 * @param {Function} onClose
 *   Clears that request.
 */
function LinkBalloon({ request, onClose }) {
  const editor = useEditor();
  const target = useEditorState(editor, activeLink);
  // What has been typed into the URL field, or null while nothing has been.
  const [draft, setDraft] = useState(null);
  const fieldId = useId();
  const [balloon, style] = useAnchor(editor, [target?.href, request, draft]);

  // Being asked to edit is enough to show the field: waiting for an effect to
  // set the draft would leave one render showing the other branch, which has
  // no link to show.
  const editing = request !== null || draft !== null;
  const value = draft ?? target?.href ?? '';

  const close = () => {
    setDraft(null);
    onClose();
    editor.send({ type: 'focus' });
  };

  const save = () => {
    const href = withScheme(value.trim());
    if (href === '') {
      return;
    }
    close();
    if (target) {
      // Changing a link edits its mark definition in place, so it works even
      // when nothing is selected.
      editor.send({ type: 'annotation.set', at: target.at, props: { href } });
      return;
    }
    // The editor ignores document changes while it is blurred, which it is
    // whenever the field has been used, so the focus goes back first. It does
    // not bring the selection with it, so the range the balloon was opened on
    // is passed along rather than trusted to still be there.
    editor.send({ type: 'focus' });
    editor.send({
      type: 'annotation.toggle',
      annotation: { name: 'link', value: { href } },
      ...(request?.at ? { at: request.at } : {}),
    });
  };

  const unlink = () => {
    close();
    editor.send({
      type: 'annotation.remove',
      annotation: { name: 'link' },
      at: target.range,
    });
  };

  if (!target && !request) {
    return null;
  }

  if (editing) {
    return (
      <div className="portable-text-editor__balloon" ref={balloon} style={style}>
        <label className="portable-text-editor__link-label" htmlFor={fieldId}>
          {Drupal.t('URL')}
        </label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          type="text"
          autoFocus
          id={fieldId}
          className="portable-text-editor__link-input"
          placeholder="https://"
          value={value}
          onChange={(changed) => setDraft(changed.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
          }}
        />
        <button type="button" disabled={value.trim() === ''} onClick={save}>
          {Drupal.t('Save')}
        </button>
        <button type="button" onClick={close}>
          {Drupal.t('Cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="portable-text-editor__balloon" ref={balloon} style={style}>
      <a
        className="portable-text-editor__link-shown"
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        title={target.href}
      >
        {readable(target.href)}
      </a>
      <span className="portable-text-editor__divider" />
      <button type="button" onClick={() => setDraft(target.href)}>
        {Drupal.t('Edit')}
      </button>
      <button type="button" onClick={unlink}>
        {Drupal.t('Unlink')}
      </button>
    </div>
  );
}

export { activeLink, LinkBalloon };
