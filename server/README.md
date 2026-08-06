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

The single PostgreSQL database uses three schemas:

- `public` contains the existing application tables.
- `hsds` contains the normalized Open Referral HSDS 3.2.3 tables.
- `import_audit` contains immutable ShelterTech source rows, conversion mappings, and import issues. These records are not exposed by the public API.

Apply migrations, then import a ShelterTech PostgreSQL seed dump:

```sh
export DATABASE_URL=postgresql://...
export SHELTERTECH_SEED_PATH=/absolute/path/to/seed.sql
npm run import:sheltertech
```

The importer reads only its explicit allowlist of 33 ShelterTech public-directory tables. It rejects a changed table/column layout, preserves every imported source row as JSONB, and upserts canonical HSDS records with deterministic UUIDs. Canonical changes and their source mappings are transactional; a failed conversion leaves no partial canonical update. Reimporting creates a new audit snapshot and updates matching canonical records without automatically deleting records absent from the new dump.

Read-only HSDS JSON is available at:

- `GET /api` and `GET /api/openapi.json`
- `GET /api/services` and `GET /api/services/:id`
- `GET /api/organizations` and `GET /api/organizations/:id`
- `GET /api/taxonomies` and `GET /api/taxonomies/:id`
- `GET /api/taxonomy_terms` and `GET /api/taxonomy_terms/:id`
- `GET /api/service_at_locations` and `GET /api/service_at_locations/:id`

## Learn More

To learn Fastify, check out the [Fastify documentation](https://fastify.dev/docs/latest/).
