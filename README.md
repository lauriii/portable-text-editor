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

The toolbar offers, in this order: bold, italic, underline, strike-through,
code, heading 2, heading 3, heading 4, block quote, bulleted list, numbered
list and link. Each button can be turned off per text format in the editor
settings form, and dividers appear between the groups.

Buttons carry icons rather than words, so nothing in the toolbar needs
translating; the name and shortcut are in each button's tooltip and accessible
name.

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
- **Links.** With the caret inside a link the button reads "Edit link" and the
  field opens with the current URL, offering Update and Remove. Otherwise it
  adds a link to the selection. Enter applies, Escape cancels. The field is a
  row of its own so opening it does not move the toolbar.
- **Keyboard navigation.** The toolbar is a single tab stop, with arrow keys,
  Home and End moving between buttons, so Tab reaches the writing area without
  passing through every button.
- **Pasting.** Pasted HTML is converted to Portable Text and is limited to what
  the schema allows: headings, block quotes, lists, links and the five inline
  decorators survive, and anything else, such as an `h1`, a table or an image,
  is flattened to plain paragraphs. Nothing the toolbar cannot produce can get
  into the stored value this way.

Not included: markdown-style input rules such as typing `## ` for a heading,
undo and redo buttons (Ctrl/Cmd+Z works from the keyboard), images and other
block objects, and tables.
- **Empty state.** An empty editor shows the textarea's own placeholder, or
  "Start writing…" when it has none.
- **No flash of raw JSON.** Until the editor attaches, the textarea would show
  the stored Portable Text JSON, so the stylesheet hides it while keeping its
  space. If the editor never arrives, for instance because its JavaScript
  failed to load, the textarea is handed back after three seconds rather than
  leaving an invisible field behind.

## Requirements

Drupal 11 or 12, with the core `editor` and `filter` modules.

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

The bundle is about 850 KB minified (about 260 KB gzipped). Most of that is
`@portabletext/editor` itself, which ships as a single module and cannot be
tree-shaken further, plus React and React DOM.

## Tests

- `tests/src/Kernel/FilterPortableTextTest.php` covers the filter, including
  invalid input and escaping.
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
MINK_DRIVER_ARGS_WEBDRIVER='["chrome",{"browserName":"chrome","goog:chromeOptions":{"args":["--headless=new","--no-sandbox"]}},"http://localhost:4444"]' \
  ../vendor/bin/phpunit -c core/phpunit.xml.dist \
  modules/custom/portable_text_editor/tests/src/FunctionalJavascript
```

Coding standards:

```
vendor/bin/phpcs --standard=Drupal,DrupalPractice \
  --extensions=php,module,inc,install,yml --ignore=node_modules,js \
  web/modules/custom/portable_text_editor
```
