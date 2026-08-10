/**
 * @file
 * Moving between the textarea's string and the editor's value.
 */

import { keyGenerator } from '@portabletext/editor';

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
  // "empty" means no span has text. Revisit if block objects such as
  // images are ever added to the schema, since those carry no text.
  const hasContent = value.some((block) =>
    Array.isArray(block.children)
      ? block.children.some((child) => typeof child.text === 'string' && child.text.trim() !== '')
      : // Anything that is not a text block, such as a table, is content in
        // its own right even when every cell is still empty.
        block._type !== 'block',
  );
  return hasContent ? JSON.stringify(value) : '';
}

export { parseValue, serializeValue };
