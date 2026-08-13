import { test } from 'node:test';
import * as assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  fieldDispositions,
  formatLegacyTime,
  formatStructuredTime,
  importSheltertechDump,
  parsePhone,
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
      ...(rowsByTable[table] ?? []).map((row) => typeof row === 'string'
        ? row
        : columns.map((column) => row[column] ?? '\\N').join('\t')),
      '\\.'
    ].join('\n'))
    .join('\n');
}

async function withDump (t, rows, callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sheltertech-import-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  const dumpPath = path.join(directory, 'seed.sql');
  await fs.writeFile(dumpPath, sheltertechDump(rows));
  return callback(dumpPath);
}

function mockPrisma (populated = []) {
  const stores = {};
  let transactionStarted = false;
  const delegates = new Proxy({}, {
    get (_, name) {
      if (name === 'then') return undefined;
      if (!stores[name]) stores[name] = [];
      return {
        count: async () => populated.includes(name) ? 1 : stores[name].length,
        create: async ({ data }) => {
          stores[name].push(structuredClone(data));
          return data;
        },
        update: async ({ where, data }) => {
          const record = stores[name].find((entry) => entry.id === where.id);
          Object.assign(record, structuredClone(data));
          return record;
        }
      };
    }
  });
  const prisma = new Proxy({}, {
    get (_, name) {
      if (name === 'then') return undefined;
      if (name === '$transaction') {
        return async (callback) => {
          transactionStarted = true;
          return callback(prisma);
        };
      }
      return delegates[name];
    }
  });
  return { prisma, stores, transactionStarted: () => transactionStarted };
}

function conversionFixture () {
  return {
    resources: [{ id: '1', name: 'Example Org', short_description: 'Organization description', status: '1', featured: 't' }],
    services: [{ id: '1', name: 'Example Service', short_description: 'Service description', resource_id: '1', status: '1', updated_at: '2026-08-06 12:00:00', featured: 't', boosted_category_id: '1' }],
    addresses: [{ id: '1', address_1: '1 Main St', city: 'San Francisco', state_province: 'CA', postal_code: '94103', resource_id: '1', online: 't', name: 'Online location' }],
    phones: [{ id: '1', number: '+14155550100;ext=42', service_type: 'SMS', resource_id: '1' }],
    categories: [{ id: '1', name: 'Shelter', top_level: 't', featured: 't' }],
    categories_resources: [{ category_id: '1', resource_id: '1' }],
    categories_services: [{ service_id: '1', category_id: '1', feature_rank: '2' }],
    eligibilities: [
      { id: '5', name: 'Re-entry', feature_rank: '5', is_parent: 'f' },
      { id: '7', name: 'Adults', is_parent: 't' },
      { id: '12', name: 'Returning citizens', is_parent: 't' }
    ],
    eligibility_relationships: [
      { parent_id: '7', child_id: '5' },
      { parent_id: '12', child_id: '5' }
    ],
    eligibilities_services: [{ service_id: '1', eligibility_id: '5' }],
    notes: [
      { id: '1', note: 'Organization note', resource_id: '1' },
      { id: '2', note: 'Service note', service_id: '1' }
    ],
    instructions: [{ id: '1', instruction: 'Call before visiting', service_id: '1' }],
    sites: [{ id: '1', site_code: 'sfsg' }],
    resources_sites: [{ resource_id: '1', site_id: '1' }],
    schedules: [
      { id: '1', resource_id: '1', hours_known: 't' },
      { id: '2', service_id: '1', hours_known: 't' }
    ],
    schedule_days: [
      { id: '1', schedule_id: '1', day: 'Monday', open_time: '08:30:00', close_time: '17:00:00' },
      { id: '2', schedule_id: '2', day: 'Monday', opens_at: '2200', closes_at: '200', close_day: 'Tuesday' }
    ]
  };
}

