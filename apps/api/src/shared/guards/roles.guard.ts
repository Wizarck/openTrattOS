import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../iam/domain/user.entity';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator';

export interface AuthenticatedUserPayload {
  userId: string;
  organizationId: string;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUserPayload;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_METADATA_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // No @Roles decorator → no role gate. Auth still required (the auth pipe
    // populates request.user); endpoints that should be public must declare
    // @Public separately (out of scope for M1).
    if (!required || required.length === 0) {
      return true;
    }

    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUserPayload }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        details: { required, actual: user.role },
      });
    }
    return true;
  }
}
