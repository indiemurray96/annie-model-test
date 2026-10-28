import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps preview storage separate and supplies required runtime bindings", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""));
  const preview = config.previews;
  expect(preview.ai.binding).toBe("AI");
  expect(preview.d1_databases).toHaveLength(1);
  expect(preview.d1_databases[0].binding).toBe("DB");
  expect(preview.d1_databases[0].database_id).toMatch(/^[\da-f-]{36}$/);
  expect(config.d1_databases.map((db: { database_id: string }) => db.database_id))
    .not.toContain(preview.d1_databases[0].database_id);
  expect(preview.vars.TEAM_DOMAIN).toMatch(/^https:\/\/[a-z\d-]+\.cloudflareaccess\.com$/);
  expect(preview.vars.POLICY_AUD).toMatch(/^[\da-f]{64}$/);
});
