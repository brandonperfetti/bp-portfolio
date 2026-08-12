import * as migration_20260722_024610_initial from './20260722_024610_initial'
import * as migration_20260722_033130_phase1_content_model from './20260722_033130_phase1_content_model'
import * as migration_20260723_134344_seed_collections from './20260723_134344_seed_collections'
import * as migration_20260723_135530_pages_subtitle_home_images from './20260723_135530_pages_subtitle_home_images'
import * as migration_20260723_153219_feature_grid_logo_carousel from './20260723_153219_feature_grid_logo_carousel'
import * as migration_20260723_155506_block_library_expansion from './20260723_155506_block_library_expansion'
import * as migration_20260723_171916_photo_strip_posts_layout from './20260723_171916_photo_strip_posts_layout'
import * as migration_20260723_193654_identity_resume from './20260723_193654_identity_resume'
import * as migration_20260809_182905_mcp_work_history_permissions from './20260809_182905_mcp_work_history_permissions'
import * as migration_20260811_214354_container_column_layout_blocks from './20260811_214354_container_column_layout_blocks'
import * as migration_20260811_223434_container_layout_section_controls from './20260811_223434_container_layout_section_controls'
import * as migration_20260811_230657_container_section_background from './20260811_230657_container_section_background'
import * as migration_20260812_011542_hero_presentation from './20260812_011542_hero_presentation'
import * as migration_20260812_014249_sociallinks_image_blocks from './20260812_014249_sociallinks_image_blocks'
import * as migration_20260812_045105_hero_content_fields from './20260812_045105_hero_content_fields'
import * as migration_20260812_052856_w2b2_articles_prose_heading_identity_email from './20260812_052856_w2b2_articles_prose_heading_identity_email'
import * as migration_20260812_115519_w2c_card_chrome from './20260812_115519_w2c_card_chrome'

export const migrations = [
  {
    up: migration_20260722_024610_initial.up,
    down: migration_20260722_024610_initial.down,
    name: '20260722_024610_initial',
  },
  {
    up: migration_20260722_033130_phase1_content_model.up,
    down: migration_20260722_033130_phase1_content_model.down,
    name: '20260722_033130_phase1_content_model',
  },
  {
    up: migration_20260723_134344_seed_collections.up,
    down: migration_20260723_134344_seed_collections.down,
    name: '20260723_134344_seed_collections',
  },
  {
    up: migration_20260723_135530_pages_subtitle_home_images.up,
    down: migration_20260723_135530_pages_subtitle_home_images.down,
    name: '20260723_135530_pages_subtitle_home_images',
  },
  {
    up: migration_20260723_153219_feature_grid_logo_carousel.up,
    down: migration_20260723_153219_feature_grid_logo_carousel.down,
    name: '20260723_153219_feature_grid_logo_carousel',
  },
  {
    up: migration_20260723_155506_block_library_expansion.up,
    down: migration_20260723_155506_block_library_expansion.down,
    name: '20260723_155506_block_library_expansion',
  },
  {
    up: migration_20260723_171916_photo_strip_posts_layout.up,
    down: migration_20260723_171916_photo_strip_posts_layout.down,
    name: '20260723_171916_photo_strip_posts_layout',
  },
  {
    up: migration_20260723_193654_identity_resume.up,
    down: migration_20260723_193654_identity_resume.down,
    name: '20260723_193654_identity_resume',
  },
  {
    up: migration_20260809_182905_mcp_work_history_permissions.up,
    down: migration_20260809_182905_mcp_work_history_permissions.down,
    name: '20260809_182905_mcp_work_history_permissions',
  },
  {
    up: migration_20260811_214354_container_column_layout_blocks.up,
    down: migration_20260811_214354_container_column_layout_blocks.down,
    name: '20260811_214354_container_column_layout_blocks',
  },
  {
    up: migration_20260811_223434_container_layout_section_controls.up,
    down: migration_20260811_223434_container_layout_section_controls.down,
    name: '20260811_223434_container_layout_section_controls',
  },
  {
    up: migration_20260811_230657_container_section_background.up,
    down: migration_20260811_230657_container_section_background.down,
    name: '20260811_230657_container_section_background',
  },
  {
    up: migration_20260812_011542_hero_presentation.up,
    down: migration_20260812_011542_hero_presentation.down,
    name: '20260812_011542_hero_presentation',
  },
  {
    up: migration_20260812_014249_sociallinks_image_blocks.up,
    down: migration_20260812_014249_sociallinks_image_blocks.down,
    name: '20260812_014249_sociallinks_image_blocks',
  },
  {
    up: migration_20260812_045105_hero_content_fields.up,
    down: migration_20260812_045105_hero_content_fields.down,
    name: '20260812_045105_hero_content_fields',
  },
  {
    up: migration_20260812_052856_w2b2_articles_prose_heading_identity_email.up,
    down: migration_20260812_052856_w2b2_articles_prose_heading_identity_email.down,
    name: '20260812_052856_w2b2_articles_prose_heading_identity_email',
  },
  {
    up: migration_20260812_115519_w2c_card_chrome.up,
    down: migration_20260812_115519_w2c_card_chrome.down,
    name: '20260812_115519_w2c_card_chrome',
  },
]
