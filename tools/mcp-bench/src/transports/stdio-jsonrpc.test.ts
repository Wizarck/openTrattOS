import { describe, expect, it } from 'vitest';
import { StdioJsonRpcTransport } from './stdio-jsonrpc.js';

describe('StdioJsonRpcTransport — frame parser (smoke)', () => {
  it('resolves a pending call when the matching JSON-RPC response arrives', async () => {
    const transport = new StdioJsonRpcTransport({
      name: 'fake',
      version: '0',
      command: 'node',
      args: [],
    });
    // Fake the child process — the call() helper is private but feeding
    // bytes through onData() exercises the parser without spawn.
    const callP = (transport as unknown as {
      call(method: string, params: unknown): Promise<unknown>;
    }).call('initialize', {});
    // We never actually wrote to stdin — bypass the write step by manually
    // feeding the response. The pending map is keyed on id=1 (first call).
    transport.onData('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05"}}\n');
    const result = await callP;
    expect(result).toEqual({ protocolVersion: '2024-11-05' });
  });

  it('rejects a pending call when the response carries an error', async () => {
    const transport = new StdioJsonRpcTransport({
      name: 'fake',
      version: '0',
      command: 'node',
      args: [],
    });
    const callP = (transport as unknown as {
      call(method: string, params: unknown): Promise<unknown>;
    }).call('tools/call', {});
    transport.onData('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"tool not found"}}\n');
    await expect(callP).rejects.toThrow(/tool not found/);
  });

  it('handles multiple frames in one chunk', () => {
    const transport = new StdioJsonRpcTransport({
      name: 'fake',
      version: '0',
      command: 'node',
      args: [],
    });
    // Two responses in one chunk should each find their own pending entry.
    const p1 = (transport as unknown as {
      call(method: string, params: unknown): Promise<unknown>;
    }).call('a', {});
    const p2 = (transport as unknown as {
      call(method: string, params: unknown): Promise<unknown>;
    }).call('b', {});
    transport.onData(
      '{"jsonrpc":"2.0","id":1,"result":1}\n{"jsonrpc":"2.0","id":2,"result":2}\n',
    );
    return Promise.all([p1, p2]).then(([r1, r2]) => {
      expect(r1).toBe(1);
      expect(r2).toBe(2);
    });
  });

  it('ignores malformed lines without crashing', () => {
    const transport = new StdioJsonRpcTransport({
      name: 'fake',
      version: '0',
      command: 'node',
      args: [],
    });
    // Should not throw.
    transport.onData('not json\n{"jsonrpc":"2.0","id":99,"result":null}\n');
  });
});
