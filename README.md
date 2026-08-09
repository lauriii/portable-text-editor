# Portable Text editor

Integrates the [Portable Text editor](https://www.portabletext.org/editor/getting-started/)
into Drupal as a text editor, using core's `editor` module plugin system the
same way CKEditor 5 does.

## What it does

- Provides an `Editor` plugin (`portable_text`) that can be selected on any text
  format at Administration > Configuration > Content authoring > Text formats
  and editors.
- Provides a `Filter` plugin (`filter_portable_text`) that renders stored
  Portable Text JSON as HTML on output.
- Ships an optional "Portable Text" text format that pairs the two, so the
  module is usable immediately after install.

## Storage model

**The field stores Portable Text JSON verbatim, not HTML.** The editor writes a
JSON array of Portable Text blocks into the textarea, a normal form submit
stores that string, and the "Render Portable Text" filter turns it into HTML
when the field is displayed. Portable Text stays canonical and lossless: no
HTML round trip happens at any point.

The practical consequences:

- **Core's HTML filters are meaningless in a Portable Text format.** "Limit
  allowed HTML tags", "Convert line breaks into HTML", "Convert URLs into
  links", "Correct faulty and chopped off HTML" and friends all operate on HTML
  markup. The stored value is JSON, so they have nothing to act on, and
  enabling them changes nothing except the risk of corrupting the JSON. Leave
  the shipped format with only "Render Portable Text" enabled.
- **Output escaping happens in the filter, not in a text filter chain.** Every
  string that comes out of the stored JSON is passed through `Html::escape()`,
  and link hrefs additionally go through `UrlHelper::filterBadProtocol()`. The
  filter never treats stored content as markup, so Portable Text content cannot
  inject HTML.
- **The filter fails safe.** A value that is not JSON at all — which is what a
  field looks like after being authored in another text format — is rendered as
  a single escaped paragraph so the content is not lost. A value that is valid
  JSON but not an array of Portable Text blocks renders as nothing, so raw JSON
  is never shown to a visitor. Neither case raises a PHP error.
- **Switching a field's text format away from Portable Text leaves JSON in the
  field.** Core's format switcher does not convert content between formats, and
  this module does not either. The JSON will be shown as text by whatever
  filters the new format runs.

## Editing experience

The toolbar offers, in this order: undo, redo, a block style menu, bold,
italic, underline, strike-through, code, superscript, subscript, highlight,
remove formatting, bulleted list, numbered list, link and insert table. Each
control can be turned off per text format in the editor settings form, and
dividers appear between the groups.

- **The block style menu shows the style the caret is in**, and switches
  between paragraph, heading 2, heading 3, heading 4 and block quote. It keeps
  showing that style while the menu itself has the focus, rather than falling
  back to "Paragraph" the moment the writing area is blurred.
- Formatting controls show a letter or symbol the way a word processor does
  (**B**, *I*, U, S, `</>`, x², x₂, A, T×) and structural ones show a drawn
  icon, so nothing in the toolbar needs translating. The name and shortcut are
  in each control's tooltip and accessible name.
- **Remove formatting** clears the link and only the decorators actually
  applied, so it does not fill the undo history with no-ops.
- **Toolbar state is immediate.** Controls redraw on the editor's "operation"
  event, which is emitted synchronously. The obvious alternatives are traps:
  `editor.subscribe()` never fires at all, "mutation" and "patch" are held back
  until the editor is dirty and land about a second late, and listening only
  for selection changes leaves every control showing what was true before the
  change it just made.
- **Keyboard shortcuts.** Ctrl/Cmd+B, Ctrl/Cmd+I and Ctrl/Cmd+U come from the
  Portable Text editor itself, as do Tab and Shift+Tab for list indenting.
  Ctrl/Cmd+K opens the link field. Button tooltips show the shortcut using the
  modifier the visitor's platform actually uses.
- **Nested lists.** Tab indents a list item and Shift+Tab outdents it, up to
  any depth. The filter renders the nesting as real nested lists inside the
  parent list item, and a nested list may use the other list type.
- **List items ignore block styles.** A Portable Text block can carry both a
  style and a list item. The filter renders such a block as a list item and
  drops the style, and the writing area does the same, so the two agree.
- **Links.** Putting the caret in a link shows a balloon on it with the URL,
  which opens in a new tab, and Edit and Unlink. Ctrl/Cmd+K or the toolbar
  button opens the same balloon with the URL field ready, on the link the
  caret is in or on whatever is selected. Enter saves, Escape cancels. It
  floats, so nothing that is being written moves out from under the writer.
- **Keyboard navigation.** The toolbar is a single tab stop, with arrow keys,
  Home and End moving between buttons, so Tab reaches the writing area without
  passing through every button.
- **The toolbar follows a long field**, sticking below Drupal's own toolbar
  rather than scrolling out of reach.
- **Media.** The media button opens Drupal's own media library, so what it
  offers, and to whom, is Drupal's decision rather than this module's. A
  chosen item is stored as a media block holding its UUID, and the writing
  area shows it as Drupal renders it, through core's media preview endpoint.
  Its controls carry alternative text, which overrides what the media item
  itself carries and is what core's filter does with an `alt` attribute; the
  preview redraws with it, so the writer sees what a screen reader will get.
  On output the filter emits the `<drupal-media>` element that core's "Embed
  media" filter reads, so media is rendered with its own access checking, view
  modes and cache metadata. That filter has to be enabled on the format: it is
  also what gates access to the library for text editors, so without it the
  button hides itself and the editor settings form says why.
- **The "/" menu.** Typing a slash on an empty block opens an insert menu:
  paragraph, the headings, block quote, either list, a table and media. Typing
  filters it, up and down move, Enter or Tab inserts, and Escape leaves the
  slash as ordinary text. What it offers comes from the editor's schema at the
  caret, so it cannot offer something the editor would refuse and it stays
  honest when a text format has controls turned off.
- **Markdown shortcuts.** Typing `## `, `### `, `#### `, `> `, `- `, `* ` or
  `1. ` at the start of a block turns it into that heading, quote or list. It
  is an editor behavior rather than a key handler, because a key handler reads
  a block that does not hold the marker yet when someone types quickly.
- **Tables.** A table is a Portable Text block object holding rows of text,
  edited as a grid:
  - Columns can be resized by dragging the boundary between two of them. The
    drag sizes the columns directly and is written to the document once, on
    release, so it is one undo step rather than one per pixel. Widths are
    rendered as a `colgroup`, and are dropped when a column is added or
    removed rather than guessing which column should give way.
  - Cells grow as they are written in and hold several lines. A line break is
    rendered as `<br>`, after the text has been escaped.
  - Tab and Shift+Tab move between cells. Tab past a last row that has
    something in it adds a row, the way a word processor does; the row it adds
    is empty, so the next Tab leaves the table. A table sits in a form, and a
    form the keyboard cannot get out of is worse than the convenience of
    trapping it. Escape leaves immediately. Up and down move between rows, but
    only from a cell's first or last line, so a cell holding several lines can
    still be moved around in. Left and right move between cells from the ends
    of the text.
  - Controls float below the table and only while it has the focus, so they
    neither clutter the field nor shift the page. They insert a row above or
    below and a column left or right of the cell in use, delete that row or
    column, turn the header row on or off, or delete the table, and they name
    the cell they will act on. The row and column in use are tinted.
  - Cells hold plain text: formatting inside one would need an editor per
    cell.
- **Pasting.** Pasted HTML is converted to Portable Text and is limited to what
  the schema allows: headings, block quotes, lists, links and the eight inline
  decorators survive, and anything else, such as an `h1`, a table or an image,
  is flattened to plain paragraphs. Nothing the toolbar cannot produce can get
  into the stored value this way.
- **Empty state.** An empty editor shows the textarea's own placeholder, or
  "Start writing…" when it has none.
- **What is typed is what is stored.** Core asks the editor to serialize on
  submit through a handler that closed over whichever text format was active
  when the page loaded, so after switching format it asks the other editor and
  never this one. The textarea is therefore also synced from a submit listener
  of its own; without it, writing in a freshly switched field and saving
  straight away stored nothing.
- **No flash of raw JSON.** Until the editor attaches, the textarea would show
  the stored Portable Text JSON, so the stylesheet hides it while keeping its
  space. If the editor never arrives, for instance because its JavaScript
  failed to load, the textarea is handed back after three seconds rather than
  leaving an invisible field behind.

Not included: formatting inside table cells, which needs an editor per cell;
merging cells and selecting across them; code blocks (`pre`), which need
whitespace preservation that a Portable Text text block does not offer; and
pasted HTML tables, which are still flattened to paragraphs because the
deserializer does not know about this module's table block.

## Requirements

Drupal 11 or 12, with the core `editor` and `filter` modules.

## Code layout

The JavaScript is split by concern rather than kept in one file, because one
file is where a careless edit silently deletes a component in a part of it
nobody was looking at.

| File | What lives there |
| --- | --- |
| `js-src/editor.jsx` | The Drupal side: core's editor.js contract, and mounting React |
| `js-src/schema.jsx` | What the editor may hold, and the element each part is drawn with |
| `js-src/toolbar.jsx` | The toolbar's controls, the block style menu and the link field |
| `js-src/table.jsx` | The table block and its grid |
| `js-src/media.jsx` | The media library and the preview |
| `js-src/balloon.jsx` | The floating toolbar the table and media share |
| `js-src/render.jsx` | Which component draws which block |
| `js-src/link.jsx` | Links, and the balloon that shows and edits them |
| `js-src/slash.jsx` | The "/" insert menu |
| `js-src/anchor.js` | Placing a floating thing next to the caret |
| `js-src/markdown.js` | The markdown markers, as an editor behavior |
| `js-src/value.js` | Moving between the textarea's string and the editor's value |
| `js-src/editor-state.js` | Reading editor state from a React component |
| `js-src/icons.jsx` | The face of each control |

`schema.jsx` and `src/Plugin/Filter/FilterPortableText.php` make the same
choices about what each block and mark becomes, so they change together.

The list of toolbar buttons is written down once, in
`PortableText::toolbarButtonIds()`. The config schema validates against it
through a `Choice` callback rather than repeating it, and both the plugin and
the JavaScript drop any ID they do not recognise, so a stale setting degrades
instead of breaking.

Nothing here uses `requestAnimationFrame`: it never fires while a tab is in
the background, which turns a missed frame into content that silently fails
to save.

## Building the JavaScript

The editor is a React library, so the shipped asset
`js/portable-text-editor.js` is a bundle built from `js-src/editor.jsx`. It is
committed to the repository; Drupal serves it as a static file and there is no
build step at runtime.

To rebuild after changing `js-src/editor.jsx`:

```
npm install
npm run build
```

The library's `version` in `portable_text_editor.libraries.yml` is the
bundle's own, not core's, because the URL a browser caches is built from it.
Bump it whenever the bundle is rebuilt, or browsers keep serving the bundle
they already have. (With CSS and JS aggregation on, the aggregate URL already
changes with the contents; this matters for sites that have it off.)

The bundle is about 850 KB minified (about 260 KB gzipped). Most of that is
`@portabletext/editor` itself, which ships as a single module and cannot be
tree-shaken further, plus React and React DOM.

## Tests

- `tests/src/Kernel/FilterPortableTextTest.php` covers the filter, including
  invalid input and escaping.
- `tests/src/Kernel/PortableTextEditorSettingsTest.php` covers what the Editor
  plugin hands to its JavaScript, including hiding the media button when the
  format cannot embed media.
- `tests/src/FunctionalJavascript/PortableTextEditorTest.php` covers attaching,
  editing, saving and reopening a node.

Run them with the usual core test runner from the site's docroot:

```
../vendor/bin/phpunit -c core/phpunit.xml.dist \
  modules/custom/portable_text_editor/tests/src/Kernel
```

The functional JavaScript test needs a WebDriver endpoint, for example
chromedriver on port 4444:

```
SIMPLETEST_BASE_URL=http://localhost \
MINK_DRIVER_ARGS_WEBDRIVER='["chrome",{"goog:chromeOptions":{"args":["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]}},"http://localhost:4444"]' \
  ../vendor/bin/phpunit -c core/phpunit.xml.dist \
  modules/custom/portable_text_editor/tests/src/FunctionalJavascript
```

Both environment variables are load-bearing in a container. Without the
arguments, Chrome exits as soon as it starts and the failure is reported as
"Chrome instance exited". Without a base URL the browser can reach under that
exact name, logging in fails with "invalid cookie domain", because a cookie
can only be set for the domain the browser is already on.

### Alignment and captions

Alignment is core's "Align images" filter (`filter_align`) doing the work. The
editor stores `align` on the media block, the filter here emits it as
`data-align`, and core turns that into an `align-left`, `align-center` or
`align-right` class and takes the attribute away. The media filter, which runs
later, carries that class onto what it renders.

Captions work the same way, through core's "Caption images" filter
(`filter_caption`): the block carries `caption`, this filter emits it as
`data-caption`, and core sanitises it down to a few inline tags and wraps the
media in a `figure` with a `figcaption`.

So each control only appears when its filter is enabled on the text format, in
the same way the media button only appears when "Embed media" is. Filter order
matters and follows from the weights: this filter produces the element,
`filter_align` and `filter_caption` read it, and `media_embed` renders it last.

One trap worth knowing when adding another such attribute: the media preview
endpoint runs the same text format, so the bare `<drupal-media>` element it
sends arrives back through this filter, which rebuilds it rather than passing
it along. An attribute the rebuild does not know about is silently lost in the
writing area while working perfectly on the rendered page.

Coding standards:

```
vendor/bin/phpcs --standard=Drupal,DrupalPractice \
  --extensions=php,module,inc,install,yml --ignore=node_modules,js \
  web/modules/custom/portable_text_editor
```
