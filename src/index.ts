/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

import { verifyUser } from "./access";
import { importArchive, archiveStatus, archiveBackup, recallArchiveContext } from "./memory";
import { beginTurn, completeTurn, listConversations, getConversation, deleteConversation, recallFindingsContext, ConversationNotFound } from "./continuity";
import { MODEL_ID, RESPONSE_VERSION, buildModelMessages } from "./prompt";


export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes

const authenticatedUserId = await verifyUser(request, env);

if (!authenticatedUserId) {
  return Response.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: { "cache-control": "no-store" }
    }
  );
}

		

if (url.pathname === "/api/archive/import" && request.method === "POST") return importArchive(request, env, authenticatedUserId);
if (url.pathname === "/api/archive/status" && request.method === "GET") return archiveStatus(env, authenticatedUserId);
if (url.pathname === "/api/archive/backup" && request.method === "GET") return archiveBackup(env, authenticatedUserId);

if (url.pathname === "/api/conversations" && request.method === "GET") return listConversations(env.DB, authenticatedUserId);
const conversationMatch = url.pathname.match(/^\/api\/conversations\/([0-9a-f-]{36})$/i);
if (conversationMatch && request.method === "GET") return getConversation(env.DB, authenticatedUserId, conversationMatch[1]);
if (conversationMatch && request.method === "DELETE") {
  if (request.headers.get("origin") !== url.origin) return Response.json({error:"Forbidden"},{status:403});
  return deleteConversation(env.DB, authenticatedUserId, conversationMatch[1]);
}

if (url.pathname === "/api/memory-check") {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405
    });
  }

  try {
    const result = await env.DB
      .prepare("SELECT COUNT(*) AS total FROM conversations")
      .first<{ total: number }>();

    return Response.json(
      {
        connected: true,
        conversations: result?.total ?? 0
      },
      {
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    console.error("D1 connection failed:", error);

    return Response.json(
      { connected: false },
      { status: 500 }
    );
  }
}

		if (url.pathname === "/api/chat") {
			// Handle POST requests for chat
			if (request.method === "POST") {
				return handleChatRequest(request, env, ctx, authenticatedUserId);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
function parseModelDelta(data: string): string {
  try {
    const parsed = JSON.parse(data) as {response?:string; choices?:Array<{delta?:{content?:string}}>};
    return typeof parsed.response === "string" ? parsed.response : (parsed.choices?.[0]?.delta?.content ?? "");
  } catch { return ""; }
}

async function captureAnswer(stream: ReadableStream<Uint8Array>, db: D1Database, owner: string,
  id: string, question: string): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "", answer = "", completed = false;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream:true}).replace(/\r/g,"");
      let next: number;
      while ((next = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0,next); buffer = buffer.slice(next+2);
        const data = event.split("\n").filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trimStart()).join("\n");
        if (data === "[DONE]") { completed = true; continue; }
        answer += parseModelDelta(data);
      }
    }
    if (buffer.trim()) {
      const data = buffer.split("\n").filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trimStart()).join("\n");
      if (data === "[DONE]") completed = true;
      else answer += parseModelDelta(data);
    }
    // A fully terminated stream without a DONE marker can still carry an entire answer.
    if (answer.trim() && (completed || !buffer.trim())) await completeTurn(db,owner,id,question,answer);
  } catch (err) {
    console.error("Unable to persist assistant response",err);
  } finally { reader.releaseLock(); }
}

async function handleChatRequest(request: Request, env: Env, ctx: ExecutionContext, ownerSub: string): Promise<Response> {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({error:"Forbidden"},{status:403});
    const input = await request.json() as {message?: unknown; conversationId?: unknown};
    if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 12000)
      return Response.json({error:"Message must contain 1–12000 characters"},{status:400});
    let turn: Awaited<ReturnType<typeof beginTurn>>;
    try { turn = await beginTurn(env.DB,ownerSub,input.conversationId,input.message.trim()); }
    catch (err) {
      if (err instanceof ConversationNotFound) return Response.json({error:"Conversation not found"},{status:404});
      throw err;
    }
    const recalled = await recallArchiveContext(env,ownerSub,input.message);
    const previous = await recallFindingsContext(env.DB,ownerSub,input.message,turn.chatId);
    const modelMessages: ChatMessage[] = buildModelMessages(turn.messages, recalled, previous);
    const inputs = {messages:modelMessages,max_tokens:1024,stream:true} satisfies AiTextGenerationInput & {stream:true};
    const stream = await env.AI.run<typeof MODEL_ID>(MODEL_ID,inputs);
    const [clientStream,savedStream] = stream.tee();
    ctx.waitUntil(captureAnswer(savedStream,env.DB,ownerSub,turn.chatId,input.message.trim()));
    return new Response(clientStream,{headers:{
      "content-type":"text/event-stream; charset=utf-8",
      "cache-control":"no-store",
      "x-annie-conversation-id":turn.chatId,
      "x-annie-model":MODEL_ID,
      "x-annie-response-version":RESPONSE_VERSION
    }});
  } catch(error) {
    console.error("Annie chat failure",error);
    return Response.json({error:"Unable to process chat"},{status:500,headers:{"cache-control":"no-store"}});
  }
}
