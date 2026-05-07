import { Injectable, NestMiddleware } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NextFunction, Request, Response } from 'express';
import {
  AGENT_ACTION_EXECUTED,
  AgentActionExecutedEvent,
} from '../../cost/application/cost.events';
import { AuthenticatedUserPayload } from '../guards/roles.guard';

/**
 * Per-request agent attribution context, populated by `AgentAuditMiddleware`
 * when the incoming request carries the `X-Via-Agent` + `X-Agent-Name`
 * headers. Downstream code (controllers, services, future audit-log writer)
 * MAY read `req.agentContext` to enrich behaviour or persistence — but MUST
 * NOT depend on it (non-agent traffic leaves it `undefined`).
 *
 * `capabilityName` is the optional MCP capability descriptor lifted from
 * `X-Agent-Capability` (e.g. `recipes.read`). When the header is missing the
 * field is `null`.
 */
export interface AgentContext {
  viaAgent: true;
  agentName: string;
  capabilityName: string | null;
  /**
   * True when `AgentSignatureMiddleware` (Wave 1.13 [3c]) verified the
   * Ed25519 signature against a registered `agent_credentials` row.
   * Absent / false when the request flowed through the legacy 3a unsigned
   * path. Downstream code that needs strong attribution guarantees should
   * gate on this flag.
   */
  signatureVerified?: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    agentContext?: AgentContext;
  }
}

const HEADER_VIA_AGENT = 'x-via-agent';
const HEADER_AGENT_NAME = 'x-agent-name';
const HEADER_AGENT_CAPABILITY = 'x-agent-capability';

function readHeader(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (raw === undefined) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function isTruthyFlag(value: string | null): boolean {
  if (value === null) return false;
  const normalised = value.trim().toLowerCase();
  return normalised === 'true' || normalised === '1' || normalised === 'yes';
}

/**
 * Reads the agent attribution headers, populates `req.agentContext`, and
 * emits `AGENT_ACTION_EXECUTED` so a future audit-log listener can persist
 * the row when the table lands.
 *
 * Behaviour rules:
 * - No-op when the agent headers are absent — non-agent UI/REST traffic is
 *   completely unaffected.
 * - Never throws / 5xx on missing or malformed headers; the worst case is
 *   the middleware silently skips the agent path.
 * - Does NOT verify a signed agent identity (deferred to M3 per design.md
 *   Open Question + Risks). Consumers that need authenticity guarantees
 *   MUST run additional checks; this slice operates in trusted-internal
 *   network mode only.
 *
 * Wired in `AppModule.configure(consumer)` against `forRoutes('*')` so it
 * runs ahead of all controllers regardless of module.
 */
@Injectable()
export class AgentAuditMiddleware implements NestMiddleware {
  constructor(private readonly events: EventEmitter2) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const viaAgentHeader = readHeader(req, HEADER_VIA_AGENT);
    if (!isTruthyFlag(viaAgentHeader)) {
      next();
      return;
    }

    const agentName = readHeader(req, HEADER_AGENT_NAME);
    if (!agentName || agentName.trim() === '') {
      // X-Via-Agent without a name is malformed; do not populate context, do
      // not emit. Fall through so the request still completes — downstream
      // RBAC remains the authoritative gate.
      next();
      return;
    }

    const capabilityName = readHeader(req, HEADER_AGENT_CAPABILITY);
    const trimmedCapability =
      capabilityName && capabilityName.trim() !== ''
        ? capabilityName.trim()
        : null;

    // Preserve a previously-verified context. Wave 1.13 [3c]'s
    // AgentSignatureMiddleware runs ahead of this one and stamps
    // signatureVerified=true with the agentName lifted from the verified
    // credential. Overwriting here would lose the stronger attribution
    // and let a tampered X-Agent-Name spoof the signed identity.
    if (req.agentContext?.signatureVerified !== true) {
      req.agentContext = {
        viaAgent: true,
        agentName: agentName.trim(),
        capabilityName: trimmedCapability,
      };
    }

    const ctx = req.agentContext;
    const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
    const payload: AgentActionExecutedEvent = {
      executedBy: user?.userId ?? null,
      viaAgent: true,
      agentName: ctx?.agentName ?? agentName.trim(),
      capabilityName: ctx?.capabilityName ?? trimmedCapability,
      organizationId: user?.organizationId ?? null,
      timestamp: new Date().toISOString(),
    };

    this.events.emit(AGENT_ACTION_EXECUTED, payload);

    next();
  }
}
