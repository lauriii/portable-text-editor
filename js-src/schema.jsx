/**
 * @file
 * What the editor may hold, and how each part of it is drawn.
 *
 * The filter makes the same choices when rendering for a visitor, so the two
 * have to be changed together.
 *
 * @see src/Plugin/Filter/FilterPortableText.php
 */

import { defineSchema } from '@portabletext/editor';

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
  blockObjects: [
    {
      name: 'media',
      fields: [
        { name: 'uuid', type: 'string' },
        { name: 'viewMode', type: 'string' },
        { name: 'align', type: 'string' },
        { name: 'caption', type: 'string' },
        { name: 'alt', type: 'string' },
      ],
    },
    {
      name: 'table',
      fields: [
        { name: 'rows', type: 'array' },
        { name: 'header', type: 'boolean' },
        { name: 'widths', type: 'array' },
      ],
    },
  ],
});

// A new table starts small; the controls grow it from there.
const NEW_TABLE_ROWS = 2;
const NEW_TABLE_COLUMNS = 2;

// The element each block style and inline decorator is drawn with while
// editing. The filter makes the same choices when rendering for a visitor.
// A paragraph is drawn as one for the same reason as the rest, and for a
// plainer one: without it a paragraph was a bare div, which has no margins of
// its own, so paragraphs sat flush against each other while headings took
// their spacing from being real headings.
const STYLE_TAGS = { normal: 'p', h2: 'h2', h3: 'h3', h4: 'h4', blockquote: 'blockquote' };
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

export {
  schemaDefinition,
  NEW_TABLE_ROWS,
  NEW_TABLE_COLUMNS,
  STYLE_TAGS,
  DECORATOR_TAGS,
  renderStyle,
  renderDecorator,
};
