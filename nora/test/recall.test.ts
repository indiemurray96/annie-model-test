import { describe, expect, it } from "vitest";
import { isCurrentRuntimeQuestion, recallArchiveContext, recallScore, recallTerms } from "../src/memory";
import { recallFindingsContext } from "../src/continuity";
import type { Env } from "../src/types";

type Note = { id: string; key: string; value: string; kind: string; source: { reference: string }; supersedes?: string };
const note = (id: string, key: string, value: string, extra: Partial<Note> = {}): Note => ({
  id, key, value, kind: "confirmed", source: { reference: `synthetic:${id}` }, ...extra
});

function fixture(notes: Note[] | null, findings: Array<{ question: string; excerpt: string; created_at: string }> = []) {
  const boundReads: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) { args = values; return this; },
        async run() { return {}; },
        async first() {
          boundReads.push({ sql, args });
          return notes === null ? null : { archive_json: JSON.stringify({ snapshot: {
            agentId: "nora", revision: 1, checkpointId: "cp-synthetic", knowledge: notes
          } }) };
        },
        async all() { boundReads.push({ sql, args }); return { results: findings }; }
      };
    },
    async batch() { return []; }
  } as unknown as D1Database;
  return { env: { DB: db } as Env, db, boundReads };
}

describe("bounded historical archive recall", () => {
  it("distinguishes no imported archive from an imported archive with no relevant notes", async () => {
    expect(await recallArchiveContext(fixture(null).env, "owner-a", "cooling system")).toEqual({
      imported: false, selectedCount: 0, text: ""
    });
    expect(await recallArchiveContext(fixture([note("1", "budget", "The budget is reviewed monthly")]).env, "owner-a", "cooling system")).toEqual({
      imported: true, checkpointId: "cp-synthetic", selectedCount: 0, text: ""
    });
  });

  it("does not retrieve unrelated setup notes for a casual greeting or vague reflection", async () => {
    const { env } = fixture([note("1", "nora.independent_runtime", "Nora's model and deployment work was completed today")]);
    for (const question of ["Hello Nora, how are you doing?", "what do you think of the work we've done today?"]) {
      expect((await recallArchiveContext(env, "owner-a", question)).selectedCount).toBe(0);
    }
  });

  it("returns only relevant records, retaining source and evidence labels", async () => {
    const { env, boundReads } = fixture([
      note("1", "car.cooling", "Pressure test the cooling system", { kind: "provisional" }),
      note("2", "budget", "Monthly spending review")
    ]);
    const result = await recallArchiveContext(env, "owner-a", "What did we record about the cooling system?");
    expect(result.selectedCount).toBe(1);
    expect(result.text).toContain("evidence: provisional");
    expect(result.text).toContain("source: synthetic:1");
    expect(result.text).not.toContain("Monthly spending");
    expect(boundReads[0].args).toEqual(["owner-a"]);
  });

  it("excludes corrected and explicitly superseded records", async () => {
    const { env } = fixture([
      note("old", "car.cooling", "Cooling deadline OLD"),
      note("new", "car.cooling", "Cooling deadline CORRECTED", { supersedes: "old" }),
      note("obsolete", "car.cooling", "Cooling deadline SUPERSEDED", { kind: "superseded" })
    ]);
    const result = await recallArchiveContext(env, "owner-a", "cooling deadline");
    expect(result.selectedCount).toBe(1);
    expect(result.text).toContain("CORRECTED");
    expect(result.text).not.toContain("OLD");
    expect(result.text).not.toContain("SUPERSEDED");
  });

  it("suppresses historical model notes for current identity questions while reporting imported status", async () => {
    const { env } = fixture([note("1", "nora.model", "The old model was GLM")]);
    for (const question of ["Which model are you using?", "What model?", "What tools do you have now?", "Was archive context supplied for this turn?"]) {
      const result = await recallArchiveContext(env, "owner-a", question);
      expect(result.imported).toBe(true);
      expect(result.selectedCount).toBe(0);
      expect(result.text).toBe("");
    }
  });

  it("still permits explicitly historical model/build questions", async () => {
    const { env } = fixture([note("1", "nora.model_considered", "We considered a GLM model earlier")]);
    const result = await recallArchiveContext(env, "owner-a", "Which models did we consider earlier?");
    expect(result.selectedCount).toBe(1);
    expect(result.text).toContain("considered a GLM");
    expect(result.text).toContain("HISTORICAL ARCHIVE REFERENCE DATA");
    expect(isCurrentRuntimeQuestion("Which model did we use before?")).toBe(false);
    expect(isCurrentRuntimeQuestion("Which model did we use earlier, and what are you using now?")).toBe(true);
  });

  it("matches complete normalized words rather than arbitrary substrings", () => {
    expect(recallTerms("Tell me what you think about carriers")).toEqual(["carrier"]);
    expect(recallScore(["king"], "working", "parking")).toBe(0);
    expect(recallScore(["carrier"], "navy.carriers", "carrier deployed")).toBeGreaterThan(0);
  });

  it("bounds context while retaining complete provenance and truthful selectedCount", async () => {
    const notes = Array.from({ length: 12 }, (_, i) => note(String(i), "navy.carrier", "carrier ".repeat(250)));
    const result = await recallArchiveContext(fixture(notes).env, "owner-a", "carrier");
    expect(result.text.length).toBeLessThanOrEqual(11000);
    expect(result.selectedCount).toBeGreaterThan(0);
    expect(result.selectedCount).toBeLessThanOrEqual(8);
    expect((result.text.match(/source: synthetic:/g) || []).length).toBe(result.selectedCount);
  });
});

describe("unreviewed conversation recall", () => {
  const rows = [
    { question: "Which model are you using?", excerpt: "I am an old Cloudflare model and have no identity metadata.", created_at: "2026-10-01" },
    { question: "How should we inspect the cooling system?", excerpt: "The pressure test is an unreviewed suggestion.", created_at: "2026-10-02" }
  ];

  it("does not repeat an old assistant self-description", async () => {
    const result = await recallFindingsContext(fixture([], rows).db, "owner-a", "Which model are you using?", "chat-current");
    expect(result).toEqual({ selectedCount: 0, text: "" });
  });

  it("retains relevant ordinary excerpts with their unreviewed status and owner filter", async () => {
    const { db, boundReads } = fixture([], rows);
    const result = await recallFindingsContext(db, "owner-a", "cooling system", "chat-current");
    expect(result.selectedCount).toBe(1);
    expect(result.text).toContain("unreviewed text extracts");
    expect(result.text).toContain("2026-10-02");
    expect(result.text).not.toContain("old Cloudflare model");
    expect(boundReads[0].args).toEqual(["owner-a", "chat-current"]);
  });

  it("allows historical discussion without recycling current-runtime claims", async () => {
    const result = await recallFindingsContext(fixture([], rows).db, "owner-a", "Which models did we consider earlier?", "chat-current");
    expect(result.selectedCount).toBe(0);
  });
});
