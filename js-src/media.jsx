/**
 * @file
 * Embedded media, which is Drupal's media library and Drupal's rendering.
 *
 * Nothing about how media is chosen, rendered or access-checked is decided
 * here: the library is core's dialog, the preview is core's endpoint, and the
 * output is the element core's "Embed media" filter reads.
 *
 * @see src/Plugin/Editor/PortableText.php
 * @see \Drupal\media_library\MediaLibraryEditorOpener
 */

import { useEffect, useState } from 'react';
import { useEditor } from '@portabletext/editor';
import { FACES } from './icons.jsx';
import { withScheme } from './link.jsx';

/**
 * The alignments offered, which are the ones core's filter understands.
 *
 * @see \Drupal\filter\Plugin\Filter\FilterAlign
 */
const FIELDS = {
  alt: {
    label: Drupal.t('Alt text'),
    description: Drupal.t('Alternative text for this media'),
  },
  caption: {
    label: Drupal.t('Caption'),
    description: Drupal.t('Caption shown beneath this media'),
  },
  link: {
    label: Drupal.t('Link'),
    description: Drupal.t('Address this media links to'),
  },
};

const ALIGNMENTS = [
  { name: 'left', label: Drupal.t('Align left'), face: FACES.align_left },
  { name: 'center', label: Drupal.t('Align centre'), face: FACES.align_center },
  { name: 'right', label: Drupal.t('Align right'), face: FACES.align_right },
];

/**
 * Opens Drupal's media library and reports back what was chosen.
 *
 * @param {object} media
 *   The media settings from the Editor plugin.
 * @param {Function} onSelect
 *   Called with the chosen media's UUID.
 */
// The handler waiting on the library, so there is never more than one.
//
// A dialog that is dismissed rather than used never reports anything, so a
// handler that only unbinds itself on the way out stayed bound for the rest of
// the page's life. The next selection then reached every handler that had piled
// up, and one chosen item was inserted once per abandoned dialog.
let listening = null;

function openMediaLibrary(media, onSelect) {
  if (listening) {
    jQuery(window).off('editor:dialogsave', listening);
  }

  // The library reports its choice through this event, which is how core's
  // own editors receive it too.
  const received = (event, values) => {
    jQuery(window).off('editor:dialogsave', received);
    listening = null;
    const uuid = values?.attributes?.['data-entity-uuid'];
    if (uuid) {
      onSelect(uuid);
    }
  };
  listening = received;
  jQuery(window).on('editor:dialogsave', received);

  // The media library's own dialog options, which is a grid of pictures and
  // wants the room. "ui-dialog--narrow" is what core's editors add to every
  // dialog they open, including the small ones, and on this it left the
  // library a 500 pixel column in a 1500 pixel window.
  // @see \Drupal\media_library\MediaLibraryUiBuilder::dialogOptions()
  Drupal.ajax({
    url: media.libraryUrl,
    dialog: {
      title: Drupal.t('Add or select media'),
      classes: { 'ui-dialog': 'media-library-widget-modal' },
      height: '75%',
      width: '75%',
    },
    dialogType: 'modal',
    selector: '.portable-text-editor-media-loading',
    progress: { type: 'fullscreen' },
    submit: { editor_object: {} },
  }).execute();
}

/**
 * Fetches the preview Drupal renders for one media item.
 *
 * @param {object} media
 *   The media settings from the Editor plugin.
 * @param {string} uuid
 *   The media item's UUID.
 * @param {string|undefined} alt
 *   Alternative text overriding the media item's own, if there is any.
 * @param {string|undefined} align
 *   Which way the media is aligned, if it is.
 * @param {string|undefined} caption
 *   The caption shown beneath it, if it has one.
 *
 * @return {Promise<string>}
 *   The rendered HTML.
 */
