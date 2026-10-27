import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GenericContainer } from 'testcontainers';
import { Builder } from '@sfcivictech/prisma-fixtures';
import helper from 'fastify-cli/helper.js';
import { assetExists, build, upload } from '#test/helper.js';
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

test('storage readiness is awaited before setup creates the test bucket', async (t) => {
  // Reproduce slow CI startup: the S3 port opens before storage quorum is ready.
  const expose = GenericContainer.prototype.withExposedPorts;
  t.mock.method(GenericContainer.prototype, 'withExposedPorts', function (...ports) {
    if (ports.includes(9000)) this.withResourcesQuota({ cpu: 0.05 });
    return expose.apply(this, ports);
  });
  const createBucket = s3.createBucket;
  t.mock.method(s3, 'createBucket', async function (...args) {
    const readiness = await fetch(`${process.env.AWS_S3_ENDPOINT}/health/ready`);
    assert.equal(readiness.status, 200, 'Storage must be ready before bucket creation');
    return createBucket.apply(this, args);
  });
  await build(t);
  await upload([['640x480.jpg', 'readiness.jpg']]);
  assert.ok(await assetExists('_uploads/readiness.jpg'));
});
