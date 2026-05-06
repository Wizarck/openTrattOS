/**
 * Wave 1.13 [3b] — `AgentChatWidget`. Feature-flagged web chat sidesheet
 * that consumes the apps/api `POST /agent-chat/stream` SSE relay.
 *
 * The widget is presentational. The consumer (apps/web's `useAgentChat`
 * hook) owns the SSE connection and provides a single async-iterable
 * callback `onSend` per turn. The widget renders state transitions
 * (closed / open / streaming / tool-calling) and surfaces multimodal
 * input (text + image).
 */

export type ChatRole = 'user' | 'agent';

export interface ChatBubbleAttachment {
  /** base64-encoded image data, mime-type sniffed from the data URL prefix. */
  imageDataUrl: string;
}

export interface ChatBubble {
  id: string;
  role: ChatRole;
  /** Plain text content (concatenated incrementally during streaming). */
  text: string;
  /** Optional image attachment on the user-side bubble. */
  attachment?: ChatBubbleAttachment;
  /** Inline tool-calling note rendered above the agent text bubble. */
  toolNote?: string;
}

/**
 * Discriminated union mirroring the apps/api wire format. The consumer's
 * `onSend` async-iterable yields these as Hermes streams them back.
 */
export type ChatSseEvent =
  | { event: 'token'; data: { chunk: string } }
  | { event: 'tool-calling'; data: { tool: string } }
  | { event: 'proactive'; data: { text: string } }
  | { event: 'image'; data: { url: string; caption?: string } }
  | { event: 'done'; data: { finishReason: string } }
  | { event: 'error'; data: { code: string; message: string } };

export interface SendRequest {
  message:
    | { type: 'text'; content: string }
    | { type: 'image'; content: { text: string; imageData: string } }
    | { type: 'multipart'; content: { text: string; imageData: string } };
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentChatWidgetProps {
  /**
   * Runtime config flag. When `false` the component renders `null` (no
   * FAB, no listener, no SSE). Defence in depth alongside the apps/api
   * 404 path; this prop is the single source of truth on the client.
   */
  agentEnabled: boolean;
  organizationId: string;
  userId: string;
  /**
   * Surface-aware launch context. Forwarded to the agent as metadata so
   * a recipe screen can prompt "you're on the Bolognesa recipe; ask
   * about its margin, allergens, or yield."
   */
  initialContext?: 'recipe' | 'menu' | 'none';
  /**
   * Per-turn send callback. The widget calls this once per user message
   * and consumes the returned async-iterable to render token-by-token.
   * The consumer owns the SSE fetch / stream.
   */
  onSend: (req: SendRequest) => AsyncIterable<ChatSseEvent>;
  className?: string;
}
