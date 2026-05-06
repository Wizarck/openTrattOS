import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditLogQueryDto } from './audit-log-query.dto';

const ORG = '11111111-1111-4111-8111-111111111111';

async function validateDto(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(AuditLogQueryDto, input);
  const errors = await validate(dto, { whitelist: true });
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('AuditLogQueryDto', () => {
  it('accepts a valid q (≤200 chars)', async () => {
    const errors = await validateDto({ organizationId: ORG, q: 'tomate frito' });
    expect(errors).toHaveLength(0);
  });

  it('accepts q absent', async () => {
    const errors = await validateDto({ organizationId: ORG });
    expect(errors).toHaveLength(0);
  });

  it('rejects q over 200 chars', async () => {
    const tooLong = 'a'.repeat(201);
    const errors = await validateDto({ organizationId: ORG, q: tooLong });
    expect(errors.some((m) => m.toLowerCase().includes('q'))).toBe(true);
    expect(errors.join(' | ')).toMatch(/200/);
  });

  it('rejects q that is not a string', async () => {
    const errors = await validateDto({ organizationId: ORG, q: 12345 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' | ').toLowerCase()).toContain('string');
  });

  it('accepts q at exactly 200 chars (boundary)', async () => {
    const exactly200 = 'b'.repeat(200);
    const errors = await validateDto({ organizationId: ORG, q: exactly200 });
    expect(errors).toHaveLength(0);
  });
});
