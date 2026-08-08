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
    return (
      <span className="portable-text-editor__link" title={props.value.href}>
        {props.children}
      </span>
    );
  }
  return props.children;
}

export { buildRenderBlock, renderAnnotation };
