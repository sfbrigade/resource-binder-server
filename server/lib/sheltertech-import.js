import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export const CONVERSION_VERSION = 'sheltertech-hsds-v2';

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

const CANONICAL_DELEGATES = [
  'organization', 'program', 'service', 'serviceAtLocation', 'location',
  'phone', 'contact', 'address', 'schedule', 'funding', 'serviceArea',
  'language', 'accessibility', 'requiredDocument', 'taxonomy',
  'taxonomyTerm', 'attribute', 'metadata', 'metaTableDescription',
  'costOption', 'organizationIdentifier', 'serviceCapacity', 'unit', 'url'
];

const UNSUPPORTED_TABLES = new Set([
  'accessibilities', 'categories_keywords', 'categories_sites', 'keywords',
  'keywords_resources', 'keywords_services', 'news_articles',
  'synonym_groups', 'synonyms'
]);

const PRIVATE_FIELDS = new Set([
  'resources.internal_note', 'services.internal_note'
]);

const PUBLIC_ATTRIBUTE_TABLES = new Set([
  'instructions', 'notes', 'resources_sites', 'sites'
]);

const PUBLIC_ATTRIBUTE_FIELDS = new Set([
  'categories.top_level', 'categories.featured',
  'eligibilities.feature_rank', 'eligibilities.is_parent',
  'eligibility_relationships.parent_id', 'eligibility_relationships.child_id',
  'resources.featured', 'services.featured', 'services.boosted_category_id'
]);

const REPORT_ONLY_KEYS = new Set(['resources.status']);

const REPORT_ONLY_FIELDS = new Set([
  'created_at', 'verified_at', 'certified', 'certified_at', 'featured',
  'source_attribution', 'contact_id', 'updated_at', 'address_3', 'address_4',
  'vocabulary', 'child_priority_rank'
]);

function fieldDisposition (table, field) {
  const key = `${table}.${field}`;
  if (PRIVATE_FIELDS.has(key)) return 'private';
  if (PUBLIC_ATTRIBUTE_TABLES.has(table) || PUBLIC_ATTRIBUTE_FIELDS.has(key)) return 'public_attribute';
  if (UNSUPPORTED_TABLES.has(table)) return 'unclassified';
  if (REPORT_ONLY_KEYS.has(key)) return 'external_report_only';
  if (REPORT_ONLY_FIELDS.has(field)) return 'external_report_only';
  return 'canonical';
}

export function fieldDispositions () {
  return Object.fromEntries(PUBLIC_TABLES.map((table) => [
    table,
    Object.fromEntries(SHELTERTECH_SCHEMA[table].map((field) => [field, fieldDisposition(table, field)]))
  ]));
}

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

function sourceKey (row) {
  if (row.id != null) return String(row.id);
  return Object.entries(row).map(([key, value]) => `${key}=${value ?? 'NULL'}`).join('|');
}

function text (value) {
  return value === null || value === '' ? null : value;
}

function date (value) {
  return value ? new Date(`${value.replace(' ', 'T')}Z`) : null;
}

function description (...parts) {
  return parts.map(text).filter(Boolean).join('\n\n') || null;
}

function truthy (value) {
  return value === true || value === 't' || value === 'true' || value === '1';
}

