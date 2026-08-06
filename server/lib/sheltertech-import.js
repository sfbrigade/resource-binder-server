import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export const PUBLIC_TABLES = [
  'accessibilities', 'addresses', 'addresses_services', 'categories',
  'categories_keywords', 'categories_resources', 'categories_services',
  'categories_sites', 'category_relationships', 'contacts', 'documents',
  'documents_services', 'eligibilities', 'eligibilities_services',
  'eligibility_relationships', 'fundings', 'instructions', 'keywords',
  'keywords_resources', 'keywords_services', 'languages', 'news_articles',
  'notes', 'phones', 'programs', 'resources', 'resources_sites',
  'schedule_days', 'schedules', 'services', 'sites', 'synonym_groups',
  'synonyms'
];

export const SHELTERTECH_SCHEMA = {
  accessibilities: ['id', 'accessibility', 'details', 'created_at', 'updated_at'],
  addresses: ['id', 'created_at', 'updated_at', 'attention', 'address_1', 'address_2', 'address_3', 'address_4', 'city', 'state_province', 'postal_code', 'resource_id', 'latitude', 'longitude', 'online', 'region', 'name', 'description', 'transportation'],
  addresses_services: ['service_id', 'address_id'],
  categories: ['id', 'created_at', 'updated_at', 'name', 'top_level', 'vocabulary', 'featured'],
  categories_keywords: ['category_id', 'keyword_id'],
  categories_resources: ['category_id', 'resource_id'],
  categories_services: ['service_id', 'category_id', 'feature_rank'],
  categories_sites: ['category_id', 'site_id'],
  category_relationships: ['parent_id', 'child_id', 'child_priority_rank'],
  contacts: ['id', 'name', 'title', 'email', 'created_at', 'updated_at', 'resource_id', 'service_id'],
  documents: ['id', 'name', 'url', 'description', 'created_at', 'updated_at'],
  documents_services: ['service_id', 'document_id'],
  eligibilities: ['id', 'name', 'created_at', 'updated_at', 'feature_rank', 'is_parent', 'parent_id'],
  eligibilities_services: ['service_id', 'eligibility_id'],
  eligibility_relationships: ['parent_id', 'child_id'],
  fundings: ['id', 'source', 'created_at', 'updated_at'],
  instructions: ['id', 'instruction', 'created_at', 'updated_at', 'service_id'],
  keywords: ['id', 'name'],
  keywords_resources: ['resource_id', 'keyword_id'],
  keywords_services: ['service_id', 'keyword_id'],
  languages: ['id', 'language', 'created_at', 'updated_at'],
  news_articles: ['id', 'headline', 'effective_date', 'body', 'priority', 'expiration_date', 'created_at', 'updated_at', 'url'],
  notes: ['id', 'note', 'resource_id', 'service_id', 'created_at', 'updated_at'],
  phones: ['id', 'created_at', 'updated_at', 'number', 'service_type', 'resource_id', 'description', 'service_id', 'contact_id', 'language_id'],
  programs: ['id', 'name', 'alternate_name', 'description', 'created_at', 'updated_at', 'resource_id'],
  resources: ['id', 'created_at', 'updated_at', 'name', 'short_description', 'long_description', 'website', 'verified_at', 'email', 'status', 'certified', 'alternate_name', 'legal_status', 'contact_id', 'funding_id', 'certified_at', 'featured', 'source_attribution', 'internal_note'],
  resources_sites: ['resource_id', 'site_id'],
  schedule_days: ['id', 'created_at', 'updated_at', 'day', 'opens_at', 'closes_at', 'schedule_id', 'open_time', 'open_day', 'close_time', 'close_day'],
  schedules: ['id', 'created_at', 'updated_at', 'resource_id', 'service_id', 'hours_known'],
  services: ['id', 'created_at', 'updated_at', 'name', 'long_description', 'eligibility', 'required_documents', 'fee', 'application_process', 'resource_id', 'verified_at', 'email', 'status', 'certified', 'program_id', 'interpretation_services', 'url', 'wait_time', 'contact_id', 'funding_id', 'alternate_name', 'certified_at', 'featured', 'source_attribution', 'internal_note', 'short_description', 'boosted_category_id'],
  sites: ['id', 'site_code'],
  synonym_groups: ['id', 'group_type', 'created_at', 'updated_at'],
  synonyms: ['id', 'word', 'synonym_group_id', 'created_at', 'updated_at']
};

