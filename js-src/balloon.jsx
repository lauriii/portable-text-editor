/**
 * @file
 * The floating toolbar shared by the table and by embedded media.
 */

import { useState } from 'react';

/**
 * A labelled menu in a floating toolbar.
 *
 * Eight flat buttons was more toolbar than table; grouping the row and column
 * work into two menus keeps the balloon to the width of the words on it.
 */
function BalloonMenu({ label, icon, items }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="portable-text-editor__menu">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {icon}
        {label}
        <span className="portable-text-editor__caret" aria-hidden="true" />
      </button>
      {open ? (
        <ul className="portable-text-editor__menu-list">
          {items.map(([text, run, disabled]) => (
            <li key={text}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  run();
                }}
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}

export { BalloonMenu };
