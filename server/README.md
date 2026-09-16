# Getting Started with [Fastify-CLI](https://www.npmjs.com/package/fastify-cli)

This project was bootstrapped with Fastify-CLI.

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm start`

For production mode

### `npm run test`

Run the test cases.

## Open Referral / HSDS data

The PostgreSQL `public` schema contains both the existing application tables and the normalized Open Referral HSDS 3.2.3 tables. ShelterTech source data is converted into HSDS records; raw source rows are not copied into the operational database.

See the [ShelterTech to HSDS 3.2.3 conversion profile](../docs/sheltertech-hsds-profile.md) for the authoritative field, inference, validation, and audit policies.

Apply migrations, then import the checked-in ShelterTech PostgreSQL seed dump (`db/seed.sql`):

```sh
export DATABASE_URL=postgresql://...
npm run --silent import:sheltertech > conversion-report.json
```

Override the default dump with a CLI path or `SHELTERTECH_SEED_PATH` if needed. The importer converts an explicit allowlist of 33 ShelterTech public-directory tables and reports row counts for other public tables without retaining their contents. It rejects changed or unsupported source data, requires empty canonical tables, and writes deterministic HSDS records in one transaction. Its JSON output is the external conversion report; save it beside the immutable source dump. A failed conversion prints a failed report, exits nonzero, and leaves canonical data unchanged. To import a future dump, provide a fresh database (or clear the canonical tables separately); the importer does not clear, replace, or incrementally synchronize existing data.

Read-only HSDS JSON is available at:

- `GET /api` and `GET /api/openapi.json`
- `GET /api/services` and `GET /api/services/:id`
- `GET /api/organizations` and `GET /api/organizations/:id`
- `GET /api/taxonomies` and `GET /api/taxonomies/:id`
- `GET /api/taxonomy_terms` and `GET /api/taxonomy_terms/:id`
- `GET /api/service_at_locations` and `GET /api/service_at_locations/:id`

## Learn More

To learn Fastify, check out the [Fastify documentation](https://fastify.dev/docs/latest/).
