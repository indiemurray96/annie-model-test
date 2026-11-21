import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../retired.mjs";

test("retired service rejects every request without bindings", async () => {
  for (const [method, path] of [["GET", "/"], ["POST", "/api/chat"], ["GET", "/api/history"]]) {
    const response = await worker.fetch(new Request("https://example.test" + path, { method }));
    assert.equal(response.status, 410);
  }
});
