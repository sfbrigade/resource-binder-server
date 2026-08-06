import { z } from 'zod';

export const IdParamsSchema = z.object({ id: z.string().uuid() });

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  format: z.enum(['json']).default('json')
});

export const EntitySchema = z.looseObject({ id: z.string().uuid() });

export const PageSchema = z.object({
  total_items: z.number().int().min(0),
  total_pages: z.number().int().min(0),
  page_number: z.number().int().min(1),
  size: z.number().int().min(0),
  first_page: z.boolean(),
  last_page: z.boolean(),
  empty: z.boolean(),
  contents: z.array(EntitySchema)
});

export function pageResponse ({ page, perPage, total, contents }) {
  const totalPages = Math.ceil(total / perPage);
  return {
    total_items: total,
    total_pages: totalPages,
    page_number: page,
    size: contents.length,
    first_page: page === 1,
    last_page: totalPages === 0 || page >= totalPages,
    empty: contents.length === 0,
    contents
  };
}

function compact (value) {
  if (Array.isArray(value)) return value.map(compact);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, nested]) => nested !== null && nested !== undefined)
      .map(([key, nested]) => [key, compact(nested)]));
  }
  return value;
}

function dateOnly (value) {
  return value?.toISOString().slice(0, 10);
}

export function serializePhone (phone) {
  return compact({
    id: phone.id,
    number: phone.number,
    extension: phone.extension,
    type: phone.type,
    description: phone.description,
    languages: phone.languages?.map(serializeLanguage)
  });
}

export function serializeContact (contact) {
  return compact({
    id: contact.id,
    organization_id: contact.organizationId,
    service_id: contact.serviceId,
    service_at_location_id: contact.serviceAtLocationId,
    location_id: contact.locationId,
    name: contact.name,
    title: contact.title,
    department: contact.department,
    email: contact.email,
    phones: contact.phones?.map(serializePhone)
  });
}

export function serializeAddress (address) {
  return compact({
    id: address.id,
    location_id: address.locationId,
    attention: address.attention,
    address_1: address.address1,
    address_2: address.address2,
    city: address.city,
    region: address.region,
    state_province: address.stateProvince,
    postal_code: address.postalCode,
    country: address.country,
    address_type: address.addressType
  });
}

export function serializeSchedule (schedule) {
  return compact({
    id: schedule.id,
    service_id: schedule.serviceId,
    location_id: schedule.locationId,
    service_at_location_id: schedule.serviceAtLocationId,
    valid_from: dateOnly(schedule.validFrom),
    valid_to: dateOnly(schedule.validTo),
    dtstart: dateOnly(schedule.dtstart),
    timezone: schedule.timezone,
    until: dateOnly(schedule.until),
    count: schedule.count,
    wkst: schedule.wkst,
    freq: schedule.freq,
    interval: schedule.interval,
    byday: schedule.byday,
    byweekno: schedule.byweekno,
    bymonthday: schedule.bymonthday,
    byyearday: schedule.byyearday,
    description: schedule.description,
    opens_at: schedule.opensAt,
    closes_at: schedule.closesAt,
    schedule_link: schedule.scheduleLink,
    attending_type: schedule.attendingType,
    notes: schedule.notes
  });
}

export function serializeLanguage (language) {
  return compact({
    id: language.id,
    service_id: language.serviceId,
    location_id: language.locationId,
    phone_id: language.phoneId,
    name: language.name,
    code: language.code,
    note: language.note
  });
}

export function serializeAccessibility (entry) {
  return compact({
    id: entry.id,
    location_id: entry.locationId,
    accessibility: entry.accessibility,
    details: entry.details
  });
}

