/**
 * @file
 * Reading from, and writing to, the editor from outside its own components.
 */

import { useEffect, useReducer } from 'react';

/**
 * Reads an editor selector, re-rendering whenever its answer can change.
 *
 * Both events are needed and neither is enough. "selection" alone leaves a
 * control showing what was true before the change it just made, because the
 * next render only comes with the next caret move. "operation" alone misses
 * state that depends on where the caret is, such as "is it inside bold text".
 *
 * It has to be "operation" rather than "mutation" or "patch": those are held
 * back until the editor is dirty and arrive about a second late, which is long
 * enough to watch the toolbar catch up. `editor.subscribe()` never fires at
 * all.
 *
 * @param {object} editor
 *   The editor from useEditor().
 * @param {Function} selector
 *   A selector from @portabletext/editor/selectors.
 *
 * @return {*}
 *   The selector's current answer.
 */
function useEditorState(editor, selector) {
  const [, rerender] = useReducer((count) => count + 1, 0);
  useEffect(() => {
    const subscriptions = ['selection', 'operation'].map((event) => editor.on(event, rerender));
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  }, [editor]);
  return selector(editor.getSnapshot());
}

export { useEditorState };
