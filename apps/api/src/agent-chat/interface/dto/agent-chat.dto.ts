import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export type ChatMessageType = 'text' | 'image' | 'multipart';

/**
 * Wire shape for one message turn from the browser. The widget builds this and
 * apps/api forwards it to Hermes' `web_via_http_sse` platform with the
 * `bank_id` injected server-side per organization.
 */
export class ChatMessageDto {
  @IsString()
  @IsIn(['text', 'image', 'multipart'])
  type!: ChatMessageType;

  /**
   * For `type=text`: the message string. For `image` / `multipart`: an object
   * `{ text, imageData? }` where `imageData` is a base64-encoded JPEG/PNG.
   * The relay does not interpret `content` — it forwards as-is to Hermes.
   */
  content!: string | { text?: string; imageData?: string };
}

export class ChatRequestDto {
  @IsObject()
  message!: ChatMessageDto;

  /**
   * Optional client-supplied session id. When omitted, the relay derives
   * a stable id from `${userId}:${organizationId}` so a page refresh in the
   * same tab continues the same Hermes session.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  /**
   * Optional metadata passthrough. Forwarded to Hermes' `metadata` field,
   * useful for surface-aware context (e.g. `{ initialContext: 'recipe', recipeId }`).
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * Discriminated union of SSE events the relay emits to the browser. Each
 * one mirrors a Hermes-side event 1:1, plus a synthetic `error` for
 * relay-side failures (Hermes timeout, transport error, etc.).
 */
export type ChatSseEvent =
  | { event: 'token'; data: { chunk: string } }
  | { event: 'tool-calling'; data: { tool: string } }
  | { event: 'proactive'; data: { text: string } }
  | { event: 'image'; data: { url: string; caption?: string } }
  | { event: 'done'; data: { finishReason: string } }
  | { event: 'error'; data: { code: string; message: string } };