export function serializeLocation (location, { full = true } = {}) {
  return compact({
    id: location.id,
    location_type: location.locationType,
    url: location.url,
    organization_id: location.organizationId,
    name: location.name,
    alternate_name: location.alternateName,
    description: location.description,
    transportation: location.transportation,
    latitude: location.latitude == null ? null : Number(location.latitude),
    longitude: location.longitude == null ? null : Number(location.longitude),
    external_identifier: location.externalIdentifier,
    external_identifier_type: location.externalIdentifierType,
    addresses: full ? location.addresses?.map(serializeAddress) : undefined,
    contacts: full ? location.contacts?.map(serializeContact) : undefined,
    phones: full ? location.phones?.map(serializePhone) : undefined,
    schedules: full ? location.schedules?.map(serializeSchedule) : undefined,
    languages: full ? location.languages?.map(serializeLanguage) : undefined,
    accessibility: full ? location.accessibility?.map(serializeAccessibility) : undefined
  });
}

export function serializeFunding (funding) {
  return compact({
    id: funding.id,
    organization_id: funding.organizationId,
    service_id: funding.serviceId,
    source: funding.source
  });
}

export function serializeProgram (program) {
  return compact({
    id: program.id,
    organization_id: program.organizationId,
    name: program.name,
    alternate_name: program.alternateName,
    description: program.description
  });
}

export function serializeAttribute (attribute) {
  return compact({
    id: attribute.id,
    link_id: attribute.linkId,
    link_type: attribute.linkType,
    link_entity: attribute.linkEntity,
    value: attribute.value,
    label: attribute.label,
    taxonomy_term: attribute.taxonomyTerm && serializeTaxonomyTerm(attribute.taxonomyTerm)
  });
}

export function serializeRequiredDocument (document) {
  return compact({
    id: document.id,
    service_id: document.serviceId,
    document: document.document,
    uri: document.uri
  });
}

export function serializeServiceArea (area) {
  return compact({
    id: area.id,
    service_id: area.serviceId,
    service_at_location_id: area.serviceAtLocationId,
    name: area.name,
    description: area.description,
    extent: area.extent,
    extent_type: area.extentType,
    uri: area.uri
  });
}

export function serializeCostOption (option) {
  return compact({
    id: option.id,
    service_id: option.serviceId,
    valid_from: dateOnly(option.validFrom),
    valid_to: dateOnly(option.validTo),
    option: option.option,
    currency: option.currency,
    amount: option.amount == null ? null : Number(option.amount),
    amount_description: option.amountDescription
  });
}

export function serializeCapacity (capacity) {
  return compact({
    id: capacity.id,
    service_id: capacity.serviceId,
    unit: capacity.unit && compact({
      id: capacity.unit.id,
      name: capacity.unit.name,
      scheme: capacity.unit.scheme,
      identifier: capacity.unit.identifier,
      uri: capacity.unit.uri
    }),
    available: Number(capacity.available),
    maximum: capacity.maximum == null ? null : Number(capacity.maximum),
    description: capacity.description,
    updated: capacity.updated
  });
}

export function serializeServiceAtLocation (entry, { full = true } = {}) {
  return compact({
    id: entry.id,
    service_id: entry.serviceId,
    location_id: entry.locationId,
    description: entry.description,
    service_areas: full ? entry.serviceAreas?.map(serializeServiceArea) : undefined,
    contacts: full ? entry.contacts?.map(serializeContact) : undefined,
    phones: full ? entry.phones?.map(serializePhone) : undefined,
    schedules: full ? entry.schedules?.map(serializeSchedule) : undefined,
    location: full && entry.location ? serializeLocation(entry.location) : undefined,
    service: full && entry.service ? serializeService(entry.service) : undefined
  });
}

