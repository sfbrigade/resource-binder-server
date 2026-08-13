# ShelterTech to HSDS 3.2.3 conversion profile

This document is the authoritative data guide for converting a ShelterTech PostgreSQL dump into Resource Binder's operational HSDS 3.2.3 API and database model. The operational database is HSDS-shaped, not a one-to-one copy of ShelterTech.

The immutable source dump and its JSON conversion report are the audit record for source values that were ignored, reported, transformed, or inferred. ShelterTech IDs are used only to create deterministic UUIDs and in conversion-report entries; they are not exposed in canonical tables or APIs.

## Import lifecycle and scope

- The importer requires every canonical HSDS table to be empty. It does not clear, replace, or synchronize existing canonical data.
- Each import validates the complete source before opening one database transaction. A failed import leaves canonical data unchanged.
- The 33 allowlisted public-directory tables are converted or explicitly classified. Populated allowlisted tables without an approved mapping fail closed: `accessibilities`, `categories_keywords`, `categories_sites`, `keywords`, `keywords_resources`, `keywords_services`, `news_articles`, `synonym_groups`, and `synonyms`.
- Other public tables are outside the operational API scope. Their row contents are not retained and do not block import; `ignored_source_counts` records their names and row counts.
- `source_counts` records all allowlisted table counts. The report also contains field dispositions, report-only values, warnings, mappings, inferred mappings, issues, and canonical record counts.
- A document with no service link, a funding source with no organization or service reference, or a language with no phone reference fails preflight as an `ORPHANED_ROW`.
- The checked-in `server/db/seed.sql` is a development fixture. Production parity must be assessed with the intended immutable dump and its retained report.

## Organizations and services

- ShelterTech `resources` become organizations and ShelterTech `services` become services.
- Service status `1` becomes `active`. Any other service status fails preflight because no other status mapping is approved.
- `resources.status`, organization status/audit fields, source attribution, primary resource/service contact IDs, address lines 3 and 4, and other fields marked `external_report_only` remain in `report_only_values` but not the canonical API.
- Private `internal_note` values are discarded and never included in the report.
- Short and long descriptions are joined into one description. If an organization, service, or program has no description, its name is used and an inferred mapping with rule `name_as_description` is recorded.
- A source fee may populate both `fees` and `fees_description`.
- Non-empty malformed values in `resources.website`, `services.url`, and `documents.url` are preserved verbatim in canonical data and emitted as non-fatal `INVALID_URI` warnings.
- Invalid URI warnings from known dummy values in the checked-in development fixture are expected and do not block import.

## Locations and service delivery

- Each address becomes one location and one address. `online=true` produces a virtual location; otherwise it is physical. Country is always `US`.
- Explicit `addresses_services` links are preserved exactly. Only a service with no explicit links is associated with every address belonging to its organization; each such association is reported as `organization_address_fallback`.
- Organization schedules apply to every organization location and are reported as inferred `organization_schedule_to_location` mappings. Service schedules stay on the service. The importer does not attach schedules to service-at-location rows.

## Schedule profile

- Times are ShelterTech local wall-clock times in `America/Los_Angeles`; no UTC conversion or numeric offset is added.
- Structured `open_time` and `close_time` values take precedence over legacy `opens_at` and `closes_at` values.
- Structured times must contain hours and minutes with optional whole seconds. Fractional seconds and trailing content fail preflight rather than being truncated.
- English weekday names map to weekly RRULE-style `byday` values (`MO` through `SU`). Invalid days or times fail preflight.
- Legacy `2400` is normalized to `00:00:00`. A closing `2400` stays associated with the source weekday and receives a `Closes next day` note. An opening `2400` moves `byday` to the following weekday so midnight retains its source meaning.
- Other closes-before-opens intervals receive the existing next-day note. An explicit differing `close_day` is preserved in schedule notes. `open_day` remains report-only; transformed `close_day` behavior is canonical.
- When a schedule has no day rows and `hours_known=false`, its description is `Hours unknown`. Day rows are otherwise authoritative.

## Taxonomies, attributes, contacts, and phones

- Categories and eligibilities become taxonomy terms. Sites, notes, instructions, feature ranks, flags, and related ShelterTech concepts become attributes.
- Explicit `true` and `false` values for `featured`, `top_level`, and `is_parent` create attributes; only null values are omitted.
- For a term with multiple parents, the first relationship becomes canonical `parent_id`; other relationships become `additional_parent` attributes.
- Contacts are converted, and phone-to-contact links are preserved. Resource/service primary `contact_id` values are report-only.
- A language is converted only when referenced by a phone, and that language is attached to the phone.
- Phone extensions remain strings so leading zeroes survive. This is an intentional lossless profile variation from consumers that expect numeric extensions.
- Phones retain their explicit organization, service, and contact relationships; the checked-in fixture's phones are organization-scoped.
- Standard phone types are `voice`, `fax`, `text` (including SMS), `cell`, `video`, `pager`, and `textphone`. An unknown source type leaves canonical `type` unset, appends `ShelterTech service type: <value>` to the phone description, and emits a non-fatal `UNKNOWN_PHONE_TYPE` warning.

## API query behavior

The taxonomy-term filters `top_only=true` and `parent_id` are mutually exclusive. Supplying both returns HTTP 400; each filter behaves independently when used alone.

## Deliberate HSDS profile variations

The API identifies itself as HSDS version 3.2.3 while preserving source fidelity in three places: phone extensions are strings, schedule times are local `America/Los_Angeles` wall-clock values, and source URI fields are not rejected or normalized. Consumers should use the conversion report warnings when assessing URI validity.

The conversion version in each report identifies the exact importer behavior. Deterministic UUID conversion ensures the same source entity and entity type produce the same canonical identifier without exposing the original source ID in operational data.
