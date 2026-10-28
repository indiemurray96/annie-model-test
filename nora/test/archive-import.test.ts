import { describe, expect, it } from "vitest";
import { importArchive, archiveBackup } from "../src/memory";
import worker from "../src/index";
import type { Env } from "../src/types";

function database() {
  const rows = new Map<string, { revision: number; archive_json: string }>();
  const reads: Array<{sql:string; args:unknown[]}> = [];
  return { rows, reads, db: {
    prepare(sql: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) { args = values; return this; },
        async run() {
          if (sql.startsWith("INSERT INTO nora_owner_archives")) rows.set(String(args[0]), {revision:Number(args[1]), archive_json:String(args[3])});
          return {};
        },
        async first() { reads.push({sql,args}); return rows.get(String(args[0])) || null; }
      };
    }
  } as unknown as D1Database };
}
function request(raw:string) { return new Request("https://nora.example/api/archive/import", {
  method:"POST", headers:{"content-type":"application/json","origin":"https://nora.example","x-nora-import":"1"},body:raw
}); }
const snapshot = { agentId:"nora",revision:19,checkpointId:"cp-synthetic",knowledge:[{
  id:"k-new",key:"conversation.synthetic",value:"A synthetic useful note",kind:"user_supplied",
  category:"approved_preference",userApproved:true,reviewAfter:"2026-12-01T00:00:00Z",supersedes:"k-old",
  source:{reference:"synthetic:test",excerpt:"Synthetic original words"}
}],tasks:[{id:"task-synthetic",status:"open"}],procedures:[{id:"procedure-synthetic",text:"Synthetic procedure"}],
handoffs:[{id:"handoff-synthetic",status:"proposed"}] };

describe("private Nora archive import",()=>{
  it("rejects another agent's snapshot",async()=>{
    const {db}=database();
    const res=await importArchive(request(JSON.stringify({snapshot:{...snapshot,agentId:"annie"}})),{DB:db} as Env,"owner-a");
    expect(res.status).toBe(422);
  });
  it("preserves the exact raw archive and all metadata, scoped to its owner",async()=>{
    const {db,rows,reads}=database();
    const raw=JSON.stringify({verified:true,snapshot},null,2);
    const res=await importArchive(request(raw),{DB:db} as Env,"owner-a");
    expect(res.status).toBe(200);
    expect(rows.get("owner-a")?.archive_json).toBe(raw);
    expect(await (await archiveBackup({DB:db} as Env,"owner-a")).text()).toBe(raw);
    expect((await archiveBackup({DB:db} as Env,"owner-b")).status).toBe(404);
    expect(reads.every(x=>x.sql.includes("owner_sub=?"))).toBe(true);
  });
  it("requires explicit import header and rejects cross-origin writes",async()=>{
    const {db,rows}=database();const env={DB:db} as Env;const raw=JSON.stringify({snapshot});
    expect((await importArchive(new Request("https://nora.example/api/archive/import",{method:"POST",body:raw}),env,"owner-a")).status).toBe(403);
    expect((await importArchive(new Request("https://nora.example/api/archive/import",{method:"POST",body:raw,headers:{"x-nora-import":"1",origin:"https://elsewhere.example"}}),env,"owner-a")).status).toBe(403);
    expect(rows.size).toBe(0);
  });
  it("denies anonymous import and backup before accessing storage",async()=>{
    for(const path of ["/api/archive/import","/api/archive/backup"]){
      const response=await worker.fetch(new Request("https://nora.example"+path),{} as Env,{} as ExecutionContext);
      expect(response.status).toBe(401);
    }
  });
});
