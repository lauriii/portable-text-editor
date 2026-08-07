<?php

declare(strict_types=1);

namespace Drupal\Tests\portable_text_editor\Kernel;

use Drupal\KernelTests\KernelTestBase;
use Drupal\filter\FilterPluginManager;
use Drupal\filter\Plugin\FilterInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;

/**
 * Tests the Portable Text rendering filter.
 */
#[Group('portable_text_editor')]
#[RunTestsInSeparateProcesses]
class FilterPortableTextTest extends KernelTestBase {

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['filter', 'portable_text_editor'];

  /**
   * The filter under test.
   */
  protected FilterInterface $filter;

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    $manager = $this->container->get('plugin.manager.filter');
    assert($manager instanceof FilterPluginManager);
    $this->filter = $manager->createInstance('filter_portable_text');
  }

  /**
   * Renders a value through the filter.
   */
  protected function process(string $text): string {
    return (string) $this->filter->process($text, 'en');
  }

  /**
   * Builds a Portable Text block.
   */
  protected static function block(array $children, array $extra = []): array {
    return $extra + [
      '_type' => 'block',
      '_key' => 'k' . count($children),
      'style' => 'normal',
      'markDefs' => [],
      'children' => $children,
    ];
  }

  /**
   * Builds a Portable Text span.
   */
  protected static function span(string $text, array $marks = []): array {
    return [
      '_type' => 'span',
      '_key' => 's' . strlen($text),
      'text' => $text,
      'marks' => $marks,
    ];
  }

  /**
   * Tests rendering of the block styles, decorators, lists and links.
   */
  #[DataProvider('providerRender')]
  public function testRender(array $value, string $expected): void {
    $this->assertSame($expected, $this->process(json_encode($value)));
  }

  /**
   * Data provider for ::testRender().
   */
  public static function providerRender(): array {
    return [
      'paragraph' => [
        [self::block([self::span('Hello')])],
        '<p>Hello</p>',
      ],
      'headings' => [
        [
          self::block([self::span('Two')], ['style' => 'h2']),
          self::block([self::span('Three')], ['style' => 'h3']),
        ],
        '<h2>Two</h2><h3>Three</h3>',
      ],
      'unknown style falls back to a paragraph' => [
        [self::block([self::span('Odd')], ['style' => 'marquee'])],
        '<p>Odd</p>',
      ],
      'decorators' => [
        [
          self::block([
            self::span('plain '),
            self::span('bold', ['strong']),
            self::span('both', ['strong', 'em']),
          ]),
        ],
        '<p>plain <strong>bold</strong><strong><em>both</em></strong></p>',
      ],
      'unknown decorator is ignored' => [
        [self::block([self::span('Text', ['rainbow'])])],
        '<p>Text</p>',
      ],
      'bulleted list groups consecutive items' => [
        [
          self::block([self::span('One')], ['listItem' => 'bullet']),
          self::block([self::span('Two')], ['listItem' => 'bullet']),
          self::block([self::span('After')]),
        ],
        '<ul><li>One</li><li>Two</li></ul><p>After</p>',
      ],
      'switching list type closes the previous list' => [
        [
          self::block([self::span('Bullet')], ['listItem' => 'bullet']),
          self::block([self::span('Number')], ['listItem' => 'number']),
        ],
        '<ul><li>Bullet</li></ul><ol><li>Number</li></ol>',
      ],
      'a nested list is rendered inside its parent item' => [
        [
          self::block([self::span('One')], ['listItem' => 'bullet', 'level' => 1]),
          self::block([self::span('Deep')], ['listItem' => 'bullet', 'level' => 2]),
          self::block([self::span('Two')], ['listItem' => 'bullet', 'level' => 1]),
        ],
        '<ul><li>One<ul><li>Deep</li></ul></li><li>Two</li></ul>',
      ],
      'a nested list may use another list type' => [
        [
          self::block([self::span('One')], ['listItem' => 'bullet', 'level' => 1]),
          self::block([self::span('Step')], ['listItem' => 'number', 'level' => 2]),
        ],
        '<ul><li>One<ol><li>Step</li></ol></li></ul>',
      ],
      'three levels nest and unwind' => [
        [
          self::block([self::span('a')], ['listItem' => 'bullet', 'level' => 1]),
          self::block([self::span('b')], ['listItem' => 'bullet', 'level' => 2]),
          self::block([self::span('c')], ['listItem' => 'bullet', 'level' => 3]),
          self::block([self::span('d')], ['listItem' => 'bullet', 'level' => 1]),
        ],
        '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>',
      ],
      'a skipped level only goes one level deeper' => [
        [
          self::block([self::span('One')], ['listItem' => 'bullet', 'level' => 1]),
          self::block([self::span('Deep')], ['listItem' => 'bullet', 'level' => 9]),
        ],
        '<ul><li>One<ul><li>Deep</li></ul></li></ul>',
      ],
      'a nested list is closed by a paragraph' => [
        [
          self::block([self::span('One')], ['listItem' => 'bullet', 'level' => 1]),
          self::block([self::span('Deep')], ['listItem' => 'bullet', 'level' => 2]),
          self::block([self::span('After')]),
        ],
        '<ul><li>One<ul><li>Deep</li></ul></li></ul><p>After</p>',
      ],
      'an unusable level falls back to the top level' => [
        [self::block([self::span('One')], ['listItem' => 'bullet', 'level' => 'deep'])],
        '<ul><li>One</li></ul>',
      ],
      'underline, code and strike-through decorators' => [
        [
          self::block([
            self::span('u', ['underline']),
            self::span('c', ['code']),
            self::span('s', ['strike-through']),
          ]),
        ],
        '<p><u>u</u><code>c</code><del>s</del></p>',
      ],
      'superscript, subscript and highlight decorators' => [
        [
          self::block([
            self::span('E=mc'),
            self::span('2', ['superscript']),
            self::span(' H'),
            self::span('2', ['subscript']),
            self::span('O '),
            self::span('note', ['highlight']),
          ]),
        ],
        '<p>E=mc<sup>2</sup> H<sub>2</sub>O <mark>note</mark></p>',
      ],
      'blockquote' => [
        [self::block([self::span('Quoted')], ['style' => 'blockquote'])],
        '<blockquote>Quoted</blockquote>',
      ],
      'link' => [
        [
          self::block([self::span('Drupal', ['abc'])], [
            'markDefs' => [['_key' => 'abc', '_type' => 'link', 'href' => 'https://example.com/a?b=1&c=2']],
          ]),
        ],
        '<p><a href="https://example.com/a?b=1&amp;c=2">Drupal</a></p>',
      ],
      'mark referencing a missing markDef is ignored' => [
        [self::block([self::span('Text', ['nope'])])],
        '<p>Text</p>',
      ],
      'table with a header row' => [
        [
          [
            '_type' => 'table',
            '_key' => 't1',
            'header' => TRUE,
            'rows' => [['A', 'B'], ['1', '2']],
          ],
        ],
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
      ],
      'table without a header row' => [
        [
          [
            '_type' => 'table',
            '_key' => 't1',
            'header' => FALSE,
            'rows' => [['A', 'B'], ['1', '2']],
          ],
        ],
        '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
      ],
      'a header-only table has no body' => [
        [['_type' => 'table', '_key' => 't1', 'header' => TRUE, 'rows' => [['A']]]],
        '<table><thead><tr><th>A</th></tr></thead></table>',
      ],
      'table cells are escaped' => [
        [
          [
            '_type' => 'table',
            '_key' => 't1',
            'header' => FALSE,
            'rows' => [['<script>alert(1)</script>', '"quoted" & co']],
          ],
        ],
        '<table><tbody><tr><td>&lt;script&gt;alert(1)&lt;/script&gt;</td><td>&quot;quoted&quot; &amp; co</td></tr></tbody></table>',
      ],
      'a table closes an open list' => [
        [
          self::block([self::span('Item')], ['listItem' => 'bullet']),
          ['_type' => 'table', '_key' => 't1', 'header' => FALSE, 'rows' => [['Cell']]],
        ],
        '<ul><li>Item</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>',
      ],
      'a table with unusable rows renders nothing' => [
        [['_type' => 'table', '_key' => 't1', 'rows' => 'nope']],
        '',
      ],
      'a table row that is not a list is skipped' => [
        [
          [
            '_type' => 'table',
            '_key' => 't1',
            'header' => FALSE,
            'rows' => [['Kept'], ['a' => 'b'], []],
          ],
        ],
        '<table><tbody><tr><td>Kept</td></tr></tbody></table>',
      ],
      'line breaks in a cell survive as markup, escaped first' => [
        [
          [
            '_type' => 'table',
            '_key' => 't1',
            'header' => FALSE,
            'rows' => [["one\ntwo", "<b>x</b>\ny"]],
          ],
        ],
        '<table><tbody><tr><td>one<br>' . "\n" . 'two</td><td>&lt;b&gt;x&lt;/b&gt;<br>' . "\n" . 'y</td></tr></tbody></table>',
      ],
      'a non-string cell renders empty' => [
        [['_type' => 'table', '_key' => 't1', 'header' => FALSE, 'rows' => [[['x'], 'ok']]]],
        '<table><tbody><tr><td></td><td>ok</td></tr></tbody></table>',
      ],
      'block objects are skipped' => [
        [
          ['_type' => 'image', '_key' => 'i1', 'asset' => ['_ref' => 'x']],
          self::block([self::span('Kept')]),
        ],
        '<p>Kept</p>',
      ],
    ];
  }

  /**
   * Tests that content coming out of the JSON can never become markup.
   */
  #[DataProvider('providerEscaping')]
  public function testEscaping(array $value, string $expected): void {
    $this->assertSame($expected, $this->process(json_encode($value)));
  }

  /**
   * Data provider for ::testEscaping().
   */
  public static function providerEscaping(): array {
    return [
      'markup in span text is escaped' => [
        [self::block([self::span('<script>alert(1)</script>')])],
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
      ],
      'quotes in span text are escaped' => [
        [self::block([self::span('He said "hi" & left')])],
        '<p>He said &quot;hi&quot; &amp; left</p>',
      ],
      'javascript: hrefs are stripped' => [
        [
          self::block([self::span('Click', ['x'])], [
            'markDefs' => [['_key' => 'x', '_type' => 'link', 'href' => 'javascript:alert(1)']],
          ]),
        ],
        '<p><a href="alert(1)">Click</a></p>',
      ],
      'an href cannot break out of the attribute' => [
        [
          self::block([self::span('Click', ['x'])], [
            'markDefs' => [['_key' => 'x', '_type' => 'link', 'href' => '" onmouseover="alert(1)']],
          ]),
        ],
        '<p><a href="&quot; onmouseover=&quot;alert(1)">Click</a></p>',
      ],
      'a non-string span text is skipped' => [
        [self::block([['_type' => 'span', '_key' => 's', 'text' => ['<b>x</b>'], 'marks' => []]])],
        '<p></p>',
      ],
    ];
  }

  /**
   * Tests that unusable input neither errors nor leaks raw JSON.
   */
  #[DataProvider('providerInvalid')]
  public function testInvalidInput(string $text, string $expected): void {
    $this->assertSame($expected, $this->process($text));
  }

  /**
   * Data provider for ::testInvalidInput().
   */
  public static function providerInvalid(): array {
    return [
      'empty' => ['', ''],
      'whitespace only' => ["  \n ", ''],
      'plain text is kept but escaped' => [
        'Just <b>text</b>',
        '<p>Just &lt;b&gt;text&lt;/b&gt;</p>',
      ],
      'truncated JSON is treated as plain text' => [
        '[{"_type":"block"',
        '<p>[{&quot;_type&quot;:&quot;block&quot;</p>',
      ],
      'a JSON object renders nothing' => ['{"_type":"block"}', ''],
      'a JSON string renders nothing' => ['"hello"', ''],
      'JSON null renders nothing' => ['null', ''],
      'a JSON number renders nothing' => ['42', ''],
      'a list of scalars renders nothing' => ['[1, 2, 3]', ''],
      'a block with no children renders empty' => ['[{"_type":"block"}]', '<p></p>'],
      'a block with non-array children renders empty' => ['[{"_type":"block","children":"x"}]', '<p></p>'],
      'a block with non-array markDefs renders' => [
        '[{"_type":"block","markDefs":"x","children":[{"_type":"span","text":"Hi"}]}]',
        '<p>Hi</p>',
      ],
    ];
  }

}
