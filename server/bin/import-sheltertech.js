#!/usr/bin/env node

import '../config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importSheltertechDump } from '../lib/sheltertech-import.js';
import prisma from '../prisma/client.js';

const defaultDumpPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../db/seed.sql'
);
const dumpPath = process.argv[2] || process.env.SHELTERTECH_SEED_PATH || defaultDumpPath;

try {
  const result = await importSheltertechDump(prisma, path.resolve(dumpPath));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.log(JSON.stringify(error.report ?? {
    status: 'failed',
    issues: [{ code: 'IMPORT_FAILED', message: error.message }]
  }, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
