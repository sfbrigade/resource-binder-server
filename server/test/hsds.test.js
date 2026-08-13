import { test } from 'node:test';
import * as assert from 'node:assert';
import Fastify from 'fastify';
import { fastifyZodOpenApiPlugin, serializerCompiler, validatorCompiler } from 'fastify-zod-openapi';

import { taxonomyTermParentWhere } from '#lib/hsds-query.js';
import { pageResponse, serializeOrganization, serializeService, serializeTaxonomyTerm } from '#models/hsds.js';
import { apiMetadata, HSDS_DATA_GUIDE_URL } from '../routes/api/index.js';
import taxonomyTermRoutes from '../routes/api/taxonomy_terms/index.js';

test('HSDS serializers', async (t) => {
  await t.test('uses HSDS field names and enum values without inventing null data', () => {
    const service = serializeService({
      id: '7abfcd33-25af-4c69-8309-b41c7bd8df9f',
      organizationId: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9',
      programId: null,
      name: 'Temporary service',
      status: 'temporarilyClosed',
      description: null,
      lastModified: new Date('2026-08-06T12:00:00.000Z')
    });

    assert.deepStrictEqual(service, {
      id: '7abfcd33-25af-4c69-8309-b41c7bd8df9f',
      organization_id: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9',
      name: 'Temporary service',
      status: 'temporarily closed',
      last_modified: '2026-08-06T12:00:00.000Z'
    });
  });

  await t.test('builds the HSDS pagination envelope', () => {
    assert.deepStrictEqual(pageResponse({ page: 2, perPage: 2, total: 3, contents: [{ id: 'one' }] }), {
      total_items: 3,
      total_pages: 2,
      page_number: 2,
      size: 1,
      first_page: false,
      last_page: true,
      empty: false,
      contents: [{ id: 'one' }]
    });
  });

  await t.test('exposes taxonomy-term legacy relationships as standard attributes', () => {
    const term = serializeTaxonomyTerm({
      id: '7abfcd33-25af-4c69-8309-b41c7bd8df9f',
      name: 'Re-entry',
      description: 'Re-entry'
    }, {
      attributes: [{
        id: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9',
        linkId: '7abfcd33-25af-4c69-8309-b41c7bd8df9f',
        linkType: 'additional_parent',
        linkEntity: 'taxonomy_term',
        value: '570d287a-4f0f-4315-b9ae-e68ddfdd4bfb',
        label: 'ShelterTech parent term'
      }]
    });

    assert.equal(term.attributes[0].link_type, 'additional_parent');
    assert.equal(term.attributes[0].value, '570d287a-4f0f-4315-b9ae-e68ddfdd4bfb');
  });

  await t.test('includes nested service attributes on full_service organizations', () => {
    const serviceId = '7abfcd33-25af-4c69-8309-b41c7bd8df9f';
    const organization = serializeOrganization({
      id: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9',
      name: 'Example Org',
      description: 'Organization description',
      services: [{
        id: serviceId,
        organizationId: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9',
        name: 'Example Service',
        status: 'active'
      }]
    }, {
      full: true,
      fullService: true,
      serviceAttributes: new Map([[serviceId, [{
        id: '570d287a-4f0f-4315-b9ae-e68ddfdd4bfb',
        linkId: serviceId,
        linkType: 'note',
        linkEntity: 'service',
        value: 'Service note'
      }]]])
    });

    assert.equal(organization.services[0].attributes[0].value, 'Service note');
  });
});

test('taxonomy term parent filters', () => {
  assert.deepStrictEqual(taxonomyTermParentWhere({ topOnly: true }), { parentId: null });
  assert.deepStrictEqual(
    taxonomyTermParentWhere({ parentId: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9' }),
    { parentId: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9' }
  );
  assert.deepStrictEqual(taxonomyTermParentWhere({}), {});
});

test('HSDS API metadata and taxonomy validation', async (t) => {
  assert.equal(HSDS_DATA_GUIDE_URL, 'https://github.com/sfbrigade/resource-binder-server/blob/main/docs/sheltertech-hsds-profile.md');
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fastifyZodOpenApiPlugin);
  await app.register(taxonomyTermRoutes, { prefix: '/api/taxonomy_terms' });
  t.after(() => app.close());

  assert.deepStrictEqual(apiMetadata(), {
    version: '3.2.3',
    profile: HSDS_DATA_GUIDE_URL,
    openapi_url: 'http://localhost:3000/api/openapi.json',
    description: 'ShelterTech directory data converted to the Resource Binder HSDS 3.2.3 profile.',
    data_guide: HSDS_DATA_GUIDE_URL
  });

  const conflictResponse = await app.inject().get('/api/taxonomy_terms').query({
    top_only: 'true',
    parent_id: 'a2f87ed6-a885-449c-b9bc-bbc587bcf8e9'
  });
  assert.equal(conflictResponse.statusCode, 400);
});
