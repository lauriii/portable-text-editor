/**
 * @file
 * The table block and the grid it is edited in.
 *
 * A table is a block object, so the editor treats it as one opaque thing and
 * everything inside it is owned here: what a cell holds, how the caret moves
 * between cells, how columns are sized, and the controls.
 */

import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@portabletext/editor';
import { FACES } from './icons.jsx';
import { BalloonMenu } from './balloon.jsx';

/**
 * Builds an empty grid.
 *
 * @param {number} rows
 *   How many rows.
 * @param {number} columns
 *   How many columns.
 *
 * @return {Array}
 *   Rows of empty cell strings.
 */
function emptyRows(rows, columns) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''));
}

/**
 * Moves the focus to a cell, if the table still has one there.
 *
 * @param {HTMLElement} table
 *   The table's wrapper.
 * @param {number} row
 *   The row to focus, counting from zero.
 * @param {number} column
 *   The column to focus, counting from zero.
 */
function focusCell(table, row, column) {
  const cell = table.querySelector(`[data-row="${row}"][data-column="${column}"]`);
  if (cell) {
    cell.focus();
    cell.setSelectionRange(cell.value.length, cell.value.length);
  }
}

/**
 * A table cell, which grows to fit what is written in it.
 */
function TableCell({ row, column, value, header, onChange, onFocus, onKeyDown }) {
  const field = useRef(null);

  useEffect(() => {
    // A textarea does not size itself, and a one line cell that scrolls its
    // own text is the worst part of a table editor.
    const element = field.current;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={field}
      rows={1}
      data-row={row}
      data-column={column}
      className="portable-text-editor__cell"
      aria-label={
        header
          ? Drupal.t('Column @column heading', { '@column': column + 1 })
          : Drupal.t('Row @row, column @column', { '@row': row + 1, '@column': column + 1 })
      }
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * The editing grid for a table block.
 *
 * The block is a block object, so the editor treats it as one opaque thing and
 * this owns everything inside it: what a cell holds, how the caret moves
 * between cells, and the controls, which only appear while the table is being
 * worked on. Cells hold plain text with line breaks; formatting inside a cell
 * would need an editor per cell.
 */
function TableBlock({ value, path }) {
  const editor = useEditor();
  const wrapper = useRef(null);
  // The cell last used, which is what the controls act on, and whether the
  // table has the focus at all, which is what shows them.
  const [at, setAt] = useState({ row: 0, column: 0 });
  const [active, setActive] = useState(false);

  const rows = Array.isArray(value.rows) ? value.rows : [];
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const header = value.header !== false;
  // Widths are only used when there is one per column; adding or removing a
  // column drops them rather than trying to guess what should give way.
  const widths =
    Array.isArray(value.widths) && value.widths.length === columns ? value.widths : null;

  const update = (props) => editor.send({ type: 'block.set', at: path, props });
  const setRows = (next) => update({ rows: next });

  /**
   * Drags the boundary between two columns.
   *
   * The columns are sized directly while dragging and only written to the
   * document when the pointer is let go, so that a drag is one undo step
   * rather than one per pixel.
   */
  const startResize = (event, index) => {
    event.preventDefault();
    const table = wrapper.current.querySelector('table');
    const columnElements = table.querySelectorAll('col');
    const total = table.getBoundingClientRect().width;
    const from = event.clientX;
    const starting = widths || Array.from({ length: columns }, () => 100 / columns);
    const pair = starting[index] + starting[index + 1];
    let next = starting;

    const move = (moved) => {
      const delta = ((moved.clientX - from) / total) * 100;
      // Neither column may collapse to nothing.
      const left = Math.max(6, Math.min(pair - 6, starting[index] + delta));
      next = [...starting];
      next[index] = Math.round(left * 10) / 10;
      next[index + 1] = Math.round((pair - left) * 10) / 10;
      columnElements[index].style.width = `${next[index]}%`;
      columnElements[index + 1].style.width = `${next[index + 1]}%`;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      update({ widths: next });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  const blank = (length) => Array.from({ length }, () => '');

  // Every control works from the cell that was last used, the way a word
  // processor does, rather than only appending at the far edge.
  const insertRow = (offset) => {
    const index = at.row + offset;
    setRows([...rows.slice(0, index), blank(columns), ...rows.slice(index)]);
    setTimeout(() => focusCell(wrapper.current, index, at.column), 0);
  };
  const insertColumn = (offset) => {
    const index = at.column + offset;
    update({
      rows: rows.map((row) => [...row.slice(0, index), '', ...row.slice(index)]),
      widths: null,
    });
    setTimeout(() => focusCell(wrapper.current, at.row, index), 0);
  };
  const removeRow = () => {
    setRows(rows.filter((row, index) => index !== at.row));
    setTimeout(() => focusCell(wrapper.current, Math.max(0, at.row - 1), at.column), 0);
  };
  const removeColumn = () => {
    update({
      rows: rows.map((row) => row.filter((cell, index) => index !== at.column)),
      widths: null,
    });
    setTimeout(() => focusCell(wrapper.current, at.row, Math.max(0, at.column - 1)), 0);
  };

  /**
   * Keeps the caret moving the way it does in a spreadsheet.
   */
  const onCellKeyDown = (event, row, column) => {
    const element = event.target;
    const atStart = element.selectionStart === 0 && element.selectionEnd === 0;
    const atEnd =
      element.selectionStart === element.value.length &&
      element.selectionEnd === element.value.length;

    if (event.key === 'Tab') {
      const flat = row * columns + column + (event.shiftKey ? -1 : 1);
      if (flat < 0 || flat >= rows.length * columns) {
        // At either end of the table, Tab has to be allowed to leave it. A
        // table sits in a form, and a form the keyboard cannot get out of is
        // worse than any convenience gained by trapping it.
        //
        // Tab past a last row that has something in it adds a row first, the
        // way a word processor does. The row it adds is empty, so the next
        // Tab leaves: filling a table in stays quick without the table ever
        // becoming a trap.
        const last = rows[rows.length - 1] || [];
        if (flat >= 0 && last.some((cell) => (cell || '').trim() !== '')) {
          event.preventDefault();
          setRows([...rows, blank(columns)]);
          setTimeout(() => focusCell(wrapper.current, rows.length, 0), 0);
        }
        return;
      }
      event.preventDefault();
      focusCell(wrapper.current, Math.floor(flat / columns), flat % columns);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.send({ type: 'focus' });
      return;
    }
    // Up and down leave the cell only from its first or last line, so that a
    // cell holding several lines can still be moved around in.
    if (event.key === 'ArrowUp' && !element.value.slice(0, element.selectionStart).includes('\n')) {
      event.preventDefault();
      focusCell(wrapper.current, row - 1, column);
      return;
    }
    if (event.key === 'ArrowDown' && !element.value.slice(element.selectionEnd).includes('\n')) {
      event.preventDefault();
      focusCell(wrapper.current, row + 1, column);
      return;
    }
    if (event.key === 'ArrowLeft' && atStart) {
      event.preventDefault();
      focusCell(wrapper.current, row, column - 1);
    }
    if (event.key === 'ArrowRight' && atEnd) {
      event.preventDefault();
      focusCell(wrapper.current, row, column + 1);
    }
  };

  return (
    <div
      ref={wrapper}
      className="portable-text-editor__table"
      contentEditable={false}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setActive(false);
        }
      }}
    >
      <table>
        <colgroup>
          {Array.from({ length: columns }, (ignored, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <col key={index} style={widths ? { width: `${widths[index]}%` } : undefined} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, rowIndex) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={rowIndex}>
              {Array.from({ length: columns }, (ignored, columnIndex) => {
                const isHeading = header && rowIndex === 0;
                const Wrapper = isHeading ? 'th' : 'td';
                return (
                  <Wrapper
                    // eslint-disable-next-line react/no-array-index-key
                    key={columnIndex}
                    className={
                      active && (at.row === rowIndex || at.column === columnIndex)
                        ? 'portable-text-editor__cell--in-line'
                        : undefined
                    }
                  >
                    {rowIndex === 0 && columnIndex < columns - 1 ? (
                      <span
                        className="portable-text-editor__resize"
                        role="separator"
                        aria-label={Drupal.t('Resize column @column', {
                          '@column': columnIndex + 1,
                        })}
                        onPointerDown={(down) => startResize(down, columnIndex)}
                      />
                    ) : null}
                    <TableCell
                      row={rowIndex}
                      column={columnIndex}
                      header={isHeading}
                      value={row[columnIndex] || ''}
                      onChange={(changed) =>
                        setRows(
                          rows.map((current, index) =>
                            index === rowIndex
                              ? Object.assign([], current, { [columnIndex]: changed.target.value })
                              : current,
                          ),
                        )
                      }
                      onFocus={() => {
                        // The focused cell is what the controls act on, so it
                        // is read from the focus rather than from the last key
                        // pressed, which would always be one cell behind.
                        setAt({ row: rowIndex, column: columnIndex });
                        setActive(true);
                      }}
                      onKeyDown={(event) => onCellKeyDown(event, rowIndex, columnIndex)}
                    />
                  </Wrapper>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {active ? (
        <div className="portable-text-editor__balloon" role="toolbar" aria-label={Drupal.t('Table')}>
          <BalloonMenu
            label={Drupal.t('Row')}
            icon={FACES.tableRow}
            items={[
              [Drupal.t('Insert above'), () => insertRow(0)],
              [Drupal.t('Insert below'), () => insertRow(1)],
              [
                header ? Drupal.t('Remove header row') : Drupal.t('Make first row a header'),
                () => update({ header: !header }),
              ],
              [Drupal.t('Delete row'), removeRow, rows.length < 2],
            ]}
          />
          <BalloonMenu
            label={Drupal.t('Column')}
            icon={FACES.tableColumn}
            items={[
              [Drupal.t('Insert left'), () => insertColumn(0)],
              [Drupal.t('Insert right'), () => insertColumn(1)],
              [Drupal.t('Delete column'), removeColumn, columns < 2],
            ]}
          />
          <span className="portable-text-editor__divider" />
          <button type="button" onClick={() => editor.send({ type: 'delete.block', at: path })}>
            {Drupal.t('Delete table')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { emptyRows, TableBlock };
