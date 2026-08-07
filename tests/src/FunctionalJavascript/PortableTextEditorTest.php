<?php

declare(strict_types=1);

namespace Drupal\Tests\portable_text_editor\FunctionalJavascript;

use Drupal\FunctionalJavascriptTests\WebDriverTestBase;
use Drupal\node\Entity\Node;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;

/**
 * Tests attaching, detaching and round tripping the Portable Text editor.
 */
#[Group('portable_text_editor')]
#[RunTestsInSeparateProcesses]
class PortableTextEditorTest extends WebDriverTestBase {

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['node', 'editor', 'filter', 'portable_text_editor'];

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stark';

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    // Without a second choice the widget renders no text format select, and
    // this test needs to switch formats.
    $this->config('filter.settings')->set('always_show_fallback_choice', TRUE)->save();
    $this->drupalCreateContentType(['type' => 'page', 'name' => 'Basic page']);
    $this->drupalLogin($this->drupalCreateUser([
      'create page content',
      'edit any page content',
      'use text format portable_text',
    ]));
  }

  /**
   * Tests that the editor attaches, round trips a value and detaches.
   */
  public function testAttachEditAndDetach(): void {
    $page = $this->getSession()->getPage();
    $assert = $this->assertSession();

    $this->drupalGet('node/add/page');
    $page->selectFieldOption('body[0][format]', 'portable_text');

    // Attaching replaces the textarea with the editor's own UI.
    $assert->waitForElement('css', '.portable-text-editor__editable');
    $assert->elementExists('css', '.portable-text-editor__button');
    $this->assertSame(
      'display: none;',
      $page->findField('body[0][value]')->getAttribute('style'),
    );

    $page->fillField('title[0][value]', 'Round trip');
    $this->getSession()->executeScript("document.querySelector('.portable-text-editor__editable').focus();");
    $this->getSession()->getDriver()->getWebDriverSession()->activeElement()->postValue(['value' => ['Hello editor']]);
    $assert->waitForText('Hello editor');

    // The editor keeps the textarea in sync so a normal submit stores the
    // Portable Text JSON verbatim.
    $this->assertTrue($this->getSession()->wait(5000, "document.getElementsByName('body[0][value]')[0].value !== ''"));
    $page->pressButton('Save');
    $assert->waitForText('Round trip');

    $node = $this->drupalGetNodeByTitle('Round trip');
    assert($node instanceof Node);
    $this->assertSame('portable_text', $node->body->format);
    $stored = json_decode($node->body->value, TRUE);
    $this->assertIsArray($stored);
    $this->assertSame('block', $stored[0]['_type']);
    $this->assertSame('Hello editor', $stored[0]['children'][0]['text']);

    // The stored JSON is rendered as HTML on output, never shown raw.
    $assert->responseContains('<p>Hello editor</p>');
    $assert->responseNotContains('_type');

    // Reopening rehydrates exactly what was saved.
    $this->drupalGet($node->toUrl('edit-form'));
    $assert->waitForElement('css', '.portable-text-editor__editable');
    $assert->elementTextContains('css', '.portable-text-editor__editable', 'Hello editor');
    $this->assertSame($node->body->value, $page->findField('body[0][value]')->getValue());

    // Switching away from the format detaches the editor and gives the
    // textarea back.
    $page->selectFieldOption('body[0][format]', 'plain_text');
    $this->assertTrue($assert->waitForElementRemoved('css', '.portable-text-editor__editable'));
    $this->assertNull($page->findField('body[0][value]')->getAttribute('style'));
  }

}
