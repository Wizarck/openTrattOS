import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  lookupInvitation,
  revokeInvitation,
  type CreateInvitationPayload,
  type InvitationAcceptResponse,
  type InvitationLookupResponse,
  type InvitationResponse,
} from '../api/invitations';

const listKey = (orgId: string | undefined): readonly unknown[] => [
  'users',
  orgId,
  'invitations',
];

const lookupKey = (token: string | undefined): readonly unknown[] => [
  'invitations',
  'lookup',
  token,
];

export function usePendingInvitationsQuery(orgId: string | undefined) {
  return useQuery<InvitationResponse[], ApiError>({
    queryKey: listKey(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return listInvitations(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCreateInvitationMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<InvitationResponse, ApiError, CreateInvitationPayload>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return createInvitation(orgId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(orgId) });
    },
  });
}

export function useRevokeInvitationMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<InvitationResponse, ApiError, string>({
    mutationFn: (id) => {
      if (!orgId) throw new Error('orgId required');
      return revokeInvitation(id, orgId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(orgId) });
    },
  });
}

/**
 * Public — no orgId guard, the token IS the auth. Disabled until the
 * caller passes a non-empty token (the route component reads it from
 * `useParams`, so the hook stays disabled during the initial render of
 * a directly-linked acceptance flow).
 */
export function useInvitationLookupQuery(token: string | undefined) {
  return useQuery<InvitationLookupResponse, ApiError>({
    queryKey: lookupKey(token),
    queryFn: () => {
      if (!token) throw new Error('token required');
      return lookupInvitation(token);
    },
    enabled: !!token && token.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

export function useAcceptInvitationMutation() {
  return useMutation<
    InvitationAcceptResponse,
    ApiError,
    { token: string; password: string; name?: string }
  >({
    mutationFn: ({ token, password, name }) => acceptInvitation(token, password, name),
  });
}
