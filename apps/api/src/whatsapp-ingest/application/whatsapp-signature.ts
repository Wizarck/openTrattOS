import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends with every
 * WhatsApp Cloud API webhook delivery against the raw request body.
 *
 * Meta computes:  `sha256=<hex>` where `<hex>` is
 * `HMAC-SHA256(appSecret, rawBody)` over the *byte-for-byte* request
 * body — including whitespace and key ordering. This is why the
 * controller MUST read the raw body, not the parsed JSON. NestJS's
 * `RawBodyRequest<Request>.rawBody` is the surface we consume.
 *
 * Constant-time comparison via `timingSafeEqual` is used to avoid
 * timing side-channels (Meta does not retry on a single mismatch but
 * an attacker controlling load could probe).
 *
 * The function is pure + sync so it is trivially unit-testable against
 * any signed payload. The webhook controller is the only consumer.
 */
export function verifyWhatsappSignature(args: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  appSecret: string;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = args;
  if (!signatureHeader) return false;
  if (!appSecret) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;
  const providedHex = signatureHeader.slice('sha256='.length).trim();
  if (providedHex.length === 0) return false;

  const expectedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  // Length mismatch → can't even attempt timingSafeEqual (it throws).
  // Hex strings of equal length, so this protects against unrelated
  // input.
  if (providedHex.length !== expectedHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(providedHex, 'hex'), Buffer.from(expectedHex, 'hex'));
  } catch {
    // Invalid hex on the provided header → reject.
    return false;
  }
}
