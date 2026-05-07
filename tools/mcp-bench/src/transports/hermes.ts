import type { CapabilityCall, Transport } from '../lib/types.js';

interface HermesConfig {
  baseUrl: string;
  authSecret: string;
  bankId: string;
  userId: string;
}

/**
 * Hermes adapter — talks to the `web_via_http_sse` platform shipped in
 * Wave 1.13 [3b]. Each MCP capability call is one POST + SSE consumption.
 *
 * The transport reuses the Hermes shared secret (NOT per-agent signing) —
 * the bench is operational tooling and runs from the same trusted host
 * that holds the ops secrets. For per-agent signing, use the
 * AgentSignatureMiddleware contract directly via the apps/api REST surface.
 */
export class HermesTransport implements Transport {
  readonly name = 'hermes';

  constructor(private readonly config: HermesConfig) {}

  get version(): string {
    return process.env.HERMES_VERSION ?? 'unknown';
  }

  async connect(): Promise<void> {
    // No persistent connection — each call opens its own POST. We do issue
    // one health probe so a bad URL surfaces immediately rather than
    // disguising itself as a per-call error rate.
    const probe = await fetch(new URL('/health', this.config.baseUrl), {
      method: 'GET',
    });
    if (!probe.ok) {
      throw new Error(`hermes /health returned ${probe.status}`);
    }
  }

  async invoke(call: CapabilityCall): Promise<unknown> {
    const sessionId = `bench-${Date.now().toString(36)}`;
    const body = {
      bank_id: this.config.bankId,
      user_attribution: { user_id: this.config.userId, display_name: 'mcp-bench' },
      message: {
        type: 'text',
        content: `Invoke MCP capability ${call.capability} with ${JSON.stringify(call.args)}`,
      },
    };
    const url = new URL(`/web/${sessionId}`, this.config.baseUrl);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'x-web-auth-secret': this.config.authSecret,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`hermes ${call.capability} → HTTP ${res.status}`);
    }
    if (!res.body) {
      throw new Error(`hermes ${call.capability} → empty body`);
    }
    // Drain the SSE response and resolve when `event: done` arrives. We
    // do not parse the agent's tool-call output — the bench is measuring
    // round-trip latency, not agent reasoning quality.
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes('event: done')) break;
    }
    return { ok: true };
  }

  async disconnect(): Promise<void> {
    // No-op — fetch closes its own sockets.
  }
}
