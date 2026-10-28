
/**
 * Type definitions for Nora's application.
 */

export interface Env {
  AI: Ai;

  DB: D1Database;

  TEAM_DOMAIN: string;
  POLICY_AUD: string;

  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
