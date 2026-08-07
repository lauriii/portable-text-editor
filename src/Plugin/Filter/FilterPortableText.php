<?php

declare(strict_types=1);

namespace Drupal\portable_text_editor\Plugin\Filter;

use Drupal\Component\Utility\Html;
use Drupal\Component\Utility\UrlHelper;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\filter\Attribute\Filter;
use Drupal\filter\FilterProcessResult;
use Drupal\filter\Plugin\FilterBase;
use Drupal\filter\Plugin\FilterInterface;

/**
 * Renders Portable Text JSON as HTML.
 *
 * Everything this filter emits is generated here from decoded JSON values, and
 * every value coming from the stored text is escaped. Nothing in the input is
 * ever treated as markup, so Portable Text content cannot inject HTML.
 */
#[Filter(
  id: 'filter_portable_text',
  title: new TranslatableMarkup('Render Portable Text'),
  description: new TranslatableMarkup('Renders stored Portable Text JSON as HTML. Text formats using this filter store JSON, not HTML, so HTML-oriented filters have nothing to act on.'),
  type: FilterInterface::TYPE_MARKUP_LANGUAGE,
  weight: 0,
)]
class FilterPortableText extends FilterBase {

  /**
   * Block styles that render as their own element, keyed by style name.
   */
  protected const STYLE_TAGS = [
    'h1' => 'h1',
    'h2' => 'h2',
    'h3' => 'h3',
    'h4' => 'h4',
    'h5' => 'h5',
    'h6' => 'h6',
    'blockquote' => 'blockquote',
    'normal' => 'p',
  ];

  /**
   * Inline decorators that render as their own element, keyed by mark name.
   */
  protected const DECORATOR_TAGS = [
    'strong' => 'strong',
    'em' => 'em',
    'underline' => 'u',
    'code' => 'code',
    'strike-through' => 'del',
    'superscript' => 'sup',
    'subscript' => 'sub',
    'highlight' => 'mark',
  ];

  /**
   * List item types, keyed by Portable Text name, valued by wrapper element.
   */
  protected const LIST_TAGS = [
    'bullet' => 'ul',
    'number' => 'ol',
  ];

  /**
   * {@inheritdoc}
   */
  public function process($text, $langcode): FilterProcessResult {
    return new FilterProcessResult($this->render((string) $text));
  }

  /**
   * Renders Portable Text JSON as HTML, failing safe on anything unexpected.
   *
   * @param string $text
   *   The stored field value.
   *
   * @return string
   *   Rendered, fully escaped HTML. Empty when the value cannot be understood
   *   as Portable Text, so that raw JSON is never shown to a visitor.
   */
  protected function render(string $text): string {
    $text = trim($text);
    if ($text === '') {
      return '';
    }

    $decoded = json_decode($text, TRUE);
    if ($decoded === NULL && json_last_error() !== JSON_ERROR_NONE) {
      // Not JSON at all. This happens when a field was authored in another
      // text format and then switched over, so keep the text rather than
      // discarding it. Escaping makes any markup in it inert.
      return '<p>' . Html::escape($text) . '</p>';
    }
    if (!is_array($decoded) || !array_is_list($decoded)) {
      // Valid JSON, but not an array of Portable Text blocks.
      return '';
    }

    $output = '';
    // The list elements currently open, outermost first. An item's "level" is
    // its depth in this stack.
    $lists = [];
    // Whether a list item is open at the current depth. A nested list is
    // rendered inside its parent item, so that item stays open meanwhile.
    $item_open = FALSE;

    foreach ($decoded as $block) {
      if (!is_array($block)) {
        continue;
      }
      if (($block['_type'] ?? NULL) === 'table') {
        $output .= $this->closeLists($lists, $item_open, 0);
        $output .= $this->renderTable($block);
        continue;
      }
      if (($block['_type'] ?? NULL) !== 'block') {
        // Other block objects, such as images and embeds, are not supported by
        // this editor, so they are skipped rather than guessed at.
        continue;
      }

      $list_item = is_string($block['listItem'] ?? NULL) ? $block['listItem'] : NULL;
      $list_tag = $list_item === NULL ? NULL : (self::LIST_TAGS[$list_item] ?? NULL);
      $children = $this->renderChildren($block);

      if ($list_tag === NULL) {
        $output .= $this->closeLists($lists, $item_open, 0);
        $style = is_string($block['style'] ?? NULL) ? $block['style'] : 'normal';
        $tag = self::STYLE_TAGS[$style] ?? 'p';
        $output .= '<' . $tag . '>' . $children . '</' . $tag . '>';
        continue;
      }

      // Only ever go one level deeper at a time, so that a value which skips a
      // level cannot produce a list nested outside a list item.
      $level = max(1, (int) ($block['level'] ?? 1));
      $level = min($level, count($lists) + 1);

      $output .= $this->closeLists($lists, $item_open, $level);
      if (count($lists) === $level) {
        if ($item_open) {
          $output .= '</li>';
          $item_open = FALSE;
        }
        if (end($lists) !== $list_tag) {
          $output .= '</' . array_pop($lists) . '>';
        }
      }
      if (count($lists) < $level) {
        $output .= '<' . $list_tag . '>';
        $lists[] = $list_tag;
      }
      $output .= '<li>' . $children;
      $item_open = TRUE;
    }
    $output .= $this->closeLists($lists, $item_open, 0);

    return $output;
  }

