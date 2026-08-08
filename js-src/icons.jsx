/**
 * @file
 * The face of each toolbar control.
 */

// Formatting controls show a letter or symbol, the way word processors do,
// and structural ones show a drawn icon. Both are decorative: the accessible
// name and the tooltip carry the wording.
//
// Every one of them is drawn in the same box. Setting the letters as live text
// instead left them sized by the browser's UI font rather than by the grid, so
// they carried a third less ink than the icons beside them and no two shared a
// centre: the superscript and the subscript sat nearly eight pixels apart.
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
 * A letterform, drawn on the icon grid rather than set as text.
 */
function Glyph({ children, ...rest }) {
  return (
    <Icon>
      <text
        x="8"
        y="11.6"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="currentColor"
        {...rest}
      >
        {children}
      </text>
    </Icon>
  );
}

/**
 * The face of each button: a glyph class plus its text, or a drawn icon.
 */
const FACES = {
  bold: <Glyph>B</Glyph>,
  italic: (
    <Glyph fontFamily="Georgia, 'Times New Roman', serif" fontStyle="italic">
      I
    </Glyph>
  ),
  // The rule under a U and through an S is drawn, because text-decoration
  // would be sized by the font rather than by the grid.
  underline: (
    <Icon>
      <text x="8" y="11" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
        U
      </text>
      <path d="M4 13.4h8" {...stroke} strokeWidth={1.3} />
    </Icon>
  ),
  strike_through: (
    <Icon>
      <text x="8" y="12" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">
        S
      </text>
      <path d="M3.5 8.2h9" {...stroke} strokeWidth={1.3} />
    </Icon>
  ),
  // Two chevrons rather than the three characters of "</>", which carried more
  // than twice the ink of any other control.
  code: (
    <Icon>
      <path d="M6 4 2 8l4 4M10 4l4 4-4 4" {...stroke} />
    </Icon>
  ),
  superscript: (
    <Icon>
      <text x="5.5" y="11.6" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">
        x
      </text>
      <text x="11" y="6.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">
        2
      </text>
    </Icon>
  ),
  subscript: (
    <Icon>
      <text x="5.5" y="11.6" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">
        x
      </text>
      <text x="11" y="14.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">
        2
      </text>
    </Icon>
  ),
  // The colour is a hint under the letter rather than a block behind it: as a
  // filled chip it was one of the two loudest things on the whole form.
  highlight: (
    <Icon>
      <rect x="2.5" y="12.6" width="11" height="2" fill="#ffe066" />
      <text x="8" y="11.2" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
        A
      </text>
    </Icon>
  ),
  // Monochrome: red reads as destructive in an admin theme, and removing
  // formatting is not.
  clear_format: (
    <Icon>
      <text x="6" y="11.6" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">
        T
      </text>
      <path d="M10.2 6.6l4 4m0-4l-4 4" {...stroke} strokeWidth={1.4} />
    </Icon>
  ),
  // Drawn a pixel higher than they were, which had left both sitting below the
  // centre every other control shares.
  undo: (
    <Icon>
      <path d="M3 7h6.5a3.5 3.5 0 1 1 0 7H6M3 7l3-3M3 7l3 3" {...stroke} />
    </Icon>
  ),
  redo: (
    <Icon>
      <path d="M13 7H6.5a3.5 3.5 0 1 0 0 7H10M13 7l-3-3M13 7l-3 3" {...stroke} />
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
