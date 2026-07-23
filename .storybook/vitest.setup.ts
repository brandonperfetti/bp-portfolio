import { beforeAll } from 'vitest'
import { setProjectAnnotations } from '@storybook/nextjs-vite'

import * as previewAnnotations from './preview'

/**
 * Applies the Storybook preview config (theme decorator, a11y parameters,
 * global CSS) to every story-derived Vitest test, so interaction tests run
 * against the same tree the Storybook canvas renders.
 */
const project = setProjectAnnotations([previewAnnotations])

beforeAll(project.beforeAll)
