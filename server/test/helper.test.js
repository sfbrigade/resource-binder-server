import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GenericContainer } from 'testcontainers';
import { Builder } from '@sfcivictech/prisma-fixtures';
import helper from 'fastify-cli/helper.js';
import { build } from '#test/helper.js';
import s3 from '#lib/s3.js';

for (const failure of ['fixtures', 'app construction', 'app close']) {
  test(`test resources are released after a failure in ${failure}`, async (t) => {
    // These tests need real containers, but no bucket data or cached S3 client.
    t.mock.method(s3, 'createBucket', async () => {});
    const containers = [];
    const start = GenericContainer.prototype.start;
    t.mock.method(GenericContainer.prototype, 'start', async function (...args) {
      const container = await start.apply(this, args);
      containers.push(container);
      return container;
    });
    // Run the helper's teardown explicitly so expected errors do not fail this test.
    const teardowns = [];
    const context = {
      mock: t.mock,
      beforeEach () {},
      afterEach () {},
      after (fn) { teardowns.push(fn); },
    };
    const injectedError = new Error(`Simulated ${failure} failure`);
    let errors = [];
    try {
      if (failure === 'fixtures') {
        t.mock.method(Builder.prototype, 'build', async () => { throw injectedError; });
        await assert.rejects(build(context), error => error === injectedError);
      } else if (failure === 'app construction') {
        t.mock.method(helper, 'build', async () => { throw injectedError; });
        await assert.rejects(build(context), error => error === injectedError);
      } else {
        const app = await build(context);
        const close = app.close.bind(app);
        t.mock.method(app, 'close', async () => {
          await close();
          throw injectedError;
        });
      }
    } finally {
      const results = await Promise.allSettled(teardowns.map(fn => fn()));
      errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    }
    assert.equal(containers.length, failure === 'fixtures' ? 1 : 2);
    for (const container of containers) {
      await assert.rejects(container.exec(['true']), /No such container|not running/i);
    }
    if (failure === 'app close') {
      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof AggregateError);
      assert.deepEqual(errors[0].errors, [injectedError]);
    } else {
      assert.deepEqual(errors, []);
    }
  });
}