async function fetchPreview(media, uuid, alt, align, caption) {
  const quoted = (text) => text.replace(/"/g, '&quot;');
  const attributes =
    (alt ? ` alt="${quoted(alt)}"` : '') +
    (align ? ` data-align="${align}"` : '') +
    (caption ? ` data-caption="${quoted(caption)}"` : '');
  const element = `<drupal-media data-entity-type="media" data-entity-uuid="${uuid}"${attributes}></drupal-media>`;
  const response = await fetch(
    `${media.previewUrl}?${new URLSearchParams({ text: element, uuid })}`,
    { headers: { 'X-Drupal-MediaPreview-CSRF-Token': media.previewCsrfToken } },
  );
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return withoutLayoutWhitespace(await response.text());
}

/**
 * Tags where whitespace between two of them is content rather than layout.
 *
 * Images are left out on purpose: Drupal's field templates leave whitespace
 * beside them, and an image never needs a space to read correctly.
 */
const INLINE_TEXT = new Set([
  'A', 'ABBR', 'B', 'CITE', 'CODE', 'EM', 'I', 'MARK',
  'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U',
]);

/**
 * Whether a run of whitespace is holding two pieces of text apart.
 *
 * @param {Node} node
 *   A whitespace-only text node.
 *
 * @return {boolean}
 *   TRUE when taking it away would run two words together.
 */
function separatesText(node) {
  const isText = (sibling) =>
    sibling !== null && (sibling.nodeType === Node.TEXT_NODE || INLINE_TEXT.has(sibling.nodeName));
  return isText(node.previousSibling) && isText(node.nextSibling);
}

/**
 * Takes the whitespace Drupal's templates leave back out of rendered HTML.
 *
 * Each run of it becomes an empty line box in the preview, which grew a 270
 * pixel image into a 318 pixel block and left the selection ring hanging well
 * below the picture. Working on the parsed document rather than on the markup
 * reaches the runs nested inside the media's own wrappers, and catches the ones
 * made of plain spaces, both of which a pattern over the markup missed.
 *
 * @param {string} html
 *   The rendered HTML.
 *
 * @return {string}
 *   The same HTML without whitespace that only affects layout.
 */
function withoutLayoutWhitespace(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const spacing = [];
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.trim() === '' && !separatesText(walker.currentNode)) {
      spacing.push(walker.currentNode);
    }
  }
  spacing.forEach((node) => node.remove());
  return doc.body.innerHTML;
}

/**
 * An embedded media item, shown as Drupal renders it.
 *
 * The preview is the media itself rather than a card containing it, so the
 * field reads the way the page will. Its controls float, and only while it is
 * being pointed at or has the focus.
 */