const DAY_CODES = {
  Sunday: 'SU',
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA'
};

function uuidv5 (name, namespace = UUID_NAMESPACE) {
  const namespaceBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(namespaceBytes).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function sheltertechUuid (entity, sourceKey) {
  return uuidv5(`sheltertech:${entity}:${sourceKey}`);
}

function decodeCopyValue (value) {
  if (value === '\\N') return null;
  return value.replace(/\\([btnr\\])/g, (_, char) => ({
    b: '\b',
    t: '\t',
    n: '\n',
    r: '\r',
    '\\': '\\'
  })[char]);
}

export function parsePostgresDump (contents) {
  const wanted = new Set(PUBLIC_TABLES);
  const tables = new Map(PUBLIC_TABLES.map((table) => [table, []]));
  const columnsByTable = new Map();
  let table;
  let columns;

  for (const line of contents.split('\n')) {
    const copy = line.match(/^COPY public\.([^ ]+) \(([^)]+)\) FROM stdin;$/);
    if (copy) {
      table = wanted.has(copy[1]) ? copy[1] : undefined;
      columns = table ? copy[2].split(', ') : undefined;
      if (table) columnsByTable.set(table, columns);
      continue;
    }
    if (line === '\\.') {
      table = undefined;
      columns = undefined;
      continue;
    }
    if (!table) continue;

    const values = line.split('\t').map(decodeCopyValue);
    if (values.length !== columns.length) {
      throw new Error(`${table}: expected ${columns.length} columns, found ${values.length}`);
    }
    tables.get(table).push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  }

  return { tables, columnsByTable };
}

export function validateSourceSchema (columnsByTable) {
  const missing = PUBLIC_TABLES.filter((table) => !columnsByTable.has(table));
  if (missing.length) throw new Error(`Missing public tables: ${missing.join(', ')}`);

  for (const table of PUBLIC_TABLES) {
    const expected = SHELTERTECH_SCHEMA[table];
    const actual = columnsByTable.get(table);
    if (expected.join('\0') !== actual.join('\0')) {
      throw new Error(`${table}: source columns changed; expected (${expected.join(', ')}), found (${actual.join(', ')})`);
    }
  }
}

function sourceKey (table, row) {
  if (row.id != null) return row.id;
  return Object.entries(row).map(([key, value]) => `${key}=${value ?? 'NULL'}`).join('|');
}

