import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedUserPayload } from '../guards/roles.guard';

/**
 * Strips `createdBy` / `updatedBy` from any request body and re-injects them
 * from the authenticated JWT user claim. The single source of truth for
 * audit fields is the auth pipe; DTOs that try to forge audit values are
 * silently overwritten.
 *
 * Skips read-only verbs (GET / HEAD / OPTIONS) — those don't mutate.
 *
 * Throws 401 when a mutating verb is invoked without an authenticated user
 * (since audit information would be undeterminable).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const request = http.getRequest<{ method?: string; user?: AuthenticatedUserPayload; body?: Record<string, unknown> }>();
    const method = (request.method ?? '').toUpperCase();

    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }

    const body = (request.body ??= {});
    delete body['createdBy'];
    delete body['updatedBy'];
    delete body['created_by'];
    delete body['updated_by'];

    if (method === 'POST') {
      body['createdBy'] = user.userId;
    }
    body['updatedBy'] = user.userId;

    return next.handle();
  }
}
