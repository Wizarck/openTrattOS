import type { ReactNode } from 'react';

/**
 * The three-tier role model from ADR-006 (RBAC). Mirrors the apps/api
 * `UserRole` type so frontend role-aware rendering uses the same vocabulary.
 */
export type UserRole = 'OWNER' | 'MANAGER' | 'STAFF';

export interface RoleGuardProps {
  /**
   * Role(s) allowed to see the children. Pass an array for any-of semantics
   * (`role={['OWNER', 'MANAGER']}` admits both).
   */
  role: UserRole | UserRole[];
  /**
   * The current authenticated user's role. `null` when no user is signed in
   * (pre-auth, expired session). A null role NEVER matches; the fallback
   * always renders.
   */
  currentRole: UserRole | null;
  /**
   * Rendered when the role doesn't match. Defaults to `null` (silently hide
   * the children).
   */
  fallback?: ReactNode;
  children: ReactNode;
}
