import { test } from 'node:test';
import * as assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  formatLegacyTime,
  importSheltertechDump,
  parsePostgresDump,
  PUBLIC_TABLES,
  sheltertechUuid,
  SHELTERTECH_SCHEMA,
  validateSourceSchema
} from '#lib/sheltertech-import.js';

function sheltertechDump (rowsByTable = {}) {
  return Object.entries(SHELTERTECH_SCHEMA)
    .map(([table, columns]) => [
      `COPY public.${table} (${columns.join(', ')}) FROM stdin;`,
      ...(rowsByTable[table] ?? []),
      '\\.'
    ].join('\n'))
    .join('\n');
}

test('ShelterTech dump parsing', async (t) => {
  await t.test('recognizes the complete allowlisted public schema', () => {
    const { tables, columnsByTable } = parsePostgresDump(sheltertechDump());
    assert.doesNotThrow(() => validateSourceSchema(columnsByTable));
    assert.deepStrictEqual([...tables.keys()], PUBLIC_TABLES);
  });

  await t.test('rejects missing or changed source columns', () => {
    const missing = parsePostgresDump(sheltertechDump().replace(
      /^COPY public\.services.*\n\\\.$/m,
      ''
    ));
    assert.throws(
      () => validateSourceSchema(missing.columnsByTable),
      /Missing public tables: services/
    );

    const changed = parsePostgresDump(sheltertechDump().replace(
      'COPY public.phones (id,',
      'COPY public.phones (legacy_id,'
    ));
    assert.throws(
      () => validateSourceSchema(changed.columnsByTable),
      /phones: source columns changed/
    );
  });

  await t.test('preserves nulls and escaped COPY text', () => {
    const dump = 'COPY public.keywords (id, name) FROM stdin;\n1\tfirst\\tline\\nsecond\n2\t\\N\n\\.';
    const { tables } = parsePostgresDump(dump);
    assert.deepStrictEqual(tables.get('keywords'), [
      { id: '1', name: 'first\tline\nsecond' },
      { id: '2', name: null }
    ]);
  });
});

test('a source-schema failure is retained in the audit schema', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sheltertech-import-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  const dumpPath = path.join(directory, 'seed.sql');
  const dump = sheltertechDump({ keywords: ['1\tShelter'] }).replace(
    /^COPY public\.services.*\n\\\.$/m,
    ''
  );
  await fs.writeFile(dumpPath, dump);

  let rawRecords;
  let issue;
  let runStatus;
  const prisma = {
    importRun: {
      create: async () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      update: async ({ data }) => { runStatus = data.status; }
    },
    sourceRecord: {
      createMany: async ({ data }) => { rawRecords = data; }
    },
    importIssue: {
      create: async ({ data }) => { issue = data; }
    },
    $transaction: async () => assert.fail('canonical transaction should not start')
  };

  await assert.rejects(
    importSheltertechDump(prisma, dumpPath),
    /Missing public tables: services/
  );
  assert.deepStrictEqual(rawRecords[0].payload, { id: '1', name: 'Shelter' });
  assert.deepStrictEqual(issue.code, 'IMPORT_FAILED');
  assert.deepStrictEqual(runStatus, 'failed');
});

test('ShelterTech conversion helpers', () => {
  assert.deepStrictEqual(sheltertechUuid('service', '42'), sheltertechUuid('service', '42'));
  assert.notDeepStrictEqual(sheltertechUuid('service', '42'), sheltertechUuid('organization', '42'));
  assert.deepStrictEqual(formatLegacyTime('930'), '09:30:00');
  assert.deepStrictEqual(formatLegacyTime('2400'), '24:00:00');
  assert.deepStrictEqual(formatLegacyTime('2360'), null);
});
