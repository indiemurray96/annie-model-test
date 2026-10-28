import { prepareContinuity } from "./continuity";

// Check the actual owner-scoped chat schema, including a fresh preview database.
export async function memoryCheck(db: D1Database, owner: string): Promise<Response> {
  try {
    await prepareContinuity(db);
    const result = await db.prepare(
      "SELECT COUNT(*) AS total FROM nora_saved_chats WHERE owner_sub=?"
    ).bind(owner).first<{ total: number }>();
    return Response.json({ connected: true, conversations: result?.total ?? 0 }, {
      headers: { "cache-control": "no-store" }
    });
  } catch {
    return Response.json({ connected: false }, {
      status: 500, headers: { "cache-control": "no-store" }
    });
  }
}