test('ShelterTech dump parsing', async (t) => {
  await t.test('recognizes the complete allowlisted public schema', () => {
    const { tables, columnsByTable } = parsePostgresDump(sheltertechDump());
    assert.doesNotThrow(() => validateSourceSchema(columnsByTable));
    assert.deepStrictEqual([...tables.keys()], PUBLIC_TABLES);
  });

  await t.test('rejects missing or changed source columns', () => {
    const missing = parsePostgresDump(sheltertechDump().replace(/^COPY public\.services.*\n\\\.$/m, ''));
    assert.throws(() => validateSourceSchema(missing.columnsByTable), /Missing public tables: services/);

    const changed = parsePostgresDump(sheltertechDump().replace('COPY public.phones (id,', 'COPY public.phones (legacy_id,'));
    assert.throws(() => validateSourceSchema(changed.columnsByTable), /phones: source columns changed/);
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

test('ShelterTech canonical conversion', async (t) => {
  await t.test('preserves public relationships and emits an external report', async (t) => {
    await withDump(t, conversionFixture(), async (dumpPath) => {
      const { prisma, stores } = mockPrisma();
      const report = await importSheltertechDump(prisma, dumpPath);

      assert.equal(report.status, 'complete');
      assert.equal(stores.organization.length, 1);
      assert.equal(stores.service.length, 1);
      assert.equal(stores.location[0].locationType, 'virtual');
      assert.equal(stores.address[0].addressType, 'virtual');
      assert.equal(stores.phone[0].number, '+14155550100');
      assert.equal(stores.phone[0].extension, 42);
      assert.equal(stores.phone[0].type, 'text');
      assert.equal(stores.serviceAtLocation.length, 1);
      assert.equal(stores.schedule.length, 2);
      assert.ok(stores.schedule.some(({ locationId, opensAt }) => locationId && opensAt === '08:30:00'));
      assert.ok(stores.schedule.some(({ serviceId, opensAt, notes }) => serviceId && opensAt === '22:00:00' && notes === 'Closes Tuesday at 02:00:00'));

      const noteTermId = sheltertechUuid('legacy_term', 'note');
      const instructionTermId = sheltertechUuid('legacy_term', 'instruction');
      const siteTermId = sheltertechUuid('site_term', '1');
      assert.equal(stores.attribute.filter(({ taxonomyTermId }) => taxonomyTermId === noteTermId).length, 2);
      assert.equal(stores.attribute.filter(({ taxonomyTermId }) => taxonomyTermId === instructionTermId).length, 1);
      assert.equal(stores.attribute.filter(({ taxonomyTermId }) => taxonomyTermId === siteTermId).length, 1);
      assert.equal(stores.attribute.filter(({ linkType, value }) => linkType === 'legacy' && value === 'true').length, 6);
      const reentry = stores.taxonomyTerm.find(({ id }) => id === sheltertechUuid('eligibility_term', '5'));
      assert.equal(reentry.parentId, sheltertechUuid('eligibility_term', '7'));
      const extraParents = stores.attribute.filter(({ linkType }) => linkType === 'additional_parent');
      assert.equal(extraParents.length, 1);
      assert.equal(extraParents[0].value, sheltertechUuid('eligibility_term', '12'));
      assert.equal(stores.service[0].alert, undefined);
      assert.equal(report.inferred_mappings.filter(({ rule }) => rule === 'organization_address_fallback').length, 1);
      assert.equal(report.inferred_mappings.filter(({ rule }) => rule === 'organization_schedule_to_location').length, 1);
    });
  });

  await t.test('rejects unknown statuses before opening a transaction', async (t) => {
    const rows = conversionFixture();
    rows.services[0].status = '2';
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, transactionStarted } = mockPrisma();
      await assert.rejects(importSheltertechDump(prisma, dumpPath), /preflight failed/);
      assert.equal(transactionStarted(), false);
    });
  });

  await t.test('rejects missing phone numbers before opening a transaction', async (t) => {
    const rows = conversionFixture();
    rows.phones[0].number = null;
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, transactionStarted } = mockPrisma();
      await assert.rejects(importSheltertechDump(prisma, dumpPath), /preflight failed/);
      assert.equal(transactionStarted(), false);
    });
  });

  await t.test('rejects unrecognized schedule days before opening a transaction', async (t) => {
    const rows = conversionFixture();
    rows.schedule_days[0].day = 'Funday';
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, transactionStarted } = mockPrisma();
      await assert.rejects(importSheltertechDump(prisma, dumpPath), /preflight failed/);
      assert.equal(transactionStarted(), false);
    });
  });

  await t.test('rejects populated tables without an approved mapping', async (t) => {
    const rows = conversionFixture();
    rows.keywords = [{ id: '1', name: 'unmapped' }];
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, transactionStarted } = mockPrisma();
      await assert.rejects(importSheltertechDump(prisma, dumpPath), /preflight failed/);
      assert.equal(transactionStarted(), false);
    });
  });

  await t.test('refuses to overwrite canonical data', async (t) => {
    await withDump(t, conversionFixture(), async (dumpPath) => {
      const { prisma } = mockPrisma(['organization']);
      await assert.rejects(importSheltertechDump(prisma, dumpPath), (error) => {
        assert.match(error.message, /not empty: organization/);
        assert.equal(error.report.status, 'failed');
        return true;
      });
    });
  });
});

