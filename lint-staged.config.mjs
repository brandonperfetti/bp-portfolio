export default {
  '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,jsonc,md,mdx,css,scss,yaml,yml,html}': ['prettier --write'],
}
// No `tsc` here (whole-project, too slow for commit). CI covers typecheck;
// .husky/pre-push runs typecheck + unit tests as a local gate.
