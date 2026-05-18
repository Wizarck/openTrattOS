import { ApiError } from './client';

export interface UploadBrandMarkResponse {
  brandMarkUrl: string;
  byteSize: number;
  width: number;
  height: number;
}

/**
 * POST /api/organizations/:id/brand-mark — multipart upload.
 *
 * Bypasses the JSON-default `api()` helper because multipart requires the
 * browser to compose its own boundary header (any explicit Content-Type
 * breaks the body parsing).
 */
export async function uploadBrandMark(
  organizationId: string,
  file: File,
): Promise<UploadBrandMarkResponse> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetch(`/api/organizations/${organizationId}/brand-mark`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // body stays null when response isn't JSON.
    }
    throw new ApiError(res.status, body, `Brand-mark upload failed: HTTP ${res.status}`);
  }
  return (await res.json()) as UploadBrandMarkResponse;
}
