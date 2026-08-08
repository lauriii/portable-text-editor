/**
 * @file
 * The face of each toolbar control.
 */

// Formatting controls show a letter or symbol, the way word processors do,
// and structural ones show a drawn icon. Both are decorative: the accessible
// name and the tooltip carry the wording.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Icon({ children }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/**
 * The face of each button: a glyph class plus its text, or a drawn icon.
 */
const FACES = {
  bold: <span className="portable-text-editor__glyph--bold">B</span>,
  italic: <span className="portable-text-editor__glyph--italic">I</span>,
  underline: <span className="portable-text-editor__glyph--underline">U</span>,
  strike_through: <span className="portable-text-editor__glyph--strike">S</span>,
  code: <span className="portable-text-editor__glyph--code">&lt;/&gt;</span>,
  superscript: (
    <span>
      x<sup>2</sup>
    </span>
  ),
  subscript: (
    <span>
      x<sub>2</sub>
    </span>
  ),
  highlight: <span className="portable-text-editor__glyph--highlight">A</span>,
  clear_format: (
    <span>
      T<span className="portable-text-editor__glyph--times">×</span>
    </span>
  ),
  undo: (
    <Icon>
      <path d="M3 8h6.5a3.5 3.5 0 1 1 0 7H6M3 8l3-3M3 8l3 3" {...stroke} />
    </Icon>
  ),
  redo: (
    <Icon>
      <path d="M13 8H6.5a3.5 3.5 0 1 0 0 7H10M13 8l-3-3M13 8l-3 3" {...stroke} />
    </Icon>
  ),
  bulleted_list: (
    <Icon>
      <circle cx="2.5" cy="4" r="1.1" fill="currentColor" />
      <circle cx="2.5" cy="8" r="1.1" fill="currentColor" />
      <circle cx="2.5" cy="12" r="1.1" fill="currentColor" />
      <path d="M6 4h8.5M6 8h8.5M6 12h8.5" {...stroke} />
    </Icon>
  ),
  numbered_list: (
    <Icon>
      <path d="M6 4h8.5M6 8h8.5M6 12h8.5" {...stroke} />
      <text x="0" y="5.6" fontSize="5.5" fill="currentColor">
        1
      </text>
      <text x="0" y="9.6" fontSize="5.5" fill="currentColor">
        2
      </text>
      <text x="0" y="13.6" fontSize="5.5" fill="currentColor">
        3
      </text>
    </Icon>
  ),
  link: (
    <Icon>
      <path d="M6.6 9.4a2.9 2.9 0 0 1 0-4.1l1.7-1.7a2.9 2.9 0 1 1 4.1 4.1l-.9.9M9.4 6.6a2.9 2.9 0 0 1 0 4.1l-1.7 1.7a2.9 2.9 0 1 1-4.1-4.1l.9-.9" {...stroke} />
    </Icon>
  ),
  table: (
    <Icon>
      <path d="M2 3h12v10H2zM2 6.5h12M2 10h12M6.5 6.5V13M10 6.5V13" {...stroke} />
    </Icon>
  ),
  tableRow: (
    <Icon>
      <path d="M2 3.5h12v9H2z" {...stroke} />
      <path d="M2 6.5h12v3H2z" fill="currentColor" opacity="0.35" />
    </Icon>
  ),
  tableColumn: (
    <Icon>
      <path d="M3.5 2h9v12h-9z" {...stroke} />
      <path d="M6.5 2h3v12h-3z" fill="currentColor" opacity="0.35" />
    </Icon>
  ),
  media: (
    <Icon>
      <path d="M2 3h12v10H2z" {...stroke} />
      <circle cx="5.7" cy="6.3" r="1.1" fill="currentColor" />
      <path d="m2 11 3.5-3 3 2.5L11 8l3 3" {...stroke} />
    </Icon>
  ),
};

export { Icon, stroke, FACES };
