import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { uploadBrandMark, type UploadBrandMarkResponse } from '../api/brandMark';

/**
 * POST /api/organizations/:id/brand-mark.
 *
 * On success, invalidates the matching `org-label-fields` query (the upload
 * write-throughs the URL into `label_fields.brandMarkUrl` server-side) so
 * the form re-renders with the new logo without an extra round-trip from
 * the consumer.
 */
export function useBrandMarkUploadMutation(organizationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<UploadBrandMarkResponse, ApiError, File>({
    mutationFn: (file) => {
      if (!organizationId) throw new Error('organizationId required');
      return uploadBrandMark(organizationId, file);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-label-fields', organizationId] });
    },
  });
}