function MediaBlock({ value, path, media }) {
  const editor = useEditor();
  const [preview, setPreview] = useState(null);
  const [active, setActive] = useState(false);
  // Which text property is being written, and what has been typed into it so
  // far. Null when none is. Alt text and the caption are the same interaction,
  // so they share one.
  const [writing, setWriting] = useState(null);

  const stopWriting = () => {
    setWriting(null);
    editor.send({ type: 'focus' });
  };

  const keep = () => {
    const typed = writing.text.trim();
    // A link typed short is a link, here as much as in running text, so it
    // goes through the same normalising rather than being stored as the
    // relative path it would otherwise become.
    const text = writing.field === 'link' ? withScheme(typed) : typed;
    editor.send({
      type: 'block.set',
      at: path,
      // Emptying it takes the property off rather than storing an empty string,
      // so that "Add" and "Edit" go on telling the truth.
      props: { [writing.field]: text === '' ? undefined : text },
    });
    stopWriting();
  };

  useEffect(() => {
    let current = true;
    fetchPreview(media, value.uuid, value.alt, value.align, value.caption)
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
  }, [value.uuid, value.alt, value.align, value.caption, media]);

  return (
    <div
      className={`portable-text-editor__media${active ? ' portable-text-editor__media--active' : ''}`}
      contentEditable={false}
      tabIndex={0}
      // A group rather than a bare div: ARIA does not allow a name on a
      // generic element, so screen readers were within their rights to drop
      // "Embedded media" and announce nothing at all here.
      role="group"
      aria-label={
        value.alt
          ? Drupal.t('Embedded media: @alt', { '@alt': value.alt })
          : Drupal.t('Embedded media')
      }
      onFocus={() => setActive(true)}
      onKeyDown={(event) => {
        // Only when the media itself has the focus, so that a backspace in the
        // alt text field goes on deleting a character.
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          editor.send({ type: 'delete.block', at: path });
          // The media held the focus, and it is gone, so hand it back to the
          // writing area rather than leaving it on the page.
          editor.send({ type: 'focus' });
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setActive(false);
        }
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={(event) => {
        if (writing === null && !event.currentTarget.contains(document.activeElement)) {
          setActive(false);
        }
      }}
    >
      {preview === null ? (
        // A message here would be a flash of text that then jumps out of the
        // way once the media arrives, so the space it will take is held
        // quietly instead.
        <div className="portable-text-editor__media-waiting" />
      ) : null}
      {preview?.failed ? (
        <p className="portable-text-editor__media-message">
          {Drupal.t('This media could not be shown. It may have been deleted.')}
        </p>
      ) : null}
      {preview?.html !== undefined ? (
        // Drupal rendered this, for this text format and this user, through
        // its own media pipeline. It is markup on purpose.
        //
        // The link is drawn here rather than asked of the preview endpoint,
        // which only ever renders the media itself: the anchor is this
        // filter's doing, on the way out.
        <a
          className={value.link ? 'portable-text-editor__media-link' : undefined}
          href={value.link || undefined}
          title={value.link || undefined}
          // The caret belongs in the field, not on a followed link.
          onClick={(event) => event.preventDefault()}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: preview.html }}
        />
      ) : null}
      {active && writing === null ? (
        <div className="portable-text-editor__balloon" role="toolbar" aria-label={Drupal.t('Media')}>
          <button
            type="button"
            title={value.alt || undefined}
            onClick={() => setWriting({ field: 'alt', text: value.alt || '' })}
          >
            {value.alt ? Drupal.t('Edit alt text') : Drupal.t('Add alt text')}
          </button>
          {media.caption ? (
            <button
              type="button"
              title={value.caption || undefined}
              onClick={() => setWriting({ field: 'caption', text: value.caption || '' })}
            >
              {value.caption ? Drupal.t('Edit caption') : Drupal.t('Add caption')}
            </button>
          ) : null}
          <button
            type="button"
            title={value.link || undefined}
            onClick={() => setWriting({ field: 'link', text: value.link || '' })}
          >
            {value.link ? Drupal.t('Edit link') : Drupal.t('Add link')}
          </button>
          {media.align ? <span className="portable-text-editor__divider" /> : null}
          {media.align
            ? ALIGNMENTS.map(({ name, label, face }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={(value.align || '') === name}
                  onClick={() =>
                    // Choosing the alignment it already has takes it off again,
                    // which is the only way back to however the theme lays an
                    // unaligned image out.
                    editor.send({
                      type: 'block.set',
                      at: path,
                      props: { align: value.align === name ? undefined : name },
                    })
                  }
                >
                  {face}
                </button>
              ))
            : null}
          <span className="portable-text-editor__divider" />
          <button
            type="button"
            onClick={() =>
              openMediaLibrary(media, (uuid) =>
                // The alt text described the picture that was here before, so
                // it goes with it. Keeping it would hand a screen reader a
                // confident description of something that is no longer there.
                editor.send({ type: 'block.set', at: path, props: { uuid, alt: undefined } }),
              )
            }
          >
            {Drupal.t('Replace')}
          </button>
          <button
            type="button"
            onClick={() => {
              editor.send({ type: 'delete.block', at: path });
              editor.send({ type: 'focus' });
            }}
          >
            {Drupal.t('Remove')}
          </button>
        </div>
      ) : null}
      {active && writing !== null ? (
        <div className="portable-text-editor__balloon">
          <span className="portable-text-editor__link-label">{FIELDS[writing.field].label}</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            type="text"
            autoFocus
            className="portable-text-editor__link-input"
            aria-label={FIELDS[writing.field].description}
            value={writing.text}
            onChange={(changed) => setWriting({ ...writing, text: changed.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                stopWriting();
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                keep();
              }
            }}
          />
          <button type="button" onClick={keep}>
            {Drupal.t('Save')}
          </button>
          <button type="button" onClick={stopWriting}>
            {Drupal.t('Cancel')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { openMediaLibrary, MediaBlock };
