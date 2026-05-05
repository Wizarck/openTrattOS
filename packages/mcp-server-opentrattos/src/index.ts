import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenTrattosRestClient } from './http-client.js';
import { registerRecipesCapabilities } from './capabilities/recipes.js';
import { registerMenuItemsCapabilities } from './capabilities/menu-items.js';
import { registerIngredientsCapabilities } from './capabilities/ingredients.js';

/**
 * MCP server `opentrattos` — m2-mcp-server (read-only first per Gate D).
 *
 * `buildServer` is the test-friendly factory — it returns an `McpServer`
 * with every capability descriptor wired against a single
 * `OpenTrattosRestClient`. The stdio bootstrap lives in `server.ts` so this
 * module can be `import`-ed by tests without triggering side effects.
 *
 * Configuration is environment-only — see the README for the env-var matrix.
 */
export interface ServerOptions {
  apiBaseUrl: string;
  agentName: string;
  authToken?: string;
}

export function buildServer(options: ServerOptions): {
  server: McpServer;
  rest: OpenTrattosRestClient;
} {
  const rest = new OpenTrattosRestClient({
    baseUrl: options.apiBaseUrl,
    agentName: options.agentName,
    authToken: options.authToken,
  });

  const server = new McpServer({
    name: 'opentrattos',
    version: '0.1.0',
  });

  registerRecipesCapabilities(server, rest);
  registerMenuItemsCapabilities(server, rest);
  registerIngredientsCapabilities(server, rest);

  return { server, rest };
}

export function readOptionsFromEnv(): ServerOptions {
  return {
    apiBaseUrl:
      process.env['OPENTRATTOS_API_BASE_URL'] ?? 'http://localhost:3000',
    agentName:
      process.env['OPENTRATTOS_AGENT_NAME'] ?? 'opentrattos-mcp-server',
    authToken: process.env['OPENTRATTOS_AGENT_AUTH_TOKEN'],
  };
}