test('ShelterTech conversion helpers and coverage', () => {
  assert.deepStrictEqual(sheltertechUuid('service', '42'), sheltertechUuid('service', '42'));
  assert.notDeepStrictEqual(sheltertechUuid('service', '42'), sheltertechUuid('organization', '42'));
  assert.deepStrictEqual(formatLegacyTime('930'), '09:30:00');
  assert.deepStrictEqual(formatLegacyTime('2400'), '24:00:00');
  assert.deepStrictEqual(formatLegacyTime('2360'), null);
  assert.deepStrictEqual(formatStructuredTime('09:30:15'), '09:30:15');
  assert.deepStrictEqual(parsePhone('+14155550100;ext=9', 'fax'), {
    number: '+14155550100', extension: 9, type: 'fax'
  });
  assert.equal(parsePhone(null, 'voice'), null);
  assert.equal(parsePhone('', 'voice'), null);

  const dispositions = fieldDispositions();
  assert.equal(dispositions.resources.internal_note, 'private');
  assert.equal(dispositions.notes.note, 'public_attribute');
  assert.equal(dispositions.keywords.name, 'unclassified');
  for (const [table, columns] of Object.entries(SHELTERTECH_SCHEMA)) {
    assert.deepStrictEqual(Object.keys(dispositions[table]), columns);
  }
});

test('Prisma migration has one public schema and no raw audit models', async () => {
  const prisma = await fs.readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = await fs.readFile(new URL('../prisma/migrations/20260806230000_add_open_referral_tables/migration.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(prisma, /@@schema|ImportRun|SourceRecord|SourceMapping|ImportIssue/);
  assert.doesNotMatch(migration, /CREATE SCHEMA|"hsds"\.|import_audit/);
});

test('provisional ShelterTech dump retains known functional counts', {
  skip: !process.env.SHELTERTECH_SEED_PATH
}, async () => {
  const { prisma } = mockPrisma();
  const report = await importSheltertechDump(prisma, process.env.SHELTERTECH_SEED_PATH);
  assert.equal(report.canonical_counts.organization, 187);
  assert.equal(report.canonical_counts.service, 248);
  assert.equal(report.canonical_counts.location, 187);
  assert.equal(report.canonical_counts.address, 187);
  assert.equal(report.canonical_counts.serviceAtLocation, 248);
  assert.equal(report.canonical_counts.schedule, 3075);
  assert.equal(report.mappings.filter(({ rule }) => rule.endsWith('_note')).length, 435);
  assert.equal(report.mappings.filter(({ rule }) => rule === 'service_instruction').length, 209);
  assert.equal(report.mappings.filter(({ rule }) => rule === 'organization_site').length, 209);
});