export function formatLegacyTime (value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  const hours = Math.floor(number / 100);
  const minutes = number % 100;
  if (!Number.isInteger(number) || minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

export function formatStructuredTime (value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return `${match[1]}:${match[2]}:${String(seconds).padStart(2, '0')}`;
}

export function parsePhone (number, serviceType) {
  if (number === null || number === undefined || number === '') return null;
  const extension = String(number).match(/^(.*?);ext=(\d+)$/i);
  const parsedNumber = extension ? extension[1] : number;
  if (parsedNumber === '') return null;
  const kind = String(serviceType ?? '').toLowerCase();
  return {
    number: parsedNumber,
    extension: extension ? extension[2] : null,
    type: kind.includes('fax')
      ? 'fax'
      : kind.includes('text') || kind.includes('sms')
        ? 'text'
        : 'voice'
  };
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

function indexById (rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function issue (sourceTable, key, field, code, message, details) {
  return { source_table: sourceTable, source_key: key == null ? null : String(key), field, code, message, details };
}

function validateSourceData (tables) {
  const issues = [];
  const ids = new Map();

  for (const [table, rows] of tables) {
    if (UNSUPPORTED_TABLES.has(table) && rows.length) {
      issues.push(issue(table, null, null, 'UNCLASSIFIED_DATA', `${table} has rows but no approved conversion rule`, { rows: rows.length }));
    }
    const seen = new Set();
    for (const row of rows) {
      if (row.id == null) continue;
      if (seen.has(row.id)) issues.push(issue(table, row.id, 'id', 'DUPLICATE_ID', `${table} contains duplicate id ${row.id}`));
      seen.add(row.id);
    }
    ids.set(table, seen);
  }

  const ref = (table, row, field, target, required = false) => {
    const value = row[field];
    if (value == null || value === '') {
      if (required) issues.push(issue(table, sourceKey(row), field, 'MISSING_REFERENCE', `${table}.${field} is required`));
    } else if (!ids.get(target)?.has(value)) {
      issues.push(issue(table, sourceKey(row), field, 'BROKEN_REFERENCE', `${table}.${field} references missing ${target}:${value}`));
    }
  };

  for (const row of tables.get('resources')) {
    if (!text(row.name)) issues.push(issue('resources', row.id, 'name', 'MISSING_REQUIRED_VALUE', 'Organization name is required'));
    ref('resources', row, 'funding_id', 'fundings');
  }
  for (const row of tables.get('programs')) ref('programs', row, 'resource_id', 'resources', true);
  for (const row of tables.get('services')) {
    if (!text(row.name)) issues.push(issue('services', row.id, 'name', 'MISSING_REQUIRED_VALUE', 'Service name is required'));
    if (row.status !== '1') issues.push(issue('services', row.id, 'status', 'UNKNOWN_STATUS', `Unrecognized ShelterTech service status ${row.status}`));
    ref('services', row, 'resource_id', 'resources', true);
    ref('services', row, 'program_id', 'programs');
    ref('services', row, 'funding_id', 'fundings');
    ref('services', row, 'boosted_category_id', 'categories');
  }
  for (const row of tables.get('addresses')) {
    ref('addresses', row, 'resource_id', 'resources', true);
    if (!truthy(row.online)) {
      for (const field of ['address_1', 'city', 'state_province', 'postal_code']) {
        if (!text(row[field])) {
          issues.push(issue('addresses', row.id, field, 'MISSING_REQUIRED_VALUE', `Address ${field} is required for physical locations`));
        }
      }
    }
  }
  for (const row of tables.get('contacts')) {
    ref('contacts', row, 'resource_id', 'resources');
    ref('contacts', row, 'service_id', 'services');
  }
  for (const row of tables.get('phones')) {
    ref('phones', row, 'resource_id', 'resources');
    ref('phones', row, 'service_id', 'services');
    ref('phones', row, 'contact_id', 'contacts');
    ref('phones', row, 'language_id', 'languages');
    if (parsePhone(row.number, row.service_type) == null) {
      issues.push(issue('phones', row.id, 'number', 'MISSING_REQUIRED_VALUE', 'Phone number is required'));
    }
  }
  for (const row of tables.get('addresses_services')) {
    ref('addresses_services', row, 'service_id', 'services', true);
    ref('addresses_services', row, 'address_id', 'addresses', true);
  }
  for (const row of tables.get('categories_resources')) {
    ref('categories_resources', row, 'category_id', 'categories', true);
    ref('categories_resources', row, 'resource_id', 'resources', true);
  }
  for (const row of tables.get('categories_services')) {
    ref('categories_services', row, 'category_id', 'categories', true);
    ref('categories_services', row, 'service_id', 'services', true);
  }
  for (const row of tables.get('category_relationships')) {
    ref('category_relationships', row, 'parent_id', 'categories', true);
    ref('category_relationships', row, 'child_id', 'categories', true);
  }
  for (const row of tables.get('eligibilities_services')) {
    ref('eligibilities_services', row, 'eligibility_id', 'eligibilities', true);
    ref('eligibilities_services', row, 'service_id', 'services', true);
  }
  for (const row of tables.get('eligibility_relationships')) {
    ref('eligibility_relationships', row, 'parent_id', 'eligibilities', true);
    ref('eligibility_relationships', row, 'child_id', 'eligibilities', true);
  }
  for (const row of tables.get('documents_services')) {
    ref('documents_services', row, 'document_id', 'documents', true);
    ref('documents_services', row, 'service_id', 'services', true);
  }
  for (const row of tables.get('instructions')) ref('instructions', row, 'service_id', 'services', true);
  for (const row of tables.get('resources_sites')) {
    ref('resources_sites', row, 'resource_id', 'resources', true);
    ref('resources_sites', row, 'site_id', 'sites', true);
  }
  for (const row of tables.get('notes')) {
    ref('notes', row, 'resource_id', 'resources');
    ref('notes', row, 'service_id', 'services');
    if (!row.resource_id && !row.service_id) issues.push(issue('notes', row.id, null, 'MISSING_REFERENCE', 'Note must reference an organization or service'));
  }
  for (const row of tables.get('schedules')) {
    ref('schedules', row, 'resource_id', 'resources');
    ref('schedules', row, 'service_id', 'services');
    if (!row.resource_id && !row.service_id) issues.push(issue('schedules', row.id, null, 'MISSING_REFERENCE', 'Schedule must reference an organization or service'));
    if (row.resource_id && row.service_id) issues.push(issue('schedules', row.id, null, 'AMBIGUOUS_REFERENCE', 'Schedule cannot reference both an organization and service'));
  }
  for (const row of tables.get('schedule_days')) {
    ref('schedule_days', row, 'schedule_id', 'schedules', true);
    if (row.day != null && !DAY_CODES[row.day]) {
      issues.push(issue('schedule_days', row.id, 'day', 'INVALID_DAY', `Unrecognized day ${row.day}`));
    }
    if (row.open_time != null && formatStructuredTime(row.open_time) == null) issues.push(issue('schedule_days', row.id, 'open_time', 'INVALID_TIME', `Invalid open_time ${row.open_time}`));
    if (row.close_time != null && formatStructuredTime(row.close_time) == null) issues.push(issue('schedule_days', row.id, 'close_time', 'INVALID_TIME', `Invalid close_time ${row.close_time}`));
    if (row.open_time == null && row.opens_at != null && formatLegacyTime(row.opens_at) == null) issues.push(issue('schedule_days', row.id, 'opens_at', 'INVALID_TIME', `Invalid opens_at ${row.opens_at}`));
    if (row.close_time == null && row.closes_at != null && formatLegacyTime(row.closes_at) == null) issues.push(issue('schedule_days', row.id, 'closes_at', 'INVALID_TIME', `Invalid closes_at ${row.closes_at}`));
  }

  const addressesByResource = groupBy(tables.get('addresses'), 'resource_id');
  const explicitByService = groupBy(tables.get('addresses_services'), 'service_id');
  for (const service of tables.get('services')) {
    if (!(explicitByService.get(service.id)?.length || addressesByResource.get(service.resource_id)?.length)) {
      issues.push(issue('services', service.id, 'resource_id', 'MISSING_LOCATION', 'Service has no explicit or organization location'));
    }
  }
  for (const schedule of tables.get('schedules')) {
    if (schedule.resource_id && !addressesByResource.get(schedule.resource_id)?.length) {
      issues.push(issue('schedules', schedule.id, 'resource_id', 'MISSING_LOCATION', 'Organization schedule has no location'));
    }
  }

  return issues;
}

async function ensureCanonicalEmpty (prisma) {
  const populated = [];
  for (const name of CANONICAL_DELEGATES) {
    if (await prisma[name].count()) populated.push(name);
  }
  if (populated.length) throw new Error(`Canonical HSDS tables are not empty: ${populated.join(', ')}`);
}

function mapping (sourceTable, key, targetType, targetId, rule, inferred = false) {
  return {
    source_table: sourceTable,
    source_key: String(key),
    target_type: targetType,
    target_id: targetId,
    rule,
    inferred
  };
}

async function importCanonical (tx, tables) {
  const mappings = [];
  const counts = {};
  const insert = async (delegate, data) => {
    await tx[delegate].create({ data });
    counts[delegate] = (counts[delegate] ?? 0) + 1;
  };
  const record = (...entries) => mappings.push(...entries);
  const resources = tables.get('resources');
  const services = tables.get('services');
  const addresses = tables.get('addresses');
  const addressesByResource = groupBy(addresses, 'resource_id');
  const addressesById = indexById(addresses);

  for (const row of resources) {
    const id = sheltertechUuid('organization', row.id);
    await insert('organization', {
      id,
      name: row.name,
      alternateName: text(row.alternate_name),
      description: description(row.short_description, row.long_description) ?? row.name,
      email: text(row.email),
      website: text(row.website),
      legalStatus: text(row.legal_status)
    });
    record(mapping('resources', row.id, 'organization', id, 'resource_to_organization'));
  }

  for (const row of tables.get('programs')) {
    const id = sheltertechUuid('program', row.id);
    await insert('program', {
      id,
      organizationId: sheltertechUuid('organization', row.resource_id),
      name: row.name,
      alternateName: text(row.alternate_name),
      description: description(row.description) ?? row.name
    });
    record(mapping('programs', row.id, 'program', id, 'program_to_program'));
  }

  for (const row of services) {
    const id = sheltertechUuid('service', row.id);
    await insert('service', {
      id,
      organizationId: sheltertechUuid('organization', row.resource_id),
      programId: row.program_id ? sheltertechUuid('program', row.program_id) : null,
      name: row.name,
      alternateName: text(row.alternate_name),
      description: description(row.short_description, row.long_description) ?? row.name,
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
    record(mapping('services', row.id, 'service', id, 'service_to_service'));

    if (text(row.required_documents)) {
      const documentId = sheltertechUuid('required_document_text', row.id);
      await insert('requiredDocument', { id: documentId, serviceId: id, document: row.required_documents, uri: null });
      record(mapping('services', row.id, 'required_document', documentId, 'required_documents_text'));
    }
  }

  for (const row of addresses) {
    const locationId = sheltertechUuid('location', row.id);
    const addressId = sheltertechUuid('address', row.id);
    const locationType = truthy(row.online) ? 'virtual' : 'physical';
    await insert('location', {
      id: locationId,
      locationType,
      organizationId: sheltertechUuid('organization', row.resource_id),
      name: text(row.name),
      description: text(row.description),
      transportation: text(row.transportation),
      latitude: text(row.latitude),
      longitude: text(row.longitude)
    });
    await insert('address', {
      id: addressId,
      locationId,
      attention: text(row.attention),
      address1: text(row.address_1) ?? '',
      address2: text(row.address_2),
      city: text(row.city) ?? '',
      region: text(row.region),
      stateProvince: text(row.state_province) ?? '',
      postalCode: text(row.postal_code) ?? '',
      country: 'US',
      addressType: locationType
    });
    record(
      mapping('addresses', row.id, 'location', locationId, 'address_to_location'),
      mapping('addresses', row.id, 'address', addressId, 'address_to_address')
    );
  }

  for (const row of tables.get('contacts')) {
    const id = sheltertechUuid('contact', row.id);
    await insert('contact', {
      id,
      organizationId: row.resource_id ? sheltertechUuid('organization', row.resource_id) : null,
      serviceId: row.service_id ? sheltertechUuid('service', row.service_id) : null,
      name: text(row.name),
      title: text(row.title),
      email: text(row.email)
    });
    record(mapping('contacts', row.id, 'contact', id, 'contact_to_contact'));
  }

  for (const row of tables.get('phones')) {
    const id = sheltertechUuid('phone', row.id);
    const phone = parsePhone(row.number, row.service_type);
    await insert('phone', {
      id,
      organizationId: row.resource_id ? sheltertechUuid('organization', row.resource_id) : null,
      serviceId: row.service_id ? sheltertechUuid('service', row.service_id) : null,
      contactId: row.contact_id ? sheltertechUuid('contact', row.contact_id) : null,
      number: phone.number,
      extension: phone.extension,
      type: phone.type,
      description: text(row.description)
    });
    record(mapping('phones', row.id, 'phone', id, 'phone_to_phone'));
  }

  const explicitLocations = groupBy(tables.get('addresses_services'), 'service_id');
  for (const service of services) {
    const explicit = explicitLocations.get(service.id);
    const serviceAddresses = explicit?.length
      ? explicit.map((row) => addressesById.get(row.address_id))
      : addressesByResource.get(service.resource_id);
    for (const address of serviceAddresses) {
      const id = sheltertechUuid('service_at_location', `${service.id}:${address.id}`);
      await insert('serviceAtLocation', {
        id,
        serviceId: sheltertechUuid('service', service.id),
        locationId: sheltertechUuid('location', address.id),
        description: text(address.description)
      });
      if (explicit?.length) {
        const join = explicit.find((row) => row.address_id === address.id);
        record(mapping('addresses_services', sourceKey(join), 'service_at_location', id, 'explicit_service_location'));
      } else {
        record(mapping('services', service.id, 'service_at_location', id, 'organization_address_fallback', true));
      }
    }
  }

  const fundingById = indexById(tables.get('fundings'));
  for (const row of resources) {
    if (!row.funding_id) continue;
    const source = fundingById.get(row.funding_id);
    const id = sheltertechUuid('organization_funding', `${row.id}:${source.id}`);
    await insert('funding', { id, organizationId: sheltertechUuid('organization', row.id), serviceId: null, source: text(source.source) });
    record(mapping('fundings', source.id, 'funding', id, 'organization_funding'));
  }
  for (const row of services) {
    if (!row.funding_id) continue;
    const source = fundingById.get(row.funding_id);
    const id = sheltertechUuid('service_funding', `${row.id}:${source.id}`);
    await insert('funding', { id, organizationId: null, serviceId: sheltertechUuid('service', row.id), source: text(source.source) });
    record(mapping('fundings', source.id, 'funding', id, 'service_funding'));
  }

  const categoryTaxonomyId = sheltertechUuid('taxonomy', 'categories');
  const eligibilityTaxonomyId = sheltertechUuid('taxonomy', 'eligibilities');
  const siteTaxonomyId = sheltertechUuid('taxonomy', 'sites');
  const legacyTaxonomyId = sheltertechUuid('taxonomy', 'legacy');
  await insert('taxonomy', { id: categoryTaxonomyId, name: 'ShelterTech categories', description: 'Categories imported from ShelterTech.', version: CONVERSION_VERSION });
  await insert('taxonomy', { id: eligibilityTaxonomyId, name: 'ShelterTech eligibilities', description: 'Eligibility terms imported from ShelterTech.', version: CONVERSION_VERSION });
  await insert('taxonomy', { id: siteTaxonomyId, name: 'ShelterTech sites', description: 'ShelterTech publication sites.', version: CONVERSION_VERSION });
  await insert('taxonomy', { id: legacyTaxonomyId, name: 'ShelterTech legacy', description: 'Public ShelterTech values without an exact HSDS field.', version: CONVERSION_VERSION });

  const legacyTerms = {
    note: 'Note',
    instruction: 'Instruction',
    category_top_level: 'Category top-level flag',
    category_featured: 'Category featured flag',
    eligibility_is_parent: 'Eligibility parent flag',
    eligibility_feature_rank: 'Eligibility feature rank',
    additional_parent: 'Additional taxonomy parent',
    featured: 'Featured record',
    boosted_category: 'Boosted category'
  };
  const legacyTermIds = {};
  for (const [code, name] of Object.entries(legacyTerms)) {
    const id = sheltertechUuid('legacy_term', code);
    legacyTermIds[code] = id;
    await insert('taxonomyTerm', { id, taxonomyId: legacyTaxonomyId, code, name, description: name, taxonomy: 'ShelterTech legacy' });
  }

  const categoryParents = groupBy(tables.get('category_relationships'), 'child_id');
  for (const row of tables.get('categories')) {
    const id = sheltertechUuid('category_term', row.id);
    await insert('taxonomyTerm', { id, taxonomyId: categoryTaxonomyId, code: row.id, name: row.name, description: row.name, taxonomy: 'ShelterTech categories' });
    record(mapping('categories', row.id, 'taxonomy_term', id, 'category_to_taxonomy_term'));
  }

  const eligibilityParents = groupBy(tables.get('eligibility_relationships'), 'child_id');
  for (const row of tables.get('eligibilities')) {
    const id = sheltertechUuid('eligibility_term', row.id);
    await insert('taxonomyTerm', { id, taxonomyId: eligibilityTaxonomyId, code: row.id, name: row.name, description: row.name, taxonomy: 'ShelterTech eligibilities' });
    record(mapping('eligibilities', row.id, 'taxonomy_term', id, 'eligibility_to_taxonomy_term'));
  }
  const siteTermIds = new Map();
  for (const row of tables.get('sites')) {
    const id = sheltertechUuid('site_term', row.id);
    siteTermIds.set(row.id, id);
    await insert('taxonomyTerm', { id, taxonomyId: siteTaxonomyId, code: row.site_code, name: row.site_code, description: `ShelterTech site ${row.site_code}`, taxonomy: 'ShelterTech sites' });
    record(mapping('sites', row.id, 'taxonomy_term', id, 'site_to_taxonomy_term'));
  }

  const addAttribute = async ({ sourceTable, key, entity, linkId, termId, linkType, value = null, label = null, rule }) => {
    const id = sheltertechUuid('attribute', `${sourceTable}:${key}:${entity}:${linkId}:${termId}:${value ?? ''}`);
    await insert('attribute', { id, linkId, taxonomyTermId: termId, linkType, linkEntity: entity, value, label });
    record(mapping(sourceTable, key, 'attribute', id, rule));
  };

  const applyParents = async (rows, parentsByChild, entity) => {
    const relationshipTable = entity === 'eligibility' ? 'eligibility_relationships' : 'category_relationships';
    for (const row of rows) {
      const parents = [...new Set([
        row.parent_id,
        ...(parentsByChild.get(row.id) ?? []).map((entry) => entry.parent_id)
      ].filter(Boolean))];
      if (!parents.length) continue;

      const childId = sheltertechUuid(`${entity}_term`, row.id);
      const [canonical, ...additional] = parents;
      await tx.taxonomyTerm.update({
        where: { id: childId },
        data: { parentId: sheltertechUuid(`${entity}_term`, canonical) }
      });
      const canonicalRelationship = (parentsByChild.get(row.id) ?? []).find((entry) => entry.parent_id === canonical);
      if (canonicalRelationship) {
        record(mapping(relationshipTable, sourceKey(canonicalRelationship), 'taxonomy_term', childId, 'taxonomy_term_parent'));
      }

      for (const parent of additional) {
        const relationship = (parentsByChild.get(row.id) ?? []).find((entry) => entry.parent_id === parent);
        await addAttribute({
          sourceTable: relationshipTable,
          key: relationship ? sourceKey(relationship) : `${parent}:${row.id}`,
          entity: 'taxonomy_term',
          linkId: childId,
          termId: legacyTermIds.additional_parent,
          linkType: 'additional_parent',
          value: sheltertechUuid(`${entity}_term`, parent),
          label: 'ShelterTech parent term',
          rule: 'ambiguous_taxonomy_parent'
        });
      }
    }
  };
  await applyParents(tables.get('categories'), categoryParents, 'category');
  await applyParents(tables.get('eligibilities'), eligibilityParents, 'eligibility');

  for (const row of tables.get('categories_services')) {
    await addAttribute({ sourceTable: 'categories_services', key: sourceKey(row), entity: 'service', linkId: sheltertechUuid('service', row.service_id), termId: sheltertechUuid('category_term', row.category_id), linkType: 'category', value: text(row.feature_rank), rule: 'service_category' });
  }
  for (const row of tables.get('categories_resources')) {
    await addAttribute({ sourceTable: 'categories_resources', key: sourceKey(row), entity: 'organization', linkId: sheltertechUuid('organization', row.resource_id), termId: sheltertechUuid('category_term', row.category_id), linkType: 'category', rule: 'organization_category' });
  }
  const eligibilityById = indexById(tables.get('eligibilities'));
  for (const row of tables.get('eligibilities_services')) {
    await addAttribute({ sourceTable: 'eligibilities_services', key: sourceKey(row), entity: 'service', linkId: sheltertechUuid('service', row.service_id), termId: sheltertechUuid('eligibility_term', row.eligibility_id), linkType: 'eligibility', value: text(eligibilityById.get(row.eligibility_id).feature_rank), rule: 'service_eligibility' });
  }

  for (const row of tables.get('categories')) {
    if (truthy(row.top_level)) await addAttribute({ sourceTable: 'categories', key: row.id, entity: 'taxonomy_term', linkId: sheltertechUuid('category_term', row.id), termId: legacyTermIds.category_top_level, linkType: 'legacy', value: 'true', rule: 'category_top_level' });
    if (truthy(row.featured)) await addAttribute({ sourceTable: 'categories', key: row.id, entity: 'taxonomy_term', linkId: sheltertechUuid('category_term', row.id), termId: legacyTermIds.category_featured, linkType: 'legacy', value: 'true', rule: 'category_featured' });
  }
  for (const row of tables.get('eligibilities')) {
    if (truthy(row.is_parent)) await addAttribute({ sourceTable: 'eligibilities', key: row.id, entity: 'taxonomy_term', linkId: sheltertechUuid('eligibility_term', row.id), termId: legacyTermIds.eligibility_is_parent, linkType: 'legacy', value: 'true', rule: 'eligibility_is_parent' });
    if (text(row.feature_rank)) await addAttribute({ sourceTable: 'eligibilities', key: row.id, entity: 'taxonomy_term', linkId: sheltertechUuid('eligibility_term', row.id), termId: legacyTermIds.eligibility_feature_rank, linkType: 'legacy', value: row.feature_rank, rule: 'eligibility_feature_rank' });
  }
  for (const row of resources) {
    if (truthy(row.featured)) await addAttribute({ sourceTable: 'resources', key: row.id, entity: 'organization', linkId: sheltertechUuid('organization', row.id), termId: legacyTermIds.featured, linkType: 'legacy', value: 'true', rule: 'organization_featured' });
  }
  for (const row of services) {
    if (truthy(row.featured)) await addAttribute({ sourceTable: 'services', key: row.id, entity: 'service', linkId: sheltertechUuid('service', row.id), termId: legacyTermIds.featured, linkType: 'legacy', value: 'true', rule: 'service_featured' });
    if (row.boosted_category_id) await addAttribute({ sourceTable: 'services', key: row.id, entity: 'service', linkId: sheltertechUuid('service', row.id), termId: legacyTermIds.boosted_category, linkType: 'legacy', value: sheltertechUuid('category_term', row.boosted_category_id), rule: 'service_boosted_category' });
  }
  for (const row of tables.get('notes')) {
    if (row.resource_id) await addAttribute({ sourceTable: 'notes', key: row.id, entity: 'organization', linkId: sheltertechUuid('organization', row.resource_id), termId: legacyTermIds.note, linkType: 'note', value: row.note, label: 'ShelterTech note', rule: 'organization_note' });
    if (row.service_id) await addAttribute({ sourceTable: 'notes', key: row.id, entity: 'service', linkId: sheltertechUuid('service', row.service_id), termId: legacyTermIds.note, linkType: 'note', value: row.note, label: 'ShelterTech note', rule: 'service_note' });
  }
  for (const row of tables.get('instructions')) {
    await addAttribute({ sourceTable: 'instructions', key: row.id, entity: 'service', linkId: sheltertechUuid('service', row.service_id), termId: legacyTermIds.instruction, linkType: 'instruction', value: row.instruction, label: 'ShelterTech instruction', rule: 'service_instruction' });
  }
  for (const row of tables.get('resources_sites')) {
    await addAttribute({ sourceTable: 'resources_sites', key: sourceKey(row), entity: 'organization', linkId: sheltertechUuid('organization', row.resource_id), termId: siteTermIds.get(row.site_id), linkType: 'site', label: 'ShelterTech site membership', rule: 'organization_site' });
  }

  const documentsById = indexById(tables.get('documents'));
  for (const row of tables.get('documents_services')) {
    const document = documentsById.get(row.document_id);
    const id = sheltertechUuid('required_document', `${row.service_id}:${row.document_id}`);
    await insert('requiredDocument', { id, serviceId: sheltertechUuid('service', row.service_id), document: description(document.name, document.description), uri: text(document.url) });
    record(
      mapping('documents_services', sourceKey(row), 'required_document', id, 'document_service'),
      mapping('documents', document.id, 'required_document', id, 'document_service')
    );
  }

  const languagesById = indexById(tables.get('languages'));
  for (const phone of tables.get('phones')) {
    if (!phone.language_id) continue;
    const language = languagesById.get(phone.language_id);
    const id = sheltertechUuid('phone_language', `${phone.id}:${language.id}`);
    await insert('language', { id, phoneId: sheltertechUuid('phone', phone.id), name: text(language.language), code: null, note: null });
    record(mapping('languages', language.id, 'language', id, 'phone_language'));
  }

  const scheduleDays = groupBy(tables.get('schedule_days'), 'schedule_id');
  for (const schedule of tables.get('schedules')) {
    const targets = schedule.service_id
      ? [{ type: 'service', sourceId: schedule.service_id, targetId: sheltertechUuid('service', schedule.service_id) }]
      : addressesByResource.get(schedule.resource_id).map((address) => ({ type: 'location', sourceId: address.id, targetId: sheltertechUuid('location', address.id) }));
    const days = scheduleDays.get(schedule.id) ?? [];
    for (const target of targets) {
      const rows = days.length ? days : [null];
      for (const day of rows) {
        const key = day?.id ?? schedule.id;
        const id = target.type === 'service'
          ? sheltertechUuid(day ? 'schedule_day' : 'schedule', key)
          : sheltertechUuid(day ? 'location_schedule_day' : 'location_schedule', `${key}:${target.sourceId}`);
        const opensAt = day
          ? day.open_time != null ? formatStructuredTime(day.open_time) : formatLegacyTime(day.opens_at)
          : null;
        const closesAt = day
          ? day.close_time != null ? formatStructuredTime(day.close_time) : formatLegacyTime(day.closes_at)
          : null;
        const notes = day?.close_day && day.close_day !== day.day
          ? `Closes ${day.close_day}${closesAt ? ` at ${closesAt}` : ''}`
          : opensAt && closesAt && closesAt < opensAt
            ? `Closes next day at ${closesAt}`
            : null;
        await insert('schedule', {
          id,
          serviceId: target.type === 'service' ? target.targetId : null,
          locationId: target.type === 'location' ? target.targetId : null,
          freq: day && DAY_CODES[day.day] ? 'WEEKLY' : null,
          interval: day && DAY_CODES[day.day] ? 1 : null,
          byday: day ? DAY_CODES[day.day] ?? null : null,
          opensAt,
          closesAt,
          description: !day && !truthy(schedule.hours_known) ? 'Hours unknown' : null,
          notes
        });
        record(
          mapping('schedules', schedule.id, 'schedule', id, target.type === 'service' ? 'service_schedule' : 'organization_schedule_to_location', target.type === 'location'),
          ...(day ? [mapping('schedule_days', day.id, 'schedule', id, 'schedule_day_to_schedule', target.type === 'location')] : [])
        );
      }
    }
  }

  return { mappings, canonical_counts: counts };
}

function baseReport (dumpPath, contents, tables) {
  return {
    status: 'running',
    conversion_version: CONVERSION_VERSION,
    source: dumpPath,
    source_checksum: createHash('sha256').update(contents).digest('hex'),
    source_counts: tables
      ? Object.fromEntries([...tables].map(([table, rows]) => [table, rows.length]))
      : {},
    canonical_counts: {},
    field_dispositions: fieldDispositions(),
    mappings: [],
    inferred_mappings: [],
    issues: []
  };
}

export async function importSheltertechDump (prisma, dumpPath) {
  const contents = await fs.readFile(dumpPath, 'utf8');
  let tables;
  const report = baseReport(dumpPath, contents);

  try {
    const parsed = parsePostgresDump(contents);
    tables = parsed.tables;
    Object.assign(report, baseReport(dumpPath, contents, tables));
    validateSourceSchema(parsed.columnsByTable);
    report.issues = validateSourceData(tables);
    if (report.issues.length) throw new Error(`ShelterTech preflight failed with ${report.issues.length} issue(s)`);

    const result = await prisma.$transaction(async (tx) => {
      await ensureCanonicalEmpty(tx);
      return importCanonical(tx, tables);
    }, { maxWait: 10_000, timeout: 120_000 });

    report.status = 'complete';
    report.canonical_counts = result.canonical_counts;
    report.mappings = result.mappings;
    report.inferred_mappings = result.mappings.filter(({ inferred }) => inferred);
    return report;
  } catch (error) {
    report.status = 'failed';
    if (!report.issues.length) {
      report.issues.push(issue(null, null, null, 'IMPORT_FAILED', error.message));
    }
    error.report = report;
    throw error;
  }
}
