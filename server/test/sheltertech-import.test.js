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

async function withDump (t, rows, callback, extra = '') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sheltertech-import-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  const dumpPath = path.join(directory, 'seed.sql');
  await fs.writeFile(dumpPath, sheltertechDump(rows) + extra);
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
    phones: [{ id: '1', number: '+14155550100;ext=0967', service_type: 'SMS', resource_id: '1' }],
    categories: [{ id: '1', name: 'Shelter', top_level: 't', featured: 't' }],
    categories_resources: [{ category_id: '1', resource_id: '1' }],
    categories_services: [{ service_id: '1', category_id: '1', feature_rank: '2' }],
    eligibilities: [
      { id: '5', name: 'Re-entry', feature_rank: '5', is_parent: 'f' },
      { id: '7', name: 'Adults', is_parent: 't' },
      { id: '12', name: 'Returning citizens', is_parent: 't' },
      { id: '13', name: 'No parent flag', is_parent: null }
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

  await t.test('counts ignored public tables without retaining their rows', () => {
    const secret = 'ignored-sensitive-value';
    const parsed = parsePostgresDump(`${sheltertechDump()}\nCOPY public.change_requests (id, payload) FROM stdin;\n1\t${secret}\n2\tsecond\n\\.`);
    assert.deepStrictEqual(Object.fromEntries(parsed.ignoredSourceCounts), { change_requests: 2 });
    assert.equal(parsed.tables.has('change_requests'), false);
    assert.doesNotMatch(JSON.stringify([...parsed.tables.values()]), new RegExp(secret));
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
      assert.equal(stores.phone[0].extension, '0967');
      assert.equal(stores.phone[0].type, 'text');
      assert.equal(stores.taxonomyTerm.find(({ name }) => name === 'Shelter').code, null);
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
      assert.equal(stores.attribute.filter(({ linkType, value }) => linkType === 'legacy' && value === 'false').length, 1);
      assert.equal(stores.attribute.some(({ linkId }) => linkId === sheltertechUuid('eligibility_term', '13')), false);
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

  await t.test('imports while reporting populated non-allowlisted tables', async (t) => {
    const ignored = '\nCOPY public.change_requests (id, payload) FROM stdin;\n1\tsecret payload\n2\tanother payload\n\\.';
    await withDump(t, conversionFixture(), async (dumpPath) => {
      const { prisma } = mockPrisma();
      const report = await importSheltertechDump(prisma, dumpPath);
      assert.equal(report.status, 'complete');
      assert.deepStrictEqual(report.ignored_source_counts, { change_requests: 2 });
      assert.doesNotMatch(JSON.stringify(report), /secret payload|another payload/);
    }, ignored);
  });

  await t.test('reports audit values without exposing private notes', async (t) => {
    const rows = conversionFixture();
    rows.resources[0].verified_at = '2026-08-01 12:00:00';
    rows.resources[0].internal_note = 'private organization note';
    rows.services[0].internal_note = 'private service note';
    rows.notes[0].updated_at = '2026-08-02 12:00:00';
    await withDump(t, rows, async (dumpPath) => {
      const { prisma } = mockPrisma();
      const report = await importSheltertechDump(prisma, dumpPath);
      assert.ok(report.report_only_values.some((entry) => entry.source_table === 'resources' && entry.source_key === '1' && entry.field === 'verified_at' && entry.value === '2026-08-01 12:00:00'));
      assert.ok(report.report_only_values.some((entry) => entry.source_table === 'notes' && entry.source_key === '1' && entry.field === 'updated_at'));
      assert.equal(report.report_only_values.some(({ field }) => field === 'internal_note'), false);
      assert.doesNotMatch(JSON.stringify(report), /private organization note|private service note/);
    });
  });

  await t.test('preserves malformed source URIs and emits warnings', async (t) => {
    const rows = conversionFixture();
    rows.resources[0].website = 'example dot org';
    rows.services[0].url = 'service url';
    rows.documents = [{ id: '1', name: 'Bring ID', url: 'document url' }];
    rows.documents_services = [{ service_id: '1', document_id: '1' }];
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, stores } = mockPrisma();
      const report = await importSheltertechDump(prisma, dumpPath);
      assert.equal(stores.organization[0].website, 'example dot org');
      assert.equal(stores.service[0].url, 'service url');
      assert.equal(stores.requiredDocument[0].uri, 'document url');
      assert.deepStrictEqual(report.warnings.map(({ source_table: table, field, details }) => [table, field, details.value]), [
        ['resources', 'website', 'example dot org'],
        ['services', 'url', 'service url'],
        ['documents', 'url', 'document url']
      ]);
    });
  });

  await t.test('preserves explicit service locations and only infers missing links', async (t) => {
    const rows = {
      resources: [{ id: '1', name: 'Example Org', status: '1' }],
      services: [
        { id: '1', name: 'Explicit Service', resource_id: '1', status: '1' },
        { id: '2', name: 'Fallback Service', resource_id: '1', status: '1' }
      ],
      addresses: [
        { id: '1', address_1: '1 Main St', city: 'San Francisco', state_province: 'CA', postal_code: '94103', resource_id: '1' },
        { id: '2', address_1: '2 Main St', city: 'San Francisco', state_province: 'CA', postal_code: '94103', resource_id: '1' }
      ],
      addresses_services: [{ service_id: '1', address_id: '2' }],
      schedules: [{ id: '1', resource_id: '1', hours_known: 't' }],
      schedule_days: [{ id: '1', schedule_id: '1', day: 'Monday', opens_at: '900', closes_at: '1700' }]
    };
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, stores } = mockPrisma();
      const report = await importSheltertechDump(prisma, dumpPath);
      const explicitServiceId = sheltertechUuid('service', '1');
      const explicitLinks = stores.serviceAtLocation.filter(({ serviceId }) => serviceId === explicitServiceId);
      assert.deepStrictEqual(explicitLinks.map(({ locationId }) => locationId), [sheltertechUuid('location', '2')]);
      assert.equal(stores.serviceAtLocation.length, 3);
      assert.equal(stores.schedule.filter(({ locationId }) => locationId).length, 2);
      assert.equal(report.inferred_mappings.filter(({ rule }) => rule === 'organization_address_fallback').length, 2);
    });
  });

  await t.test('preserves unknown phone types and inferred descriptions', async (t) => {
    const rows = conversionFixture();
    rows.phones[0].service_type = 'Hotline';
    rows.phones[0].description = 'After hours';
    rows.resources[0].short_description = null;
    rows.programs = [{ id: '1', name: 'Example Program', resource_id: '1' }];
    rows.services[0].program_id = '1';
    rows.services[0].short_description = null;
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, stores } = mockPrisma();
      const report = await importSheltertechDump(prisma, dumpPath);
      assert.equal(stores.phone[0].organizationId, sheltertechUuid('organization', '1'));
      assert.equal(stores.phone[0].type, null);
      assert.equal(stores.phone[0].description, 'After hours\n\nShelterTech service type: Hotline');
      assert.ok(report.warnings.some(({ source_table: table, source_key: key, field, code, details }) => table === 'phones' && key === '1' && field === 'service_type' && code === 'UNKNOWN_PHONE_TYPE' && details.value === 'Hotline'));
      assert.equal(stores.organization[0].description, 'Example Org');
      assert.equal(stores.program[0].description, 'Example Program');
      assert.equal(stores.service[0].description, 'Example Service');
      assert.deepStrictEqual(report.inferred_mappings.filter(({ rule }) => rule === 'name_as_description').map(({ source_table: table }) => table), ['resources', 'programs', 'services']);
    });
  });

  await t.test('normalizes opening and closing 2400 without losing weekday meaning', async (t) => {
    const rows = {
      resources: [{ id: '1', name: 'Example Org', status: '1' }],
      services: [{ id: '1', name: 'Example Service', resource_id: '1', status: '1' }],
      addresses: [{ id: '1', resource_id: '1', online: 't' }],
      schedules: [
        { id: '1', service_id: '1', hours_known: 't' },
        { id: '2', service_id: '1', hours_known: 't' }
      ],
      schedule_days: [
        { id: '1', schedule_id: '1', day: 'Monday', opens_at: '2400', closes_at: '100' },
        { id: '2', schedule_id: '2', day: 'Monday', opens_at: '800', closes_at: '2400' }
      ]
    };
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, stores } = mockPrisma();
      await importSheltertechDump(prisma, dumpPath);
      assert.ok(stores.schedule.some(({ byday, opensAt, closesAt }) => byday === 'TU' && opensAt === '00:00:00' && closesAt === '01:00:00'));
      assert.ok(stores.schedule.some(({ byday, closesAt, notes }) => byday === 'MO' && closesAt === '00:00:00' && notes === 'Closes next day at 00:00:00'));
    });
  });

  await t.test('rejects each orphan category before opening a transaction', async (t) => {
    const cases = [
      ['documents', { documents: [{ id: 'orphan', name: 'ID' }] }],
      ['fundings', { fundings: [{ id: 'orphan', source: 'Grant' }] }],
      ['languages', { languages: [{ id: 'orphan', language: 'Spanish' }] }]
    ];
    for (const [sourceTable, additions] of cases) {
      const rows = { ...conversionFixture(), ...additions };
      await withDump(t, rows, async (dumpPath) => {
        const { prisma, transactionStarted } = mockPrisma();
        await assert.rejects(importSheltertechDump(prisma, dumpPath), (error) => {
          assert.ok(error.report.issues.some(({ source_table: table, code }) => table === sourceTable && code === 'ORPHANED_ROW'));
          return true;
        });
        assert.equal(transactionStarted(), false);
      });
    }
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

  await t.test('rejects malformed structured times before opening a transaction', async (t) => {
    const rows = conversionFixture();
    rows.schedule_days[0].open_time = '09:30:00.123';
    await withDump(t, rows, async (dumpPath) => {
      const { prisma, transactionStarted } = mockPrisma();
      await assert.rejects(importSheltertechDump(prisma, dumpPath), (error) => {
        assert.ok(error.report.issues.some(({ field, code }) => field === 'open_time' && code === 'INVALID_TIME'));
        return true;
      });
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
  assert.deepStrictEqual(formatLegacyTime('2400'), '00:00:00');
  assert.deepStrictEqual(formatLegacyTime('2360'), null);
  assert.deepStrictEqual(formatLegacyTime('-100'), null);
  assert.deepStrictEqual(formatLegacyTime('9e2'), null);
  assert.deepStrictEqual(formatStructuredTime('09:30:15'), '09:30:15');
  assert.deepStrictEqual(formatStructuredTime('09:30garbage'), null);
  assert.deepStrictEqual(formatStructuredTime('09:30:00.123'), null);
  assert.deepStrictEqual(parsePhone('+14155550100;ext=9', 'fax'), {
    number: '+14155550100', extension: '9', type: 'fax', unmappedType: null
  });
  assert.deepStrictEqual(parsePhone('+14155550100;ext=0967', 'voice'), {
    number: '+14155550100', extension: '0967', type: 'voice', unmappedType: null
  });
  for (const [source, expected] of [['voice', 'voice'], ['fax', 'fax'], ['text', 'text'], ['SMS', 'text'], ['cell', 'cell'], ['video', 'video'], ['pager', 'pager'], ['textphone', 'textphone']]) {
    assert.equal(parsePhone('+14155550100', source).type, expected);
  }
  assert.deepStrictEqual(parsePhone('+14155550100', 'Hotline'), {
    number: '+14155550100', extension: null, type: null, unmappedType: 'Hotline'
  });
  assert.equal(parsePhone(null, 'voice'), null);
  assert.equal(parsePhone('', 'voice'), null);

  const dispositions = fieldDispositions();
  assert.equal(dispositions.resources.internal_note, 'private');
  assert.equal(dispositions.notes.note, 'public_attribute');
  assert.equal(dispositions.notes.updated_at, 'external_report_only');
  assert.equal(dispositions.instructions.created_at, 'external_report_only');
  assert.equal(dispositions.services.updated_at, 'canonical');
  assert.equal(dispositions.phones.contact_id, 'canonical');
  assert.equal(dispositions.schedule_days.close_day, 'canonical');
  assert.equal(dispositions.resources.contact_id, 'external_report_only');
  assert.equal(dispositions.services.contact_id, 'external_report_only');
  assert.equal(dispositions.schedule_days.open_day, 'external_report_only');
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
  const { prisma, stores } = mockPrisma();
  const report = await importSheltertechDump(prisma, process.env.SHELTERTECH_SEED_PATH);
  assert.equal(report.canonical_counts.organization, 187);
  assert.equal(report.canonical_counts.service, 248);
  assert.equal(report.canonical_counts.location, 187);
  assert.equal(report.canonical_counts.address, 187);
  assert.equal(report.canonical_counts.serviceAtLocation, 248);
  assert.equal(report.canonical_counts.schedule, 3075);
  assert.equal(report.ignored_source_counts.change_requests, 210);
  assert.equal(report.ignored_source_counts.field_changes, 420);
  assert.equal(report.warnings.filter(({ code }) => code === 'UNKNOWN_PHONE_TYPE').length, 187);
  assert.equal(stores.phone.length, 187);
  assert.ok(stores.phone.every(({ organizationId, serviceId, contactId, type, description }) => organizationId && !serviceId && !contactId && type === null && description === 'ShelterTech service type: Business'));
  assert.equal(report.mappings.filter(({ rule }) => rule.endsWith('_note')).length, 435);
  assert.equal(report.mappings.filter(({ rule }) => rule === 'service_instruction').length, 209);
  assert.equal(report.mappings.filter(({ rule }) => rule === 'organization_site').length, 209);
});
