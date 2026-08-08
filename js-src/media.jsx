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

/**
 * Opens Drupal's media library and reports back what was chosen.
 *
 * @param {object} media
 *   The media settings from the Editor plugin.
 * @param {Function} onSelect
 *   Called with the chosen media's UUID.
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
 * Fetches the preview Drupal renders for one media item.
 *
 * @param {object} media
 *   The media settings from the Editor plugin.
 * @param {string} uuid
 *   The media item's UUID.
 *
 * @return {Promise<string>}
 *   The rendered HTML.
 */
async function fetchPreview(media, uuid) {
  const element = `<drupal-media data-entity-type="media" data-entity-uuid="${uuid}"></drupal-media>`;
  const response = await fetch(
    `${media.previewUrl}?${new URLSearchParams({ text: element, uuid })}`,
    { headers: { 'X-Drupal-MediaPreview-CSRF-Token': media.previewCsrfToken } },
  );
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  // Drupal's render pipeline indents its output, and every one of those
  // newlines becomes an empty line in the preview, which grew a 270 pixel
  // image into a 664 pixel block. Only runs holding a newline are dropped, so
  // a deliberate space between two inline elements is left alone.
  return (await response.text()).replace(/>[\n\r]\s*</g, '><');
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

  useEffect(() => {
    let current = true;
    fetchPreview(media, value.uuid)
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
  }, [value.uuid, media]);

  return (
    <div
      className={`portable-text-editor__media${active ? ' portable-text-editor__media--active' : ''}`}
      contentEditable={false}
      tabIndex={0}
      aria-label={Drupal.t('Embedded media')}
      onFocus={() => setActive(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setActive(false);
        }
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) {
          setActive(false);
        }
      }}
    >
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
      {active ? (
        <div className="portable-text-editor__balloon" role="toolbar" aria-label={Drupal.t('Media')}>
          <button
            type="button"
            onClick={() =>
              openMediaLibrary(media, (uuid) =>
                editor.send({ type: 'block.set', at: path, props: { uuid } }),
              )
            }
          >
            {Drupal.t('Replace')}
          </button>
          <button type="button" onClick={() => editor.send({ type: 'delete.block', at: path })}>
            {Drupal.t('Remove')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { openMediaLibrary, MediaBlock };
