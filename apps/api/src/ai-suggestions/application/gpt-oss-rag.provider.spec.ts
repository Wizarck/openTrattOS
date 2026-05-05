import { GptOssRagProvider } from './gpt-oss-rag.provider';

const ORG = '11111111-1111-4111-8111-111111111111';
const I = '22222222-2222-4222-8222-222222222222';

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

function makeFetcherStub(
  outcome:
    | { kind: 'json'; status: number; body: unknown }
    | { kind: 'no-content' }
    | { kind: 'network-error'; error: Error }
    | { kind: 'malformed-json' }
    | { kind: 'never' },
): { fetcher: typeof fetch; recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    recorded.push({ url: String(url), init });
    if (outcome.kind === 'json') {
      return new Response(JSON.stringify(outcome.body), {
        status: outcome.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (outcome.kind === 'no-content') {
      return new Response(null, { status: 204 });
    }
    if (outcome.kind === 'network-error') {
      throw outcome.error;
    }
    if (outcome.kind === 'malformed-json') {
      return new Response('not json {{{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // 'never' — wait until the AbortController fires (timeout test).
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  }) as typeof fetch;
  return { fetcher, recorded };
}

function buildProvider(fetcher: typeof fetch, opts: { apiKey?: string; timeoutMs?: number } = {}) {
  return new GptOssRagProvider({
    baseUrl: 'http://rag.local',
    apiKey: opts.apiKey,
    timeoutMs: opts.timeoutMs,
    fetcher,
  });
}

describe('GptOssRagProvider.suggestYield', () => {
  it('returns a parsed result on 200 with JSON body', async () => {
    const { fetcher, recorded } = makeFetcherStub({
      kind: 'json',
      status: 200,
      body: { value: 0.85, citationUrl: 'https://x', snippet: 'pelar capas externas' },
    });
    const provider = buildProvider(fetcher);
    const result = await provider.suggestYield({
      organizationId: ORG,
      ingredientId: I,
      contextHash: 'ctx',
    });
    expect(result).toEqual({
      value: 0.85,
      citationUrl: 'https://x',
      snippet: 'pelar capas externas',
    });
    expect(recorded[0].url).toBe('http://rag.local/yield');
    expect(recorded[0].init?.method).toBe('POST');
    const headers = recorded[0].init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('forwards Bearer apiKey when configured', async () => {
    const { fetcher, recorded } = makeFetcherStub({
      kind: 'json',
      status: 200,
      body: { value: 0.5, citationUrl: 'https://x', snippet: 's' },
    });
    const provider = buildProvider(fetcher, { apiKey: 'tok-42' });
    await provider.suggestYield({ organizationId: ORG, ingredientId: I, contextHash: 'ctx' });
    const headers = recorded[0].init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-42');
  });

  it('returns null on 204 No Content (RAG endpoint signalled "no suggestion")', async () => {
    const { fetcher } = makeFetcherStub({ kind: 'no-content' });
    const provider = buildProvider(fetcher);
    const result = await provider.suggestYield({
      organizationId: ORG,
      ingredientId: I,
      contextHash: 'ctx',
    });
    expect(result).toBeNull();
  });

  it('returns null on 200 with { value: null }', async () => {
    const { fetcher } = makeFetcherStub({
      kind: 'json',
      status: 200,
      body: { value: null },
    });
    const provider = buildProvider(fetcher);
    const result = await provider.suggestYield({
      organizationId: ORG,
      ingredientId: I,
      contextHash: 'ctx',
    });
    expect(result).toBeNull();
  });

  it('returns null on non-2xx status', async () => {
    const { fetcher } = makeFetcherStub({
      kind: 'json',
      status: 503,
      body: { error: 'unavailable' },
    });
    const provider = buildProvider(fetcher);
    const result = await provider.suggestYield({
      organizationId: ORG,
      ingredientId: I,
      contextHash: 'ctx',
    });
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    const { fetcher } = makeFetcherStub({
      kind: 'network-error',
      error: new Error('ECONNREFUSED'),
    });
    const provider = buildProvider(fetcher);
    const result = await provider.suggestYield({
      organizationId: ORG,
      ingredientId: I,
      contextHash: 'ctx',
    });
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    const { fetcher } = makeFetcherStub({ kind: 'malformed-json' });
    const provider = buildProvider(fetcher);
    const result = await provider.suggestYield({
      organizationId: ORG,
      ingredientId: I,
      contextHash: 'ctx',
    });
    expect(result).toBeNull();
  });

  it('returns null on timeout', async () => {
    const { fetcher } = makeFetcherStub({ kind: 'never' });
    const provider = buildProvider(fetcher, { timeoutMs: 50 });
    const result = await provider.suggestYield({
      organizationId: ORG,
      ingredientId: I,
      contextHash: 'ctx',
    });
    expect(result).toBeNull();
  });

  it('strips trailing slash from baseUrl', async () => {
    const { fetcher, recorded } = makeFetcherStub({
      kind: 'json',
      status: 200,
      body: { value: 0.5, citationUrl: 'https://x', snippet: 's' },
    });
    const provider = new GptOssRagProvider({
      baseUrl: 'http://rag.local/',
      fetcher,
    });
    await provider.suggestYield({ organizationId: ORG, ingredientId: I, contextHash: 'ctx' });
    expect(recorded[0].url).toBe('http://rag.local/yield');
  });
});

describe('GptOssRagProvider.suggestWaste', () => {
  it('hits /waste with recipeId in body', async () => {
    const { fetcher, recorded } = makeFetcherStub({
      kind: 'json',
      status: 200,
      body: { value: 0.05, citationUrl: 'https://x', snippet: 'salteado pierde 5%' },
    });
    const provider = buildProvider(fetcher);
    const result = await provider.suggestWaste({
      organizationId: ORG,
      recipeId: 'rec-1',
      contextHash: 'ctx',
    });
    expect(result?.value).toBe(0.05);
    expect(recorded[0].url).toBe('http://rag.local/waste');
    const body = JSON.parse(recorded[0].init?.body as string);
    expect(body).toEqual({
      organizationId: ORG,
      recipeId: 'rec-1',
      contextHash: 'ctx',
    });
  });
});

describe('GptOssRagProvider model identity', () => {
  it('exposes default modelName + modelVersion', () => {
    const provider = new GptOssRagProvider({
      baseUrl: 'http://x',
      fetcher: jest.fn() as never,
    });
    expect(provider.modelName).toBe('gpt-oss-20b-rag');
    expect(provider.modelVersion).toBe('1.0');
    expect(provider.id).toBe('gpt-oss-20b-rag');
  });

  it('honours overridden modelName + modelVersion', () => {
    const provider = new GptOssRagProvider({
      baseUrl: 'http://x',
      modelName: 'custom-gpt',
      modelVersion: '2.5',
      fetcher: jest.fn() as never,
    });
    expect(provider.modelName).toBe('custom-gpt');
    expect(provider.modelVersion).toBe('2.5');
  });
});
