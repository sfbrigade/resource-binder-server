#!/usr/bin/env node

import '../config.js';
import path from 'node:path';

import { importSheltertechDump } from '../lib/sheltertech-import.js';
import prisma from '../prisma/client.js';

const dumpPath = process.argv[2] || process.env.SHELTERTECH_SEED_PATH;
if (!dumpPath) {
  console.error('Usage: npm run import:sheltertech -- /path/to/seed.sql');
  process.exitCode = 1;
} else {
  try {
    const result = await importSheltertechDump(prisma, path.resolve(dumpPath));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
