import { AuditLog } from '../domain/audit-log.entity';
import {
  AUDIT_LOG_CSV_HEADER,
  csvHeaderRow,
  csvSerialiseRow,
  escapeCsvField,
} from './audit-log-csv';

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  const row = new AuditLog();
  row.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  row.organizationId = overrides.organizationId ?? '00000000-0000-4000-8000-00000000aaaa';
  row.eventType = overrides.eventType ?? 'TEST_EVENT';
  row.aggregateType = overrides.aggregateType ?? 'recipe';
  row.aggregateId = overrides.aggregateId ?? '00000000-0000-4000-8000-00000000bbbb';
  row.actorUserId = overrides.actorUserId ?? null;
  row.actorKind = overrides.actorKind ?? 'system';
  row.agentName = overrides.agentName ?? null;
  row.payloadBefore = overrides.payloadBefore ?? null;
  row.payloadAfter = overrides.payloadAfter ?? null;
  row.reason = overrides.reason ?? null;
  row.citationUrl = overrides.citationUrl ?? null;
  row.snippet = overrides.snippet ?? null;
  row.createdAt = overrides.createdAt ?? new Date('2026-05-06T11:42:08.000Z');
  return row;
}

describe('audit-log-csv', () => {
  describe('escapeCsvField', () => {
    it('returns empty string for null', () => {
      expect(escapeCsvField(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(escapeCsvField('')).toBe('');
    });

    it('returns plain value when no escaping needed', () => {
      expect(escapeCsvField('foo')).toBe('foo');
    });

    it('wraps in quotes when value contains comma', () => {
      expect(escapeCsvField('foo,bar')).toBe('"foo,bar"');
    });

    it('wraps in quotes and doubles internal quotes', () => {
      expect(escapeCsvField('he said "hi"')).toBe('"he said ""hi"""');
    });

    it('wraps in quotes for newline', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('wraps in quotes for carriage return', () => {
      expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"');
    });

    it('handles all-three escape triggers in one field', () => {
      expect(escapeCsvField('a,b"c\nd')).toBe('"a,b""c\nd"');
    });
  });

  describe('csvHeaderRow', () => {
    it('returns the 14-column header in stable order', () => {
      const expected = [
        'id',
        'organizationId',
        'eventType',
        'aggregateType',
        'aggregateId',
        'actorUserId',
        'actorKind',
        'agentName',
        'payloadBeforeJson',
        'payloadAfterJson',
        'reason',
        'citationUrl',
        'snippet',
        'createdAt',
      ].join(',');
      expect(csvHeaderRow()).toBe(expected);
      expect(AUDIT_LOG_CSV_HEADER).toHaveLength(14);
    });
  });

  describe('csvSerialiseRow', () => {
    it('emits exactly 14 fields (13 commas at top level)', () => {
      const row = makeAuditLog();
      const out = csvSerialiseRow(row);
      // Top-level commas only — fields with embedded commas are quoted, so
      // counting commas OUTSIDE quotes equals 13.
      let commas = 0;
      let inQuote = false;
      for (let i = 0; i < out.length; i++) {
        const ch = out[i];
        if (ch === '"') {
          // Doubled quote inside a quoted field stays in-quote.
          if (inQuote && out[i + 1] === '"') {
            i++;
            continue;
          }
          inQuote = !inQuote;
          continue;
        }
        if (ch === ',' && !inQuote) commas++;
      }
      expect(commas).toBe(13);
    });

    it('renders ISO-8601 UTC for createdAt', () => {
      const row = makeAuditLog({ createdAt: new Date('2026-05-06T11:42:08.000Z') });
      expect(csvSerialiseRow(row)).toContain('2026-05-06T11:42:08.000Z');
    });

    it('renders null jsonb columns as empty cells', () => {
      const row = makeAuditLog({ payloadBefore: null, payloadAfter: null });
      const out = csvSerialiseRow(row);
      // payloadBeforeJson + payloadAfterJson are columns 9 + 10.
      const fields = out.split(',');
      expect(fields[8]).toBe('');
      expect(fields[9]).toBe('');
    });

    it('stringifies and quotes jsonb payloads with embedded characters', () => {
      const row = makeAuditLog({
        payloadAfter: { totalCost: 12.34, components: [{ id: 'x' }] },
      });
      const out = csvSerialiseRow(row);
      // The stringified JSON contains commas + quotes → must be CSV-quoted with
      // internal quote doubling.
      expect(out).toContain('"{""totalCost"":12.34,""components"":[{""id"":""x""}]}"');
    });

    it('CSV-escapes string fields that contain comma + quote + newline', () => {
      const row = makeAuditLog({
        reason: 'he said "ok, then\nhi"',
      });
      const out = csvSerialiseRow(row);
      expect(out).toContain('"he said ""ok, then\nhi"""');
    });

    it('renders nullable text columns as empty cells when null', () => {
      const row = makeAuditLog({
        actorUserId: null,
        agentName: null,
        reason: null,
        citationUrl: null,
        snippet: null,
      });
      const fields = csvSerialiseRow(row).split(',');
      // Indices 5 (actorUserId), 7 (agentName), 10 (reason), 11 (citationUrl),
      // 12 (snippet) — all empty.
      expect(fields[5]).toBe('');
      expect(fields[7]).toBe('');
      expect(fields[10]).toBe('');
      expect(fields[11]).toBe('');
      expect(fields[12]).toBe('');
    });

    it('preserves field order matching the header', () => {
      const row = makeAuditLog({
        id: 'id-x',
        organizationId: 'org-x',
        eventType: 'EV',
        aggregateType: 'agg',
        aggregateId: 'aid',
        actorUserId: 'usr',
        actorKind: 'user',
        agentName: 'an',
        payloadBefore: { a: 1 },
        payloadAfter: { b: 2 },
        reason: 'r',
        citationUrl: 'http://x',
        snippet: 's',
        createdAt: new Date('2026-05-06T11:42:08.000Z'),
      });
      const fields = csvSerialiseRow(row).split(',');
      expect(fields[0]).toBe('id-x');
      expect(fields[1]).toBe('org-x');
      expect(fields[2]).toBe('EV');
      expect(fields[3]).toBe('agg');
      expect(fields[4]).toBe('aid');
      expect(fields[5]).toBe('usr');
      expect(fields[6]).toBe('user');
      expect(fields[7]).toBe('an');
      // payloadBeforeJson/payloadAfterJson are simple no-comma JSON here so
      // they appear as plain text without CSV quoting.
      expect(fields[8]).toBe('"{""a"":1}"');
      expect(fields[9]).toBe('"{""b"":2}"');
      expect(fields[10]).toBe('r');
      expect(fields[11]).toBe('http://x');
      expect(fields[12]).toBe('s');
      expect(fields[13]).toBe('2026-05-06T11:42:08.000Z');
    });
  });
});
