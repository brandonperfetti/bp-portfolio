import Image, { type ImageProps } from 'next/image'
import { type MDXComponents } from 'mdx/types'

let warnedMissingMdxImageAlt = false

export function useMDXComponents(components: MDXComponents) {
  return {
    ...components,
    Image: (props: ImageProps) => {
      if (
        props.alt === undefined &&
        process.env.NODE_ENV !== 'production' &&
        !warnedMissingMdxImageAlt
      ) {
        warnedMissingMdxImageAlt = true
        console.warn(
          '[mdx-components] MDX <Image> is missing `alt`. Provide descriptive alt text for accessibility.',
        )
      }

      return <Image {...props} alt={props.alt ?? ''} />
    },
  }
}
