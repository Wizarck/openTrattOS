import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUserPayload } from '../guards/roles.guard';

const DEMO_ORG_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_OWNER_USER_ID = '00000000-0000-4000-8000-000000000002';

/**
 * Demo-mode auth middleware — populates `req.user` with the seed OWNER when
 * `DEMO_MODE=true` env is set AND no other auth pipe has already populated
 * the user. Pairs with `apps/api/src/cli/seed-demo.ts` (run via
 * migrate-and-start.sh when DEMO_MODE=true) so the IDs match a real row in
 * the `users` + `organizations` tables.
 *
 * Behaviour gating:
 *   - DEMO_MODE !== 'true'  → middleware is a no-op (auth flows through the
 *     real pipe when implemented; today, RolesGuard will 401 on protected
 *     routes — which is the correct posture for prod with auth enabled).
 *   - DEMO_MODE === 'true'  → if no req.user, inject the seed OWNER context.
 *
 * NOT for production with multiple tenants — by definition every request is
 * authenticated as the single demo owner. Roadmap R8 replaces this with a
 * real auth flow (cloudflared Access policy or JWT) before any non-demo
 * tenant comes online.
 */
@Injectable()
export class DemoAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DemoAuthMiddleware.name);
  private readonly enabled = String(process.env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';
  private warned = false;

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!this.enabled) {
      next();
      return;
    }
    if (req.user) {
      // Another auth pipe already populated it — respect that.
      next();
      return;
    }
    const payload: AuthenticatedUserPayload = {
      userId: DEMO_OWNER_USER_ID,
      organizationId: DEMO_ORG_ID,
      role: 'OWNER',
    };
    req.user = payload;
    if (!this.warned) {
      this.logger.warn(
        'DEMO_MODE=true — every request is authenticated as the seed OWNER. NOT for prod with real tenants.',
      );
      this.warned = true;
    }
    next();
  }
}
