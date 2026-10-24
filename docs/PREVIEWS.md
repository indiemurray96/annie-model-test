# Development previews

Pull-request branches use `npx wrangler preview`. The `previews` block in
`wrangler.jsonc` explicitly supplies AI, Access validation settings and a D1
database named `annie-independent-preview`. Production continues to use
`annie-independent-memory`. Never substitute the production database ID into
the preview block.

Previews share the test database with one another. They do not share production
rows. Use synthetic test conversations only; do not import the private archive.
The existing idempotent initialization creates chat tables on the first chat,
conversation-list or health-check request, and archive tables on an archive
request. No production migration is necessary.

The API always verifies a Cloudflare Access JWT. Preview access must use an
Access application whose audience matches `previews.vars.POLICY_AUD`; a deployed
page alone is not proof of authenticated functionality. Keep authentication
enabled, and do not insert an authentication bypass for automated tests.

Validation: `npm test`, `npm run check`, a successful PR preview build, an
unauthenticated API rejection, then an authenticated synthetic chat and reload.
`GET /api/memory-check` reports only the signed-in owner's current chat count.
Confirm the preview database ID differs from production before publishing.

The test runner and Wrangler are pinned. The unused Workers Vitest pool was
removed; these tests use the ordinary Vitest runner. `undici` is overridden to
the patched 7.30.1 release until Wrangler's dependency includes that patch.
Check `npm audit` when updating dependencies, and remove the override when it
is no longer needed. No runtime model or production storage setting changed.