export function serializeOrganization (organization, { full = false, fullService = false, attributes } = {}) {
  return compact({
    id: organization.id,
    name: organization.name,
    alternate_name: organization.alternateName,
    description: organization.description,
    email: organization.email,
    website: organization.website,
    tax_status: organization.taxStatus,
    tax_id: organization.taxId,
    year_incorporated: organization.yearIncorporated,
    legal_status: organization.legalStatus,
    logo: organization.logo,
    uri: organization.uri,
    parent_organization_id: organization.parentOrganizationId,
    funding: full ? organization.funding?.map(serializeFunding) : undefined,
    contacts: full ? organization.contacts?.map(serializeContact) : undefined,
    phones: full ? organization.phones?.map(serializePhone) : undefined,
    locations: full ? organization.locations?.map((location) => serializeLocation(location)) : undefined,
    programs: full ? organization.programs?.map(serializeProgram) : undefined,
    organization_identifiers: full
      ? organization.identifiers?.map((identifier) => compact({
        id: identifier.id,
        organization_id: identifier.organizationId,
        identifier_scheme: identifier.identifierScheme,
        identifier_type: identifier.identifierType,
        identifier: identifier.identifier
      }))
      : undefined,
    additional_websites: full ? organization.additionalWebsites?.map((url) => compact({ id: url.id, label: url.label, url: url.url })) : undefined,
    services: full
      ? organization.services?.map((service) => fullService
        ? serializeService(service, { full: true })
        : compact({
          id: service.id,
          name: service.name,
          status: service.status === 'temporarilyClosed' ? 'temporarily closed' : service.status,
          last_modified: service.lastModified
        }))
      : undefined,
    attributes: full ? attributes?.map(serializeAttribute) : undefined
  });
}

export function serializeService (service, { full = false, attributes } = {}) {
  return compact({
    id: service.id,
    organization_id: service.organizationId,
    program_id: service.programId,
    name: service.name,
    alternate_name: service.alternateName,
    description: service.description,
    url: service.url,
    email: service.email,
    status: service.status === 'temporarilyClosed' ? 'temporarily closed' : service.status,
    interpretation_services: service.interpretationServices,
    application_process: service.applicationProcess,
    fees_description: service.feesDescription,
    wait_time: service.waitTime,
    fees: service.fees,
    accreditations: service.accreditations,
    eligibility_description: service.eligibilityDescription,
    minimum_age: service.minimumAge,
    maximum_age: service.maximumAge,
    assured_date: dateOnly(service.assuredDate),
    assurer_email: service.assurerEmail,
    licenses: service.licenses,
    alert: service.alert,
    last_modified: service.lastModified,
    service_at_locations: full ? service.serviceAtLocations?.map(serializeServiceAtLocation) : undefined,
    phones: full ? service.phones?.map(serializePhone) : undefined,
    contacts: full ? service.contacts?.map(serializeContact) : undefined,
    schedules: full ? service.schedules?.map(serializeSchedule) : undefined,
    service_areas: full ? service.serviceAreas?.map(serializeServiceArea) : undefined,
    languages: full ? service.languages?.map(serializeLanguage) : undefined,
    funding: full ? service.funding?.map(serializeFunding) : undefined,
    cost_options: full ? service.costOptions?.map(serializeCostOption) : undefined,
    program: full && service.program ? serializeProgram(service.program) : undefined,
    required_documents: full ? service.requiredDocuments?.map(serializeRequiredDocument) : undefined,
    capacities: full ? service.capacities?.map(serializeCapacity) : undefined,
    additional_urls: full ? service.additionalUrls?.map((url) => compact({ id: url.id, label: url.label, url: url.url })) : undefined,
    organization: full && service.organization ? serializeOrganization(service.organization) : undefined,
    attributes: full ? attributes?.map(serializeAttribute) : undefined
  });
}

export function serializeTaxonomy (taxonomy) {
  return compact({
    id: taxonomy.id,
    name: taxonomy.name,
    description: taxonomy.description,
    uri: taxonomy.uri,
    version: taxonomy.version
  });
}

export function serializeTaxonomyTerm (term) {
  return compact({
    id: term.id,
    code: term.code,
    name: term.name,
    description: term.description,
    parent_id: term.parentId,
    taxonomy: term.taxonomy,
    taxonomy_detail: term.taxonomyDetail && serializeTaxonomy(term.taxonomyDetail),
    language: term.language,
    taxonomy_id: term.taxonomyId,
    term_uri: term.termUri
  });
}
