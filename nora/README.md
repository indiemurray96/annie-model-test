# Nora independent companion

This directory contains Nora's independent Cloudflare Worker, adapted from Annie without changing her root application. The private ChatGPT Nora memory service remains separate.

Nora uses Workers AI `@cf/openai/gpt-oss-120b`, streaming replies, Cloudflare Access JWT verification and owner-scoped D1 conversations. Conversations can be reopened or deleted; selected historical notes are labelled unreviewed. Imported native Nora snapshots are dated copies, not automatic synchronization.

## Deployment

Set the Cloudflare Git repository root directory to `nora`. Use a new Worker named `nora-independent`. Create separate `nora-independent-memory` and `nora-independent-preview` D1 databases. Nora-specific D1 IDs and Cloudflare Access audience are configured in `wrangler.jsonc` for production and previews. Protect the full hostname with an owner-only Access policy.

Do not reuse Annie's databases, Access audience or Worker. An empty audience rejects every API request. No private archive, credentials or account-history data belongs in this public repository.

From this directory: `npm ci`, `npm test`, `npm run check`, then `npm run deploy`. Set Cloudflare build command to `npm ci && npm test && npm run check` and deploy command to `npm run deploy`.

Verify anonymous API denial, an authenticated synthetic conversation and saved reply after reload, separate preview/production storage, then owner-authenticated Nora archive import at `/import.html` with status/backup readback. Never import a private archive into previews.

## Boundaries

This standalone runtime has no browser, computer, peer-agent, scheduling or outbound messaging tools. It does not see all ChatGPT chats or automatically synchronize with native Nora. No application-specific daily quota is implemented; account Workers AI limits still apply. Saved answer excerpts are references, not verified findings.
