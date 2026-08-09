/**
 * @file
 * How each block is drawn in the writing area.
 */

import { MediaBlock } from './media.jsx';
import { TableBlock } from './table.jsx';

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
    // A real anchor, so that a screen reader can find the links in the text
    // being written. As a span they were only a colour and an underline, which
    // is to say invisible to anyone not looking at them.
    return (
      <a
        className="portable-text-editor__link"
        href={props.value.href}
        title={props.value.href}
        // The caret belongs here, not the browser's follow-the-link handling.
        onClick={(event) => event.preventDefault()}
      >
        {props.children}
      </a>
    );
  }
  return props.children;
}

export { buildRenderBlock, renderAnnotation };
