import * as migration_20260722_024610_initial from './20260722_024610_initial'
import * as migration_20260722_033130_phase1_content_model from './20260722_033130_phase1_content_model'
import * as migration_20260723_134344_seed_collections from './20260723_134344_seed_collections'
import * as migration_20260723_135530_pages_subtitle_home_images from './20260723_135530_pages_subtitle_home_images'
import * as migration_20260723_153219_feature_grid_logo_carousel from './20260723_153219_feature_grid_logo_carousel'
import * as migration_20260723_155506_block_library_expansion from './20260723_155506_block_library_expansion'

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
]
