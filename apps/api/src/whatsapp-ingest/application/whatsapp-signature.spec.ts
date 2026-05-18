import { createHmac } from 'node:crypto';
import { verifyWhatsappSignature } from './whatsapp-signature';

const SECRET = 'test-app-secret-do-not-use';

function sign(body: Buffer | string, secret: string = SECRET): string {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  const hex = createHmac('sha256', secret).update(buf).digest('hex');
  return `sha256=${hex}`;
}

describe('verifyWhatsappSignature', () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'wamid.test', from: '34612345678', type: 'text', text: { body: 'Hola' } },
                ],
              },
            },
          ],
        },
      ],
    }),
    'utf8',
  );

  it('returns true when the signature matches HMAC-SHA256(secret, rawBody)', () => {
    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader: sign(rawBody),
      appSecret: SECRET,
    });
    expect(ok).toBe(true);
  });

  it('returns false when the secret differs', () => {
    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader: sign(rawBody, 'wrong-secret'),
      appSecret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('returns false when the header is missing', () => {
    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader: undefined,
      appSecret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('returns false when the header lacks the sha256= prefix', () => {
    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader: 'md5=deadbeef',
      appSecret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('returns false when the appSecret is empty', () => {
    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader: sign(rawBody),
      appSecret: '',
    });
    expect(ok).toBe(false);
  });

  it('returns false when the body has been tampered with by even one byte', () => {
    const original = sign(rawBody);
    const tampered = Buffer.concat([rawBody, Buffer.from(' ')]);
    const ok = verifyWhatsappSignature({
      rawBody: tampered,
      signatureHeader: original,
      appSecret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('returns false when the provided hex is malformed (odd length)', () => {
    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader: 'sha256=abc',
      appSecret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('returns false when the provided hex contains non-hex chars', () => {
    // Same length as a real sha256 hex (64 chars) but contains 'z'.
    const fakeHex = 'z'.repeat(64);
    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader: `sha256=${fakeHex}`,
      appSecret: SECRET,
    });
    expect(ok).toBe(false);
  });
});
