import { describe, expect, it, vi } from "vitest";
import { memoryCheck } from "../src/health";
import type { Env } from "../src/types";

vi.mock("../src/access", () => ({ verifyUser: vi.fn() }));
import { verifyUser } from "../src/access";
import worker from "../src/index";

describe("database health check", () => {
  it("initializes a fresh schema and counts only the authenticated owner's chats", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const values: unknown[] = [];
        return { bind(...args: unknown[]) { values.push(...args); return this; },
          async first() { queries.push({ sql, values }); return { total: 2 }; } };
      },
      batch: vi.fn(async () => [])
    } as unknown as D1Database;
    const result = await memoryCheck(db, "owner-a");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ connected: true, conversations: 2 });
    expect(db.batch).toHaveBeenCalledOnce();
    expect(queries).toEqual([{ sql: "SELECT COUNT(*) AS total FROM annie_saved_chats WHERE owner_sub=?", values: ["owner-a"] }]);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  it("reports database failure without exposing error details or caching the response", async () => {
    const db = { prepare() { throw new Error("private database details"); } } as unknown as D1Database;
    const response = await memoryCheck(db, "owner-a");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ connected: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unauthenticated requests before querying storage", async () => {
    vi.mocked(verifyUser).mockResolvedValue(null);
    const prepare = vi.fn();
    const response = await worker.fetch(new Request("https://example.test/api/memory-check"),
      { DB: { prepare } } as unknown as Env, {} as ExecutionContext);
    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });
});
