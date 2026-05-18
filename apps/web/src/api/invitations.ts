import { api } from './client';
import type { UserRole } from './users';

/**
 * Sprint 4 W2-2b — frontend bindings for `/users/invitations/*`.
 *
 * Backed by apps/api/src/iam/invitations/* (PR #225). The W2-2a backend
 * deliberately omits `token` from every response so it never crosses the
 * wire after creation — invitees only see it via the email link. The
 * `accept` flow returns a placeholder session until R8 ships real
 * JWT/cookie issuance; until then the frontend does its own redirect to
 * `/owner-dashboard` and the persona logs in with the freshly-created
 * password through the standard flow.
 */

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface InvitationResponse {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: InvitationStatus;
  createdAt: string;
}

export interface CreateInvitationPayload {
  email: string;
  role: UserRole;
}

export interface InvitationLookupResponse {
  email: string;
  role: UserRole;
  orgName: string;
  invitedByName: string;
  expiresAt: string;
}

export interface InvitationAcceptResponse {
  user: {
    id: string;
    organizationId: string;
    name: string;
    email: string;
    role: UserRole;
  };
  session: { kind: 'placeholder'; message: string };
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export async function listInvitations(
  organizationId: string,
): Promise<InvitationResponse[]> {
  const q = new URLSearchParams({ organizationId });
  return api<InvitationResponse[]>(`/users/invitations?${q.toString()}`);
}

export async function createInvitation(
  organizationId: string,
  payload: CreateInvitationPayload,
): Promise<InvitationResponse> {
  const q = new URLSearchParams({ organizationId });
  const env = await api<WriteEnvelope<InvitationResponse>>(
    `/users/invitations?${q.toString()}`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return env.data;
}

export async function revokeInvitation(
  id: string,
  organizationId: string,
): Promise<InvitationResponse> {
  const q = new URLSearchParams({ organizationId });
  const env = await api<WriteEnvelope<InvitationResponse>>(
    `/users/invitations/${encodeURIComponent(id)}/revoke?${q.toString()}`,
    { method: 'POST' },
  );
  return env.data;
}

export async function lookupInvitation(token: string): Promise<InvitationLookupResponse> {
  const q = new URLSearchParams({ token });
  return api<InvitationLookupResponse>(`/users/invitations/lookup?${q.toString()}`);
}

export async function acceptInvitation(
  token: string,
  password: string,
  name?: string,
): Promise<InvitationAcceptResponse> {
  return api<InvitationAcceptResponse>('/users/invitations/accept', {
    method: 'POST',
    body: JSON.stringify(name ? { token, password, name } : { token, password }),
  });
}
