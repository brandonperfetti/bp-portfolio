import { beforeAll } from 'vitest'
import { setProjectAnnotations } from '@storybook/nextjs-vite'

import * as previewAnnotations from './preview'

/**
 * Applies the Storybook preview config (theme decorator, a11y parameters,
 * global CSS) to every story-derived Vitest test, so interaction tests run
 * against the same tree the Storybook canvas renders.
 *
 * @remarks Storybook 10.3+ prints an info box suggesting this file is
 * redundant with addon-vitest — it is not for this config: removing it was
 * tried (2026-08) and 4 tests failed (a11y color-contrast without the theme
 * decorator, ShaderHero stories without preview context). Keep it.
 */
const project = setProjectAnnotations([previewAnnotations])

beforeAll(project.beforeAll)
