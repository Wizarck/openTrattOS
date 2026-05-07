import { spawn, type ChildProcess } from 'node:child_process';
import type { CapabilityCall, Transport } from '../lib/types.js';

interface StdioConfig {
  /** Display name surfaced in reports (`claude-desktop`, `opencode`). */
  name: string;
  /** Free-form version string surfaced in reports. */
  version: string;
  /** Absolute path or PATH-resolvable command to spawn. */
  command: string;
  /** Argv passed to the spawned process. */
  args: string[];
  /** Optional env overrides. Merged with parent env. */
  env?: Record<string, string>;
}

/**
 * Generic stdio JSON-RPC adapter. Both Claude Desktop's MCP client and
 * OpenCode use line-delimited JSON-RPC 2.0 over stdin/stdout per the MCP
 * spec. Concrete adapters are thin factories around this.
 *
 * Lifecycle:
 *   - `connect()` spawns the child, sends `initialize`, awaits the response.
 *   - `invoke()` sends `tools/call` with the capability name + args.
 *   - `disconnect()` writes `shutdown` (best-effort) then SIGTERMs after
 *     a 2s grace, SIGKILLs after another 5s.
 *
 * Failures are surfaced as `Error` rejections — the harness logs them as
 * per-call errors and continues. Adapter-spawn failures (binary not
 * found, handshake refused) are rejected from `connect()` so the harness
 * can mark the run "INCOMPLETE" without corrupting downstream stats.
 */
export class StdioJsonRpcTransport implements Transport {
  private child: ChildProcess | null = null;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (err: Error) => void }
  >();

  constructor(private readonly config: StdioConfig) {}

  get name(): string {
    return this.config.name;
  }

  get version(): string {
    return this.config.version;
  }

  async connect(): Promise<void> {
    this.child = spawn(this.config.command, this.config.args, {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
    this.child.on('exit', (code) => {
      // Reject all pending calls — the child died on us.
      const err = new Error(`${this.config.name} exited (code=${code ?? 'null'})`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
    this.child.on('error', (err) => {
      const wrapped = new Error(`${this.config.name} spawn error: ${err.message}`);
      for (const p of this.pending.values()) p.reject(wrapped);
      this.pending.clear();
    });

    // Initialize handshake. Per MCP spec we send {protocolVersion, ...}.
    await this.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-bench', version: '0.1.0' },
    });
  }

  async invoke(call: CapabilityCall): Promise<unknown> {
    if (!this.child) {
      throw new Error(`${this.config.name} not connected`);
    }
    return this.call('tools/call', { name: call.capability, arguments: call.args });
  }

  async disconnect(): Promise<void> {
    if (!this.child) return;
    try {
      // Best-effort shutdown notification. Some MCP servers ignore this.
      await Promise.race([
        this.call('shutdown', {}),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    } catch {
      // Ignore — the child may have already exited.
    }
    const child = this.child;
    this.child = null;
    if (!child.killed) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${this.config.name} ${method} timeout (10s)`));
        }
      }, 10_000);
      this.child?.stdin?.write(msg, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  /** Visible for tests — feed bytes into the parser as if from stdout. */
  onData(text: string): void {
    this.buffer += text;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let parsed: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof parsed.id !== 'number') continue;
      const waiter = this.pending.get(parsed.id);
      if (!waiter) continue;
      this.pending.delete(parsed.id);
      if (parsed.error) {
        waiter.reject(new Error(parsed.error.message ?? 'rpc error'));
      } else {
        waiter.resolve(parsed.result);
      }
    }
  }
}

/** Concrete factory for Claude Desktop's MCP stdio mode. */
export function claudeDesktopTransport(): StdioJsonRpcTransport {
  return new StdioJsonRpcTransport({
    name: 'claude-desktop',
    version: process.env.CLAUDE_DESKTOP_VERSION ?? 'unknown',
    command: process.env.CLAUDE_DESKTOP_BIN ?? 'claude-desktop',
    args: ['--mcp-stdio'],
  });
}

/** Concrete factory for OpenCode's MCP stdio mode. */
export function opencodeTransport(): StdioJsonRpcTransport {
  return new StdioJsonRpcTransport({
    name: 'opencode',
    version: process.env.OPENCODE_VERSION ?? 'unknown',
    command: process.env.OPENCODE_BIN ?? 'opencode',
    args: ['mcp', '--stdio'],
  });
}
