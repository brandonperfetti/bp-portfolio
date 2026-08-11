import type { Block } from 'payload'

/**
 * Code snippet block for article bodies.
 *
 * @remarks The options list must cover every value the Notion migration
 * emitted — publish-time validation rejects out-of-list values, and drafts
 * that saved fine will refuse to publish (the original three-option list
 * blocked six migrated articles, all on `none`). The frontend renderer
 * lowercases the value and falls back to plaintext for anything unknown,
 * so adding options here is always render-safe.
 */
export const Code: Block = {
  slug: 'code',
  interfaceName: 'CodeBlock',
  imageURL: '/images/cms/code.svg',
  imageAltText: 'Line-art preview of the Code block',
  fields: [
    {
      name: 'language',
      type: 'select',
      defaultValue: 'typescript',
      options: [
        { label: 'Typescript', value: 'typescript' },
        { label: 'Javascript', value: 'javascript' },
        { label: 'TSX', value: 'tsx' },
        { label: 'JSX', value: 'jsx' },
        { label: 'CSS', value: 'css' },
        { label: 'HTML', value: 'html' },
        { label: 'JSON', value: 'json' },
        { label: 'YAML', value: 'yaml' },
        { label: 'Bash / Shell', value: 'bash' },
        { label: 'SQL', value: 'sql' },
        { label: 'Markdown', value: 'markdown' },
        { label: 'Python', value: 'python' },
        { label: 'GraphQL', value: 'graphql' },
        { label: 'Dockerfile', value: 'dockerfile' },
        { label: 'Diff', value: 'diff' },
        { label: 'Plain text', value: 'none' },
      ],
    },
    {
      name: 'code',
      type: 'code',
      label: false,
      required: true,
    },
  ],
}
