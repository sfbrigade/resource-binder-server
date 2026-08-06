import { test } from 'node:test';
import * as assert from 'node:assert';

import { pageResponse, serializeService } from '#models/hsds.js';

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
});
