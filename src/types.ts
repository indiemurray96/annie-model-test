/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
    AI: Ai;

    DB: D1Database;

    ASSETS: {
        fetch: (request: Request) => Promise<Response>;
    };
}

	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
