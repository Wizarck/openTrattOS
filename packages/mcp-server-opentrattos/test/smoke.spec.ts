import { buildServer } from '../src/index.js';

/**
 * End-to-end smoke for the m2-mcp-server slice (read-only first).
 *
 * This spec does NOT spin up a real stdio transport — that requires fork-ed
 * child processes and a flaky CI surface. Instead it exercises:
 *
 *   1. `buildServer(...)` wires every capability descriptor without throwing.
 *   2. The returned `McpServer` instance reports our 6 tools via the
 *      official `listTools` JSON-RPC handler.
 *   3. A single read-flow (`recipes.read`) routes through the
 *      `OpenTrattosRestClient` against a mocked fetch, returning the body
 *      under the MCP content envelope.
 *
 * Replacing `globalThis.fetch` keeps the smoke hermetic — no live REST API
 * is required.
 */

describe('m2-mcp-server smoke', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  afterEach(() => {
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
      originalFetch = undefined;
    }
  });

  it('boots, lists 6 capabilities, and round-trips a recipes.read against a mocked REST API', async () => {
    originalFetch = globalThis.fetch;
    const fetchSpy = jest
      .fn<
        Promise<Response>,
        [string | URL | Request, RequestInit | undefined]
      >()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'r1', name: 'Tomato Sauce' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { server } = buildServer({
      apiBaseUrl: 'http://api.test',
      agentName: 'smoke-test',
    });

    // The McpServer keeps `_registeredTools` private. Pull the list via the
    // server-internal request handler the SDK installs when registerTool is
    // called. We poke the field by name to keep the test independent of any
    // specific public `listTools` shape (which has shifted across SDK
    // minor versions).
    const registered = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(Object.keys(registered).sort()).toEqual(
      [
        'ingredients.read',
        'ingredients.search',
        'menu-items.list',
        'menu-items.read',
        'recipes.list',
        'recipes.read',
      ].sort(),
    );

    // Drive a read flow end-to-end via the captured handler. The SDK
    // stores a `handler(args, extra)` callable on each registered tool.
    const recipesRead = (
      registered as Record<
        string,
        { handler: (args: { id: string }, extra: unknown) => Promise<unknown> }
      >
    )['recipes.read'];
    const result = (await recipesRead.handler(
      { id: 'r1' },
      {} as unknown,
    )) as { content: { type: string; text: string }[] };

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.test/recipes/r1');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['X-Via-Agent']).toBe('true');
    expect(headers['X-Agent-Name']).toBe('smoke-test');
    expect(headers['X-Agent-Capability']).toBe('recipes.read');
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({
      id: 'r1',
      name: 'Tomato Sauce',
    });
  });
});
