<?php

declare(strict_types=1);

namespace Drupal\portable_text_editor\Plugin\Editor;

use Drupal\Core\Access\CsrfTokenGenerator;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Url;
use Drupal\editor\Attribute\Editor;
use Drupal\editor\Entity\Editor as EditorEntity;
use Drupal\editor\Plugin\EditorBase;
use Drupal\media_library\MediaLibraryState;
use Symfony\Component\DependencyInjection\ContainerInterface;

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
class PortableText extends EditorBase implements ContainerFactoryPluginInterface {

  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    protected ModuleHandlerInterface $moduleHandler,
    protected EntityTypeManagerInterface $entityTypeManager,
    protected CsrfTokenGenerator $csrfToken,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('module_handler'),
      $container->get('entity_type.manager'),
      $container->get('csrf_token'),
    );
  }

  /**
   * Returns the toolbar buttons this editor can render.
   *
   * @return array<string, \Drupal\Core\StringTranslation\TranslatableMarkup>
   *   Button IDs, keyed in the order they are rendered in the toolbar.
   */
  public static function toolbarButtons(): array {
    return [
      'undo' => new TranslatableMarkup('Undo'),
      'redo' => new TranslatableMarkup('Redo'),
      'styles' => new TranslatableMarkup('Block style menu (paragraph, headings, quote)'),
      'bold' => new TranslatableMarkup('Bold'),
      'italic' => new TranslatableMarkup('Italic'),
      'underline' => new TranslatableMarkup('Underline'),
      'strike_through' => new TranslatableMarkup('Strike-through'),
      'code' => new TranslatableMarkup('Code'),
      'superscript' => new TranslatableMarkup('Superscript'),
      'subscript' => new TranslatableMarkup('Subscript'),
      'highlight' => new TranslatableMarkup('Highlight'),
      'clear_format' => new TranslatableMarkup('Remove formatting'),
      'bulleted_list' => new TranslatableMarkup('Bulleted list'),
      'numbered_list' => new TranslatableMarkup('Numbered list'),
      'link' => new TranslatableMarkup('Link'),
      'table' => new TranslatableMarkup('Insert table'),
      'media' => new TranslatableMarkup('Insert media (needs the "Embed media" filter)'),
    ];
  }

  /**
   * Returns the IDs of the toolbar buttons this editor can render.
   *
   * The config schema validates against this, so the list of buttons only has
   * to be written down once.
   *
   * @return string[]
   *   The button IDs.
   */
  public static function toolbarButtonIds(): array {
    return array_keys(static::toolbarButtons());
  }

  /**
   * {@inheritdoc}
   */
  public function getDefaultSettings(): array {
    return ['toolbar' => static::toolbarButtonIds()];
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

    if (in_array('media', $settings['toolbar'] ?? [], TRUE) && !$this->mediaIsEmbeddable($editor)) {
      $form['media_warning'] = [
        '#type' => 'item',
        '#markup' => $this->t('The media button is enabled, but media cannot be embedded in this text format. Install the Media Library module and enable the "Embed media" filter below, otherwise the button stays hidden.'),
        '#weight' => 1,
      ];
    }

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
   * Whether media can be embedded in this editor's text format.
   *
   * Media is rendered by core's "Embed media" filter, which also gates access
   * to the media library for text editors, so without it there is nothing the
   * media button could usefully do.
   *
   * @param mixed $editor
   *   The text editor being configured, if there is one yet.
   *
   * @return bool
   *   TRUE when the media library can be offered.
   *
   * @see \Drupal\media_library\MediaLibraryEditorOpener::checkAccess()
   */
  protected function mediaIsEmbeddable($editor): bool {
    if (!$editor instanceof EditorEntity || !$this->moduleHandler->moduleExists('media_library')) {
      return FALSE;
    }
    if (!$editor->hasAssociatedFilterFormat()) {
      return FALSE;
    }
    $filters = $editor->getFilterFormat()->filters();
    return $filters->has('media_embed') && $filters->get('media_embed')->status === TRUE;
  }

  /**
   * {@inheritdoc}
   */
  // phpcs:ignore Drupal.NamingConventions.ValidFunctionName.ScopeNotCamelCaps -- The name comes from EditorPluginInterface.
  public function getJSSettings(EditorEntity $editor): array {
    // Only expose buttons this version of the module still knows about, so a
    // stale setting cannot make the JavaScript render an unknown button.
    $known = static::toolbarButtonIds();
    $enabled = $editor->getSettings()['toolbar'] ?? [];
    $settings = ['toolbar' => array_values(array_intersect($known, $enabled))];

    if (in_array('media', $settings['toolbar'], TRUE) && $this->mediaIsEmbeddable($editor)) {
      $settings['media'] = $this->mediaSettings($editor);
    }
    else {
      // Without somewhere to embed media, the button would open a library the
      // user cannot use.
      $settings['toolbar'] = array_values(array_diff($settings['toolbar'], ['media']));
    }

    return $settings;
  }

  /**
   * Builds the settings the media library button needs.
   *
   * @param \Drupal\editor\Entity\Editor $editor
   *   The text editor.
   *
   * @return array
   *   The URL of the media library dialog, and of the preview endpoint the
   *   writing area renders embedded media with.
   *
   * @see \Drupal\ckeditor5\Plugin\CKEditor5Plugin\MediaLibrary::getDynamicPluginConfig()
   */
  protected function mediaSettings(EditorEntity $editor): array {
    $format = $editor->getFilterFormat();
    $media_type_ids = $this->entityTypeManager->getStorage('media_type')->getQuery()->execute();

    $allowed = $format->filters()->get('media_embed')->settings['allowed_media_types'] ?? [];
    if (!empty($allowed)) {
      $media_type_ids = array_intersect_key($media_type_ids, $allowed);
    }
    if (in_array('image', $media_type_ids, TRUE)) {
      // Images are what most people reach for, so offer that type first.
      array_unshift($media_type_ids, 'image');
      $media_type_ids = array_unique($media_type_ids);
    }

    $state = MediaLibraryState::create(
      'media_library.opener.editor',
      $media_type_ids,
      reset($media_type_ids),
      1,
      ['filter_format_id' => $format->id()],
    );

    return [
      'libraryUrl' => Url::fromRoute('media_library.ui')
        ->setOption('query', $state->all())
        ->toString(TRUE)
        ->getGeneratedUrl(),
      'previewUrl' => Url::fromRoute('media.filter.preview', ['filter_format' => $format->id()])
        ->toString(TRUE)
        ->getGeneratedUrl(),
      'previewCsrfToken' => $this->csrfToken->get('X-Drupal-MediaPreview-CSRF-Token'),
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getLibraries(EditorEntity $editor): array {
    return ['portable_text_editor/editor'];
  }

}
