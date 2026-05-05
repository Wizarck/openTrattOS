import { EventEmitter2 } from '@nestjs/event-emitter';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { AGENT_ACTION_EXECUTED } from '../../cost/application/cost.events';
import { AgentAuditMiddleware } from './agent-audit.middleware';

function makeReq(
  headers: Record<string, string | string[] | undefined>,
  user?: { userId: string; organizationId: string; role: string },
): Request {
  return { headers, user } as unknown as Request;
}

const noopRes = {} as Response;

describe('AgentAuditMiddleware', () => {
  let events: EventEmitter2;
  let middleware: AgentAuditMiddleware;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    events = new EventEmitter2();
    middleware = new AgentAuditMiddleware(events);
    emitSpy = jest.spyOn(events, 'emit');
  });

  it('is a no-op when agent headers are absent (non-agent traffic untouched)', () => {
    const req = makeReq({});
    const next = jest.fn();
    middleware.use(req, noopRes, next as NextFunction);
    expect(req.agentContext).toBeUndefined();
    expect(emitSpy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('populates req.agentContext + emits AGENT_ACTION_EXECUTED when headers present', () => {
    const req = makeReq(
      {
        'x-via-agent': 'true',
        'x-agent-name': 'claude-desktop',
        'x-agent-capability': 'recipes.read',
      },
      {
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        role: 'MANAGER',
      },
    );
    const next = jest.fn();
    middleware.use(req, noopRes, next as NextFunction);

    expect(req.agentContext).toEqual({
      viaAgent: true,
      agentName: 'claude-desktop',
      capabilityName: 'recipes.read',
    });
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      AGENT_ACTION_EXECUTED,
      expect.objectContaining({
        executedBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        viaAgent: true,
        agentName: 'claude-desktop',
        capabilityName: 'recipes.read',
      }),
    );
    const payload = emitSpy.mock.calls[0][1];
    expect(typeof payload.timestamp).toBe('string');
    expect(() => new Date(payload.timestamp)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('emits with executedBy=null + organizationId=null when request is unauthenticated', () => {
    const req = makeReq({
      'x-via-agent': 'true',
      'x-agent-name': 'hermes',
    });
    middleware.use(req, noopRes, jest.fn() as NextFunction);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    const payload = emitSpy.mock.calls[0][1];
    expect(payload.executedBy).toBeNull();
    expect(payload.organizationId).toBeNull();
    expect(payload.capabilityName).toBeNull();
  });

  it('does NOT 5xx and does NOT emit when X-Via-Agent is set but X-Agent-Name is missing (malformed)', () => {
    const req = makeReq({ 'x-via-agent': 'true' });
    const next = jest.fn();
    expect(() =>
      middleware.use(req, noopRes, next as NextFunction),
    ).not.toThrow();
    expect(req.agentContext).toBeUndefined();
    expect(emitSpy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('treats X-Via-Agent: false as non-agent traffic', () => {
    const req = makeReq({
      'x-via-agent': 'false',
      'x-agent-name': 'spoofed',
    });
    middleware.use(req, noopRes, jest.fn() as NextFunction);
    expect(req.agentContext).toBeUndefined();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('accepts truthy variants of X-Via-Agent (1, yes, TRUE)', () => {
    for (const flag of ['1', 'yes', 'TRUE']) {
      events = new EventEmitter2();
      middleware = new AgentAuditMiddleware(events);
      emitSpy = jest.spyOn(events, 'emit');
      const req = makeReq({
        'x-via-agent': flag,
        'x-agent-name': 'a',
      });
      middleware.use(req, noopRes, jest.fn() as NextFunction);
      expect(emitSpy).toHaveBeenCalledTimes(1);
    }
  });
});

describe('no-import-agent-vendors-from-api lint rule', () => {
  it('is registered against @modelcontextprotocol/* in apps/api/eslint.config.mjs', () => {
    const cfgPath = path.resolve(__dirname, '../../../eslint.config.mjs');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    expect(raw).toContain('no-restricted-imports');
    expect(raw).toMatch(/@modelcontextprotocol\/\*/);
  });

  it('the lint regression fixture exists and imports the blocked package', () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../__test_fixtures__/agent-vendor-import.fixture.ts',
    );
    const raw = fs.readFileSync(fixturePath, 'utf8');
    expect(raw).toMatch(/@modelcontextprotocol\/sdk/);
  });

  it('fires `no-restricted-imports` when ESLint CLI is run against the fixture', () => {
    // Shells out to the ESLint CLI rather than loading the (ESM-only) Node
    // API from CommonJS jest. The fixture is excluded from the default
    // `src/**/*.ts` glob so CI lint stays green; this test re-includes it
    // explicitly via `--no-ignore` + an explicit file argument and asserts
    // the rule violation is reported. Failure here means the
    // `no-import-agent-vendors-from-api` enforcement has regressed.
    const apiRoot = path.resolve(__dirname, '../../..');
    const repoRoot = path.resolve(apiRoot, '..', '..');
    const fixturePath = path.join(
      apiRoot,
      'src',
      '__test_fixtures__',
      'agent-vendor-import.fixture.ts',
    );

    // Resolve the ESLint CLI JS entrypoint directly so we don't depend on
    // platform-specific shim choice (eslint vs eslint.cmd vs eslint.ps1).
    // require.resolve walks the Node module graph from the apps/api cwd,
    // which works for both hoisted (root node_modules) and non-hoisted
    // installs.
    const eslintPkgPath = require.resolve('eslint/package.json', {
      paths: [apiRoot, repoRoot],
    });
    const eslintPkg = JSON.parse(fs.readFileSync(eslintPkgPath, 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    const binRel =
      typeof eslintPkg.bin === 'string'
        ? eslintPkg.bin
        : (eslintPkg.bin?.eslint ?? 'bin/eslint.js');
    const eslintCli = path.resolve(path.dirname(eslintPkgPath), binRel);

    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execFileSync(
        process.execPath,
        [eslintCli, '--no-ignore', '--format', 'json', fixturePath],
        { cwd: apiRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      const e = err as { status?: number; stdout?: Buffer | string };
      exitCode = e.status ?? 1;
      stdout =
        typeof e.stdout === 'string'
          ? e.stdout
          : (e.stdout?.toString('utf8') ?? '');
    }

    expect(exitCode).not.toBe(0);
    expect(stdout.trim()).not.toBe('');
    const results = JSON.parse(stdout) as Array<{
      filePath: string;
      messages: Array<{ ruleId: string | null; message: string }>;
    }>;
    expect(results.length).toBeGreaterThan(0);
    const violations = results
      .flatMap((r) => r.messages)
      .filter((m) => m.ruleId === 'no-restricted-imports');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toMatch(/@modelcontextprotocol/);
  }, 60000);
});
