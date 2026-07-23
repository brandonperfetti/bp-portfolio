import * as migration_20260722_024610_initial from './20260722_024610_initial'
import * as migration_20260722_033130_phase1_content_model from './20260722_033130_phase1_content_model'
import * as migration_20260723_134344_seed_collections from './20260723_134344_seed_collections'

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
]
