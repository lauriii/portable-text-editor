<?php

declare(strict_types=1);

namespace Drupal\portable_text_editor\Plugin\Editor;

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\editor\Attribute\Editor;
use Drupal\editor\Entity\Editor as EditorEntity;
use Drupal\editor\Plugin\EditorBase;

/**
 * Defines a Portable Text based text editor for Drupal.
 *
 * The editor stores Portable Text JSON in the field, rather than HTML. The
 * JSON is turned into HTML on output by the "Render Portable Text" filter.
 *
 * @see \Drupal\portable_text_editor\Plugin\Filter\FilterPortableText
 */
#[Editor(
  id: 'portable_text',
  label: new TranslatableMarkup('Portable Text'),
  supports_content_filtering: FALSE,
  supports_inline_editing: FALSE,
  is_xss_safe: FALSE,
  supported_element_types: [
    'textarea',
  ],
)]
class PortableText extends EditorBase {

  /**
   * Returns the toolbar buttons this editor can render.
   *
   * @return array<string, \Drupal\Core\StringTranslation\TranslatableMarkup>
   *   Button IDs, keyed in the order they are rendered in the toolbar.
   */
  public static function toolbarButtons(): array {
    return [
      'bold' => new TranslatableMarkup('Bold'),
      'italic' => new TranslatableMarkup('Italic'),
      'underline' => new TranslatableMarkup('Underline'),
      'strike_through' => new TranslatableMarkup('Strike-through'),
      'code' => new TranslatableMarkup('Code'),
      'h2' => new TranslatableMarkup('Heading 2'),
      'h3' => new TranslatableMarkup('Heading 3'),
      'h4' => new TranslatableMarkup('Heading 4'),
      'blockquote' => new TranslatableMarkup('Block quote'),
      'bulleted_list' => new TranslatableMarkup('Bulleted list'),
      'numbered_list' => new TranslatableMarkup('Numbered list'),
      'link' => new TranslatableMarkup('Link'),
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getDefaultSettings(): array {
    return ['toolbar' => array_keys(static::toolbarButtons())];
  }

  /**
   * {@inheritdoc}
   */
  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    // The text format form puts the text editor being configured here.
    // @see \Drupal\editor\Hook\EditorHooks::formFilterFormatFormAlter()
    $editor = $form_state->get('editor');
    $settings = $editor instanceof EditorEntity ? $editor->getSettings() : $this->getDefaultSettings();

    $form['toolbar'] = [
      '#type' => 'checkboxes',
      '#title' => $this->t('Toolbar buttons'),
      '#description' => $this->t('Buttons that are offered while editing. Unchecking a button does not remove existing formatting from stored content.'),
      '#options' => static::toolbarButtons(),
      '#default_value' => $settings['toolbar'] ?? [],
      '#element_validate' => [[static::class, 'validateToolbar']],
    ];
    return $form;
  }

  /**
   * Reduces the checkboxes value to the list of enabled button IDs.
   *
   * @param array $element
   *   The toolbar checkboxes element.
   * @param \Drupal\Core\Form\FormStateInterface $form_state
   *   The form state.
   */
  public static function validateToolbar(array &$element, FormStateInterface $form_state): void {
    $form_state->setValueForElement($element, array_values(array_filter($element['#value'])));
  }

  /**
   * {@inheritdoc}
   */
  // phpcs:ignore Drupal.NamingConventions.ValidFunctionName.ScopeNotCamelCaps -- The name comes from EditorPluginInterface.
  public function getJSSettings(EditorEntity $editor): array {
    // Only expose buttons this version of the module still knows about, so a
    // stale setting cannot make the JavaScript render an unknown button.
    $known = array_keys(static::toolbarButtons());
    $enabled = $editor->getSettings()['toolbar'] ?? [];
    return ['toolbar' => array_values(array_intersect($known, $enabled))];
  }

  /**
   * {@inheritdoc}
   */
  public function getLibraries(EditorEntity $editor): array {
    return ['portable_text_editor/editor'];
  }

}
