import { Injectable, Logger } from '@nestjs/common';
import {
  AiSuggestionProvider,
  ProviderResult,
  SuggestWasteInput,
  SuggestYieldInput,
} from './types';

export interface GptOssRagConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  /** Override the model name sent in persisted rows + Swagger response. */
  modelName?: string;
  /** Override the model version pin. */
  modelVersion?: string;
  /** Optional fetch injection for tests. */
  fetcher?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5000;

interface RagResponseShape {
  value?: unknown;
  citationUrl?: unknown;
  snippet?: unknown;
}

/**
 * HTTP wrapper for the internal `gpt-oss-20b-rag` endpoint per Gate D 1a.
 *
 * Wire format consumed:
 *   POST  {baseUrl}/yield  body { organizationId, ingredientId, contextHash }
 *   POST  {baseUrl}/waste  body { organizationId, recipeId,     contextHash }
 *
 * Response (success):  { value: number, citationUrl: string, snippet: string }
 * Response (no result): HTTP 200 with `{ value: null }` OR HTTP 204
 *
 * The hybrid corpus + web-search fallback per Gate D 2c is the RAG
 * endpoint's responsibility — this client just enforces the iron-rule
 * contract on whatever the endpoint returns.
 *
 * Failure modes (network errors, 4xx/5xx, malformed body, timeout) MUST
 * surface as `null` so the controller serves "no suggestion available"
 * rather than crashing.
 */
@Injectable()
export class GptOssRagProvider implements AiSuggestionProvider {
  readonly id = 'gpt-oss-20b-rag';
  readonly modelName: string;
  readonly modelVersion: string;
  private readonly logger = new Logger(GptOssRagProvider.name);
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: GptOssRagConfig) {
    this.modelName = config.modelName ?? 'gpt-oss-20b-rag';
    this.modelVersion = config.modelVersion ?? '1.0';
    this.fetcher = config.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async suggestYield(input: SuggestYieldInput): Promise<ProviderResult | null> {
    return this.call('/yield', {
      organizationId: input.organizationId,
      ingredientId: input.ingredientId,
      contextHash: input.contextHash,
    });
  }

  async suggestWaste(input: SuggestWasteInput): Promise<ProviderResult | null> {
    return this.call('/waste', {
      organizationId: input.organizationId,
      recipeId: input.recipeId,
      contextHash: input.contextHash,
    });
  }

  private async call(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ProviderResult | null> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      const res = await this.fetcher(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 204) return null;
      if (!res.ok) {
        this.logger.warn(`RAG endpoint non-2xx ${res.status} on ${path}`);
        return null;
      }
      let parsed: RagResponseShape;
      try {
        parsed = (await res.json()) as RagResponseShape;
      } catch (err) {
        this.logger.warn(`RAG endpoint returned non-JSON on ${path}: ${(err as Error).message}`);
        return null;
      }
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        parsed.value === null ||
        parsed.value === undefined
      ) {
        // Endpoint reported "no suggestion" (no citation found within iron rule).
        return null;
      }
      const value = Number(parsed.value);
      if (!Number.isFinite(value)) return null;
      const citationUrl =
        typeof parsed.citationUrl === 'string' ? parsed.citationUrl : '';
      const snippet = typeof parsed.snippet === 'string' ? parsed.snippet : '';
      return { value, citationUrl, snippet };
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e.name === 'AbortError') {
        this.logger.warn(`RAG endpoint timeout (${timeoutMs}ms) on ${path}`);
      } else {
        this.logger.warn(`RAG endpoint error on ${path}: ${e.message ?? String(err)}`);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
