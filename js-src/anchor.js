/**
 * @file
 * Placing a floating thing next to the caret.
 */

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Where the caret is on screen.
 *
 * Read from the live selection rather than from the editor's snapshot, whose
 * selection reports the start of the block and would put a menu at the top of
 * the field instead of under what was just typed.
 *
 * @param {object} editor
 *   The editor from useEditor().
 *
 * @return {DOMRect|null}
 *   The caret's rect, or null when there is nowhere to anchor to.
 */
function caretRect(editor) {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (rect.top !== 0 || rect.bottom !== 0) {
      return rect;
    }
  }
  return editor.dom.getSelectionRect(editor.getSnapshot());
}

/**
 * Anchors a floating element to the caret, inside the field and out of the way.
 *
 * Placed below the caret to begin with, then measured and moved if that does
 * not work: it was going wherever the caret was, so at the right hand edge it
 * wrapped into three rows and still hung a couple of hundred pixels over the
 * side of the field into the form beside it, and low down it covered the very
 * text being edited.
 *
 * @param {object} editor
 *   The editor from useEditor().
 * @param {Array} deps
 *   What to re-measure on, on top of every render of the element.
 *
 * @return {Array}
 *   A ref to put on the element, and the style to give it.
 */
function useAnchor(editor, deps) {
  const element = useRef(null);
  const [style, setStyle] = useState(undefined);

  useLayoutEffect(() => {
    const host = editor.dom.getEditorElement()?.closest('.portable-text-editor');
    const rect = caretRect(editor);
    if (!host || !rect || !element.current) {
      return;
    }
    const box = host.getBoundingClientRect();
    const own = element.current.getBoundingClientRect();
    // Never past either edge of the field.
    const left = Math.max(0, Math.min(rect.left - box.left, box.width - own.width));
    const below = rect.bottom - box.top + 4;
    const above = rect.top - box.top - own.height - 4;
    // Above the caret when there is no room below it and there is room above,
    // rather than sitting on top of what is being written.
    const top = below + own.height > box.height && above >= 0 ? above : below;
    setStyle({ top: `${top}px`, left: `${left}px` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return [element, style];
}

export { caretRect, useAnchor };
