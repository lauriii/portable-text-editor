<?php

declare(strict_types=1);

namespace Drupal\Tests\portable_text_editor\Kernel;

use Drupal\KernelTests\KernelTestBase;
use Drupal\editor\Entity\Editor;
use Drupal\filter\Entity\FilterFormat;
use Drupal\portable_text_editor\Plugin\Editor\PortableText;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;

/**
 * Tests the settings the Portable Text editor hands to its JavaScript.
 */
#[Group('portable_text_editor')]
#[RunTestsInSeparateProcesses]
class PortableTextEditorSettingsTest extends KernelTestBase {

  /**
   * {@inheritdoc}
   */
  protected static $modules = ['filter', 'editor', 'portable_text_editor'];

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    $this->installConfig(['filter']);
  }

  /**
   * Builds a text format with an editor on it.
   *
   * @param array $toolbar
   *   The toolbar setting.
   * @param array $filters
   *   Filters to enable on the format.
   *
   * @return \Drupal\editor\Entity\Editor
   *   The text editor.
   */
  protected function editor(array $toolbar, array $filters = []): Editor {
    FilterFormat::create([
      'format' => 'test_format',
      'name' => 'Test format',
      'filters' => $filters,
    ])->save();
    $editor = Editor::create([
      'format' => 'test_format',
      'editor' => 'portable_text',
      'settings' => ['toolbar' => $toolbar],
    ]);
    $editor->save();
    return $editor;
  }

  /**
   * Returns the editor plugin.
   */
  protected function plugin(): PortableText {
    $plugin = $this->container->get('plugin.manager.editor')->createInstance('portable_text');
    assert($plugin instanceof PortableText);
    return $plugin;
  }

  /**
   * Tests that every button the plugin knows about is on by default.
   */
  public function testDefaultsOfferEveryButton(): void {
    $this->assertSame(
      ['toolbar' => PortableText::toolbarButtonIds()],
      $this->plugin()->getDefaultSettings(),
    );
    $this->assertContains('bold', PortableText::toolbarButtonIds());
  }

  /**
   * Tests that a button the plugin no longer knows about is not passed on.
   */
  public function testUnknownButtonsAreDropped(): void {
    $settings = $this->plugin()->getJSSettings($this->editor(['bold', 'gone', 'link']));
    $this->assertSame(['bold', 'link'], $settings['toolbar']);
  }

  /**
   * Tests that the media button hides itself when media cannot be embedded.
   *
   * Core's "Embed media" filter is what renders the element this editor
   * stores, and it also gates access to the media library for text editors, so
   * without it the button would open a library the user cannot use.
   *
   * @see \Drupal\media_library\MediaLibraryEditorOpener::checkAccess()
   */
  public function testMediaNeedsTheEmbedFilter(): void {
    $settings = $this->plugin()->getJSSettings($this->editor(['bold', 'media']));
    $this->assertSame(['bold'], $settings['toolbar']);
    $this->assertArrayNotHasKey('media', $settings);
  }

  /**
   * Tests that the toolbar is ordered by the plugin, not by config.
   *
   * The settings form is a set of checkboxes, so it cannot express an order.
   * Taking the order from the plugin means every text format lays its toolbar
   * out the same way, however the config happens to have been written.
   */
  public function testToolbarIsOrderedByThePlugin(): void {
    $settings = $this->plugin()->getJSSettings($this->editor(['link', 'bold', 'undo']));
    $this->assertSame(['undo', 'bold', 'link'], $settings['toolbar']);
  }

}
