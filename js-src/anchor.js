/**
 * @file
 * Placing a floating thing next to the caret.
 */

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
 * Positions a floating element just below a rect.
 *
 * Measured against the editor's own box rather than the viewport, so that it
 * travels with the caret when the page scrolls instead of being left behind.
 *
 * @param {object} editor
 *   The editor from useEditor().
 * @param {DOMRect|null} rect
 *   What to sit under, usually the caret.
 *
 * @return {object|undefined}
 *   A style object, or undefined when there is nothing to measure against.
 */
function anchorBelow(editor, rect) {
  const host = editor.dom.getEditorElement()?.closest('.portable-text-editor');
  const box = host?.getBoundingClientRect();
  if (!rect || !box) {
    return undefined;
  }
  return {
    top: `${rect.bottom - box.top + 4}px`,
    left: `${Math.max(0, rect.left - box.left)}px`,
  };
}

export { caretRect, anchorBelow };
