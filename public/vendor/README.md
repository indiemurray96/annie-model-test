# Bundled Markdown parser

`markdown-it.min.js` is the unmodified browser UMD distribution from the pinned
`markdown-it@15.0.3` npm package. Its MIT licence is included alongside it.

The source package and integrity are recorded in `package-lock.json`. The bundle
SHA-256 is recorded in the implementation verification, rather than fetched from
a CDN at runtime. To update deliberately, change the exact npm dependency and
copy `node_modules/markdown-it/dist/browser/markdown-it.umd.min.js` to
`markdown-it.min.js`, plus its `LICENSE` here,
then run the Markdown rendering/security tests.

Upstream documentation:
- https://github.com/markdown-it/markdown-it/blob/master/docs/safety.md
- https://github.com/markdown-it/markdown-it/blob/master/docs/usage.md

Raw HTML and automatic URL linkification are disabled. A stricter URL-scheme
allowlist and non-loading image description renderer are configured in
`../markdown-renderer.js`.
