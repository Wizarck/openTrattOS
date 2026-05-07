import type { RoleGuardProps, UserRole } from './RoleGuard.types';

/**
 * Conditionally renders children when the current user's role matches the
 * required role(s). Reusable primitive for Owner-only / Manager-only sections.
 *
 * **NOT a security primitive.** This component is a UX-only render gate. The
 * authoritative permission check lives at the apps/api controller layer
 * (`@Roles('OWNER')` from ADR-006). A determined non-Owner can hit the
 * endpoint directly; the server returns 403. Always pair this guard with a
 * server-side `@Roles(...)` decorator on the consumed endpoint.
 *
 * @example
 *   <RoleGuard role="OWNER" currentRole={user.role} fallback={<AccessDenied/>}>
 *     <OwnerOnlySection />
 *   </RoleGuard>
 */
export function RoleGuard({ role, currentRole, fallback = null, children }: RoleGuardProps) {
  if (currentRole === null) {
    return <>{fallback}</>;
  }
  const allowed = Array.isArray(role) ? role.includes(currentRole) : role === currentRole;
  return <>{allowed ? children : fallback}</>;
}

export type { RoleGuardProps, UserRole };