function checksum (row) {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

function text (value) {
  return value === null || value === '' ? null : value;
}

function decimal (value) {
  return value === null || value === '' ? null : value;
}

function date (value) {
  return value ? new Date(`${value.replace(' ', 'T')}Z`) : null;
}

function description (...parts) {
  return parts.map(text).filter(Boolean).join('\n\n') || null;
}

export function formatLegacyTime (value) {
  if (value === null) return null;
  const number = Number(value);
  const hours = Math.floor(number / 100);
  const minutes = number % 100;
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function indexById (rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy (rows, field) {
  const result = new Map();
  for (const row of rows) {
    const key = row[field];
    if (key == null) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return result;
}

async function upsert (delegate, id, data) {
  await delegate.upsert({ where: { id }, create: { id, ...data }, update: data });
}

function mapping (table, key, targetType, targetId, rule = null) {
  return { table, key: String(key), targetType, targetId, rule };
}

function issue (sourceTable, sourceKey, field, code, message, details) {
  return { sourceTable, sourceKey: String(sourceKey), field, code, message, details };
}

async function importCanonical (tx, tables) {
  const mappings = [];
  const issues = [];
  const resources = tables.get('resources');
  const services = tables.get('services');
  const addresses = tables.get('addresses');

  for (const row of resources) {
    const id = sheltertechUuid('organization', row.id);
    await upsert(tx.organization, id, {
      name: row.name,
      alternateName: text(row.alternate_name),
      description: description(row.short_description, row.long_description),
      email: text(row.email),
      website: text(row.website),
      legalStatus: text(row.legal_status)
    });
    mappings.push(mapping('resources', row.id, 'organization', id, 'resource_to_organization'));
  }

  for (const row of tables.get('programs')) {
    if (!row.resource_id) continue;
    const id = sheltertechUuid('program', row.id);
    await upsert(tx.program, id, {
      organizationId: sheltertechUuid('organization', row.resource_id),
      name: row.name,
      alternateName: text(row.alternate_name),
      description: description(row.description) ?? row.name
    });
    mappings.push(mapping('programs', row.id, 'program', id, 'program_to_program'));
  }

  for (const row of services) {
    if (!row.resource_id) throw new Error(`services:${row.id} has no resource_id`);
    if (row.status !== '1') throw new Error(`services:${row.id} has unmapped status ${row.status}`);
    const id = sheltertechUuid('service', row.id);
    await upsert(tx.service, id, {
      organizationId: sheltertechUuid('organization', row.resource_id),
      programId: row.program_id ? sheltertechUuid('program', row.program_id) : null,
      name: row.name,
      alternateName: text(row.alternate_name),
      description: description(row.short_description, row.long_description),
      url: text(row.url),
      email: text(row.email),
      status: 'active',
      interpretationServices: text(row.interpretation_services),
      applicationProcess: text(row.application_process),
      feesDescription: text(row.fee),
      waitTime: text(row.wait_time),
      fees: text(row.fee),
      eligibilityDescription: text(row.eligibility),
      lastModified: date(row.updated_at)
    });
    mappings.push(mapping('services', row.id, 'service', id, 'service_to_service'));

    if (text(row.required_documents)) {
      const documentId = sheltertechUuid('required_document_text', row.id);
      await upsert(tx.requiredDocument, documentId, {
        serviceId: id,
        document: row.required_documents,
        uri: null
      });
      mappings.push(mapping('services', row.id, 'required_document', documentId, 'required_documents_text'));
    }
  }

  for (const row of addresses) {
    if (!row.resource_id) continue;
    const locationId = sheltertechUuid('location', row.id);
    const addressId = sheltertechUuid('address', row.id);
    await upsert(tx.location, locationId, {
      locationType: 'physical',
      organizationId: sheltertechUuid('organization', row.resource_id),
      name: text(row.name),
      description: text(row.description),
      transportation: text(row.transportation),
      latitude: decimal(row.latitude),
      longitude: decimal(row.longitude)
    });
    await upsert(tx.address, addressId, {
      locationId,
      attention: text(row.attention),
      address1: row.address_1,
      address2: text(row.address_2),
      city: row.city,
      region: text(row.region),
      stateProvince: row.state_province,
      postalCode: row.postal_code,
      country: 'US',
      addressType: 'physical'
    });
    mappings.push(
      mapping('addresses', row.id, 'location', locationId, 'address_to_location'),
      mapping('addresses', row.id, 'address', addressId, 'address_to_address')
    );
  }

  for (const row of tables.get('contacts')) {
    const id = sheltertechUuid('contact', row.id);
    await upsert(tx.contact, id, {
      organizationId: row.resource_id ? sheltertechUuid('organization', row.resource_id) : null,
      serviceId: row.service_id ? sheltertechUuid('service', row.service_id) : null,
      name: text(row.name),
      title: text(row.title),
      email: text(row.email)
    });
    mappings.push(mapping('contacts', row.id, 'contact', id, 'contact_to_contact'));
  }

  for (const row of tables.get('phones')) {
    const id = sheltertechUuid('phone', row.id);
    await upsert(tx.phone, id, {
      organizationId: row.resource_id ? sheltertechUuid('organization', row.resource_id) : null,
      serviceId: row.service_id ? sheltertechUuid('service', row.service_id) : null,
      contactId: row.contact_id ? sheltertechUuid('contact', row.contact_id) : null,
      number: row.number,
      type: text(row.service_type)?.toLowerCase().includes('fax') ? 'fax' : 'voice',
      description: text(row.description)
    });
    mappings.push(mapping('phones', row.id, 'phone', id, 'phone_to_phone'));
  }

  const fundingById = indexById(tables.get('fundings'));
  for (const row of resources) {
    if (!row.funding_id || !fundingById.has(row.funding_id)) continue;
    const source = fundingById.get(row.funding_id);
    const id = sheltertechUuid('organization_funding', `${row.id}:${source.id}`);
    await upsert(tx.funding, id, {
      organizationId: sheltertechUuid('organization', row.id),
      serviceId: null,
      source: text(source.source)
    });
    mappings.push(mapping('fundings', source.id, 'funding', id, 'organization_funding'));
  }
  for (const row of services) {
    if (!row.funding_id || !fundingById.has(row.funding_id)) continue;
    const source = fundingById.get(row.funding_id);
    const id = sheltertechUuid('service_funding', `${row.id}:${source.id}`);
    await upsert(tx.funding, id, {
      organizationId: null,
      serviceId: sheltertechUuid('service', row.id),
      source: text(source.source)
    });
    mappings.push(mapping('fundings', source.id, 'funding', id, 'service_funding'));
  }

  const categoryTaxonomyId = sheltertechUuid('taxonomy', 'categories');
  const eligibilityTaxonomyId = sheltertechUuid('taxonomy', 'eligibilities');
  await upsert(tx.taxonomy, categoryTaxonomyId, {
    name: 'ShelterTech categories',
    description: 'Categories imported from ShelterTech.',
    version: 'legacy'
  });
  await upsert(tx.taxonomy, eligibilityTaxonomyId, {
    name: 'ShelterTech eligibilities',
    description: 'Eligibility terms imported from ShelterTech.',
    version: 'legacy'
  });

  const categoryParents = groupBy(tables.get('category_relationships'), 'child_id');
  for (const row of tables.get('categories')) {
    const id = sheltertechUuid('category_term', row.id);
    await upsert(tx.taxonomyTerm, id, {
      taxonomyId: categoryTaxonomyId,
      code: row.id,
      name: row.name,
      description: row.name,
      taxonomy: 'ShelterTech categories',
      parentId: null
    });
    mappings.push(mapping('categories', row.id, 'taxonomy_term', id, 'category_to_taxonomy_term'));
  }
  for (const row of tables.get('categories')) {
    const parents = categoryParents.get(row.id) ?? [];
    if (parents.length > 1) {
      issues.push(issue(
        'categories', row.id, 'parent_id', 'AMBIGUOUS_PARENT',
        'HSDS permits one parent; no canonical parent was selected.',
        { parent_ids: parents.map(({ parent_id: parentId }) => parentId) }
      ));
    } else if (parents[0]) {
      const targetId = sheltertechUuid('category_term', row.id);
      await tx.taxonomyTerm.update({
        where: { id: targetId },
        data: { parentId: sheltertechUuid('category_term', parents[0].parent_id) }
      });
      mappings.push(mapping(
        'category_relationships', sourceKey('category_relationships', parents[0]),
        'taxonomy_term', targetId, 'taxonomy_term_parent'
      ));
    }
  }

  const eligibilityParents = groupBy(tables.get('eligibility_relationships'), 'child_id');
  for (const row of tables.get('eligibilities')) {
    const id = sheltertechUuid('eligibility_term', row.id);
    await upsert(tx.taxonomyTerm, id, {
      taxonomyId: eligibilityTaxonomyId,
      code: row.id,
      name: row.name,
      description: row.name,
      taxonomy: 'ShelterTech eligibilities',
      parentId: null
    });
    mappings.push(mapping('eligibilities', row.id, 'taxonomy_term', id, 'eligibility_to_taxonomy_term'));
  }
  for (const row of tables.get('eligibilities')) {
    const relationships = eligibilityParents.get(row.id) ?? [];
    const parents = [...new Set([
      row.parent_id,
      ...relationships.map(({ parent_id: parentId }) => parentId)
    ].filter(Boolean))];
    if (parents.length > 1) {
      issues.push(issue(
        'eligibilities', row.id, 'parent_id', 'AMBIGUOUS_PARENT',
        'HSDS permits one parent; no canonical parent was selected.',
        { parent_ids: parents }
      ));
    } else if (parents[0]) {
      const targetId = sheltertechUuid('eligibility_term', row.id);
      await tx.taxonomyTerm.update({
        where: { id: targetId },
        data: { parentId: sheltertechUuid('eligibility_term', parents[0]) }
      });
      for (const relationship of relationships) {
        mappings.push(mapping(
          'eligibility_relationships', sourceKey('eligibility_relationships', relationship),
          'taxonomy_term', targetId, 'taxonomy_term_parent'
        ));
      }
    }
  }

  for (const row of tables.get('categories_services')) {
    const id = sheltertechUuid('service_category_attribute', `${row.service_id}:${row.category_id}`);
    await upsert(tx.attribute, id, {
      linkId: sheltertechUuid('service', row.service_id),
      taxonomyTermId: sheltertechUuid('category_term', row.category_id),
      linkType: 'category',
      linkEntity: 'service',
      value: text(row.feature_rank),
      label: null
    });
    mappings.push(mapping('categories_services', sourceKey('categories_services', row), 'attribute', id, 'service_category'));
  }
  for (const row of tables.get('categories_resources')) {
    const id = sheltertechUuid('organization_category_attribute', `${row.resource_id}:${row.category_id}`);
    await upsert(tx.attribute, id, {
      linkId: sheltertechUuid('organization', row.resource_id),
      taxonomyTermId: sheltertechUuid('category_term', row.category_id),
      linkType: 'category',
      linkEntity: 'organization',
      value: null,
      label: null
    });
    mappings.push(mapping('categories_resources', sourceKey('categories_resources', row), 'attribute', id, 'organization_category'));
  }
  for (const row of tables.get('eligibilities_services')) {
    const id = sheltertechUuid('service_eligibility_attribute', `${row.service_id}:${row.eligibility_id}`);
    await upsert(tx.attribute, id, {
      linkId: sheltertechUuid('service', row.service_id),
      taxonomyTermId: sheltertechUuid('eligibility_term', row.eligibility_id),
      linkType: 'eligibility',
      linkEntity: 'service',
      value: null,
      label: null
    });
    mappings.push(mapping('eligibilities_services', sourceKey('eligibilities_services', row), 'attribute', id, 'service_eligibility'));
  }

  const documentsById = indexById(tables.get('documents'));
  for (const row of tables.get('documents_services')) {
    const document = documentsById.get(row.document_id);
    if (!document) throw new Error(`documents_services references missing document ${row.document_id}`);
    const id = sheltertechUuid('required_document', `${row.service_id}:${row.document_id}`);
    await upsert(tx.requiredDocument, id, {
      serviceId: sheltertechUuid('service', row.service_id),
      document: description(document.name, document.description),
      uri: text(document.url)
    });
    mappings.push(
      mapping('documents_services', sourceKey('documents_services', row), 'required_document', id, 'document_service'),
      mapping('documents', document.id, 'required_document', id, 'document_service')
    );
  }

  const scheduleById = indexById(tables.get('schedules'));
  for (const row of tables.get('schedule_days')) {
    const schedule = scheduleById.get(row.schedule_id);
    if (!schedule?.service_id) continue;
    const opensAt = formatLegacyTime(row.opens_at);
    const closesAt = formatLegacyTime(row.closes_at);
    if (row.opens_at && !opensAt) throw new Error(`schedule_days:${row.id} has invalid opens_at`);
    if (row.closes_at && !closesAt) throw new Error(`schedule_days:${row.id} has invalid closes_at`);
    const id = sheltertechUuid('schedule_day', row.id);
    await upsert(tx.schedule, id, {
      serviceId: sheltertechUuid('service', schedule.service_id),
      freq: DAY_CODES[row.day] ? 'WEEKLY' : null,
      interval: DAY_CODES[row.day] ? 1 : null,
      byday: DAY_CODES[row.day] ?? null,
      opensAt,
      closesAt,
      notes: row.close_day && row.close_day !== row.day ? `Closes ${row.close_day}` : null
    });
    mappings.push(
      mapping('schedule_days', row.id, 'schedule', id, 'schedule_day_to_schedule'),
      mapping('schedules', schedule.id, 'schedule', id, 'service_schedule')
    );
  }

  for (const row of tables.get('addresses_services')) {
    const id = sheltertechUuid('service_at_location', `${row.service_id}:${row.address_id}`);
    await upsert(tx.serviceAtLocation, id, {
      serviceId: sheltertechUuid('service', row.service_id),
      locationId: sheltertechUuid('location', row.address_id),
      description: null
    });
    mappings.push(mapping('addresses_services', sourceKey('addresses_services', row), 'service_at_location', id, 'explicit_service_location'));
  }

  const languagesById = indexById(tables.get('languages'));
  for (const phone of tables.get('phones')) {
    if (!phone.language_id || !languagesById.has(phone.language_id)) continue;
    const language = languagesById.get(phone.language_id);
    const id = sheltertechUuid('phone_language', `${phone.id}:${language.id}`);
    await upsert(tx.language, id, {
      phoneId: sheltertechUuid('phone', phone.id),
      name: text(language.language),
      code: null,
      note: null
    });
    mappings.push(mapping('languages', language.id, 'language', id, 'phone_language'));
  }

  return { mappings, issues };
}

export async function importSheltertechDump (prisma, dumpPath) {
  const { tables, columnsByTable } = parsePostgresDump(await fs.readFile(dumpPath, 'utf8'));

  const run = await prisma.importRun.create({
    data: { source: dumpPath, status: 'running' }
  });

  const sourceRecords = [];
  const sourceRecordIds = new Map();
  for (const [table, rows] of tables) {
    for (const [index, row] of rows.entries()) {
      const mappingKey = sourceKey(table, row);
      const key = row.id == null ? `${mappingKey}#${index}` : mappingKey;
      const id = sheltertechUuid('source_record', `${run.id}:${table}:${key}`);
      sourceRecords.push({
        id,
        importRunId: run.id,
        sourceTable: table,
        sourceKey: key,
        payload: row,
        checksum: checksum(row)
      });
      const lookupKey = `${table}:${mappingKey}`;
      if (!sourceRecordIds.has(lookupKey)) sourceRecordIds.set(lookupKey, []);
      sourceRecordIds.get(lookupKey).push(id);
    }
  }

  try {
    if (sourceRecords.length) await prisma.sourceRecord.createMany({ data: sourceRecords });
    validateSourceSchema(columnsByTable);
    const summary = await prisma.$transaction(
      async (tx) => {
        const { mappings, issues } = await importCanonical(tx, tables);
        const mappingRows = mappings.flatMap(({ table, key, ...entry }) =>
          (sourceRecordIds.get(`${table}:${key}`) ?? []).map((sourceRecordId) => ({
            id: sheltertechUuid('source_mapping', `${sourceRecordId}:${entry.targetType}:${entry.targetId}`),
            sourceRecordId,
            ...entry
          }))
        );
        if (mappingRows.length) {
          await tx.sourceMapping.createMany({ data: mappingRows, skipDuplicates: true });
        }
        if (issues.length) {
          await tx.importIssue.createMany({
            data: issues.map((entry) => ({
              id: sheltertechUuid('import_issue', `${run.id}:${entry.sourceTable}:${entry.sourceKey}:${entry.field}:${entry.code}`),
              importRunId: run.id,
              ...entry
            }))
          });
        }
        const mappedSourceRecords = new Set(mappingRows.map(({ sourceRecordId }) => sourceRecordId)).size;
        const summary = {
          source_records: sourceRecords.length,
          mapped_records: mappedSourceRecords,
          preserved_only_records: sourceRecords.length - mappedSourceRecords,
          canonical_mappings: mappingRows.length,
          issues: issues.length,
          table_counts: Object.fromEntries([...tables].map(([table, rows]) => [table, rows.length]))
        };
        await tx.importRun.update({
          where: { id: run.id },
          data: { status: 'complete', completedAt: new Date(), summary }
        });
        return summary;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
    return { runId: run.id, ...summary };
  } catch (error) {
    await prisma.importIssue.create({
      data: { importRunId: run.id, code: 'IMPORT_FAILED', message: error.message }
    });
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: 'failed', completedAt: new Date() }
    });
    throw error;
  }
}