  /**
   * Renders a table block.
   *
   * Cells hold plain text, which is what the editor can produce, so every cell
   * is escaped and nothing in one is treated as markup.
   *
   * @param array $block
   *   A decoded table block.
   *
   * @return string
   *   The table's HTML, or an empty string when it has no usable rows.
   */
  protected function renderTable(array $block): string {
    $rows = $block['rows'] ?? NULL;
    if (!is_array($rows) || !array_is_list($rows)) {
      return '';
    }

    $header = ($block['header'] ?? FALSE) === TRUE;
    $rendered = [];
    foreach ($rows as $row) {
      if (!is_array($row) || !array_is_list($row) || $row === []) {
        continue;
      }
      // The first row is only a header row when the block says so.
      $tag = $header && $rendered === [] ? 'th' : 'td';
      $cells = '';
      foreach ($row as $cell) {
        // Cells may hold several lines, which only survive as markup. Escaping
        // first means the <br> tags are the only ones that can be there.
        $text = is_string($cell) ? nl2br(Html::escape($cell), FALSE) : '';
        $cells .= '<' . $tag . '>' . $text . '</' . $tag . '>';
      }
      $rendered[] = '<tr>' . $cells . '</tr>';
    }
    if ($rendered === []) {
      return '';
    }

    if (!$header) {
      return '<table><tbody>' . implode('', $rendered) . '</tbody></table>';
    }
    $head = array_shift($rendered);
    $body = $rendered === [] ? '' : '<tbody>' . implode('', $rendered) . '</tbody>';
    return '<table><thead>' . $head . '</thead>' . $body . '</table>';
  }

  /**
   * Closes open lists until only the wanted depth is left.
   *
   * @param array $lists
   *   The open list elements, outermost first. Modified in place.
   * @param bool $item_open
   *   Whether a list item is open at the deepest level. Modified in place.
   * @param int $depth
   *   How many lists may stay open.
   *
   * @return string
   *   The closing tags.
   */
  protected function closeLists(array &$lists, bool &$item_open, int $depth): string {
    $output = '';
    while (count($lists) > $depth) {
      if ($item_open) {
        $output .= '</li>';
      }
      $output .= '</' . array_pop($lists) . '>';
      // The item that contained the list just closed is still open.
      $item_open = TRUE;
    }
    if ($depth === 0) {
      $item_open = FALSE;
    }
    return $output;
  }

  /**
   * Renders the spans of a single Portable Text block.
   *
   * @param array $block
   *   A decoded Portable Text block.
   *
   * @return string
   *   The escaped inline HTML of the block.
   */
  protected function renderChildren(array $block): string {
    $children = $block['children'] ?? [];
    if (!is_array($children)) {
      return '';
    }

    // Mark definitions carry the data of annotations such as links. They are
    // referenced from a span's marks by their "_key".
    $mark_defs = [];
    foreach (is_array($block['markDefs'] ?? NULL) ? $block['markDefs'] : [] as $mark_def) {
      if (is_array($mark_def) && isset($mark_def['_key']) && is_string($mark_def['_key'])) {
        $mark_defs[$mark_def['_key']] = $mark_def;
      }
    }

    $output = '';
    foreach ($children as $child) {
      if (!is_array($child) || ($child['_type'] ?? NULL) !== 'span' || !is_string($child['text'] ?? NULL)) {
        continue;
      }

      $open = '';
      $close = '';
      foreach (is_array($child['marks'] ?? NULL) ? $child['marks'] : [] as $mark) {
        if (!is_string($mark)) {
          continue;
        }
        if (isset(self::DECORATOR_TAGS[$mark])) {
          $open .= '<' . self::DECORATOR_TAGS[$mark] . '>';
          $close = '</' . self::DECORATOR_TAGS[$mark] . '>' . $close;
        }
        elseif (($mark_defs[$mark]['_type'] ?? NULL) === 'link' && is_string($mark_defs[$mark]['href'] ?? NULL)) {
          // filterBadProtocol() strips javascript: and friends and escapes the
          // result, so the attribute cannot break out of its quotes.
          $open .= '<a href="' . UrlHelper::filterBadProtocol($mark_defs[$mark]['href']) . '">';
          $close = '</a>' . $close;
        }
      }

      $output .= $open . Html::escape($child['text']) . $close;
    }

    return $output;
  }

  /**
   * {@inheritdoc}
   */
  public function tips($long = FALSE) {
    return $this->t('Content is stored as Portable Text and rendered as HTML on output.');
  }

}
