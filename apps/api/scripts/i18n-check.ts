#!/usr/bin/env node
/**
 * i18n parity check — fails if `locales/es.json` and `locales/en.json` do not
 * have identical key sets (recursively). Run by CI; runs locally via
 * `npm run i18n:check` (per task §6.5).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type JsonObject = { [key: string]: JsonObject | string | number | boolean | null | unknown[] };

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function flattenKeys(o: JsonObject, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (isObject(v)) {
      keys.push(...flattenKeys(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys.sort();
}

function loadJson(path: string): JsonObject {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as JsonObject;
}

function main(): number {
  const root = resolve(__dirname, '..');
  const es = loadJson(resolve(root, 'locales/es.json'));
  const en = loadJson(resolve(root, 'locales/en.json'));
  const esKeys = new Set(flattenKeys(es));
  const enKeys = new Set(flattenKeys(en));

  const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
  const missingInEn = [...esKeys].filter((k) => !enKeys.has(k));

  if (missingInEs.length === 0 && missingInEn.length === 0) {
    console.log(`✅ i18n parity OK (${esKeys.size} keys in each locale)`);
    return 0;
  }

  console.error('❌ i18n parity check failed:');
  if (missingInEs.length > 0) {
    console.error(`  Keys present in en.json but missing in es.json (${missingInEs.length}):`);
    for (const k of missingInEs) console.error(`    - ${k}`);
  }
  if (missingInEn.length > 0) {
    console.error(`  Keys present in es.json but missing in en.json (${missingInEn.length}):`);
    for (const k of missingInEn) console.error(`    - ${k}`);
  }
  return 1;
}

process.exit(main());
