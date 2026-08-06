-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "hsds";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "import_audit";

-- CreateEnum
CREATE TYPE "hsds"."ServiceStatus" AS ENUM ('active', 'inactive', 'defunct', 'temporarily closed');

-- CreateEnum
CREATE TYPE "hsds"."LocationType" AS ENUM ('physical', 'postal', 'virtual');

-- CreateTable
CREATE TABLE "hsds"."organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "alternate_name" TEXT,
    "description" TEXT NOT NULL,
    "email" TEXT,
    "website" TEXT,
    "tax_status" TEXT,
    "tax_id" TEXT,
    "year_incorporated" INTEGER,
    "legal_status" TEXT,
    "logo" TEXT,
    "uri" TEXT,
    "parent_organization_id" UUID,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "alternate_name" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "program_id" UUID,
    "name" TEXT NOT NULL,
    "alternate_name" TEXT,
    "description" TEXT,
    "url" TEXT,
    "email" TEXT,
    "status" "hsds"."ServiceStatus" NOT NULL,
    "interpretation_services" TEXT,
    "application_process" TEXT,
    "fees_description" TEXT,
    "wait_time" TEXT,
    "fees" TEXT,
    "accreditations" TEXT,
    "eligibility_description" TEXT,
    "minimum_age" INTEGER,
    "maximum_age" INTEGER,
    "assured_date" DATE,
    "assurer_email" TEXT,
    "licenses" TEXT,
    "alert" TEXT,
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."service_at_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "description" TEXT,

    CONSTRAINT "service_at_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_type" "hsds"."LocationType" NOT NULL,
    "url" TEXT,
    "organization_id" UUID,
    "name" TEXT,
    "alternate_name" TEXT,
    "description" TEXT,
    "transportation" TEXT,
    "latitude" DECIMAL,
    "longitude" DECIMAL,
    "external_identifier" TEXT,
    "external_identifier_type" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."phones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID,
    "service_id" UUID,
    "organization_id" UUID,
    "contact_id" UUID,
    "service_at_location_id" UUID,
    "number" TEXT NOT NULL,
    "extension" INTEGER,
    "type" TEXT,
    "description" TEXT,

    CONSTRAINT "phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "service_id" UUID,
    "service_at_location_id" UUID,
    "location_id" UUID,
    "name" TEXT,
    "title" TEXT,
    "department" TEXT,
    "email" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "attention" TEXT,
    "address_1" TEXT NOT NULL,
    "address_2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "state_province" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "address_type" "hsds"."LocationType" NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID,
    "location_id" UUID,
    "service_at_location_id" UUID,
    "valid_from" DATE,
    "valid_to" DATE,
    "dtstart" DATE,
    "timezone" INTEGER,
    "until" DATE,
    "count" INTEGER,
    "wkst" TEXT,
    "freq" TEXT,
    "interval" INTEGER,
    "byday" TEXT,
    "byweekno" TEXT,
    "bymonthday" TEXT,
    "byyearday" TEXT,
    "description" TEXT,
    "opens_at" TEXT,
    "closes_at" TEXT,
    "schedule_link" TEXT,
    "attending_type" TEXT,
    "notes" TEXT,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."funding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "service_id" UUID,
    "source" TEXT,

    CONSTRAINT "funding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."service_areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID,
    "service_at_location_id" UUID,
    "name" TEXT,
    "description" TEXT,
    "extent" TEXT,
    "extent_type" TEXT,
    "uri" TEXT,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."languages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID,
    "location_id" UUID,
    "phone_id" UUID,
    "name" TEXT,
    "code" TEXT,
    "note" TEXT,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."accessibility" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "accessibility" TEXT,
    "details" TEXT,

    CONSTRAINT "accessibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."required_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID,
    "document" TEXT,
    "uri" TEXT,

    CONSTRAINT "required_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."taxonomies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uri" TEXT,
    "version" TEXT,

    CONSTRAINT "taxonomies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."taxonomy_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parent_id" UUID,
    "taxonomy" TEXT,
    "language" TEXT,
    "taxonomy_id" UUID,
    "term_uri" TEXT,

    CONSTRAINT "taxonomy_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."attributes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "link_id" UUID NOT NULL,
    "taxonomy_term_id" UUID NOT NULL,
    "link_type" TEXT,
    "link_entity" TEXT NOT NULL,
    "value" TEXT,
    "label" TEXT,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."metadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "last_action_date" DATE NOT NULL,
    "last_action_type" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "previous_value" TEXT NOT NULL,
    "replacement_value" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."meta_table_descriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "language" TEXT,
    "character_set" TEXT,

    CONSTRAINT "meta_table_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."cost_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "option" TEXT,
    "currency" TEXT,
    "amount" DECIMAL,
    "amount_description" TEXT,

    CONSTRAINT "cost_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."organization_identifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "identifier_scheme" TEXT,
    "identifier_type" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,

    CONSTRAINT "organization_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."service_capacity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "available" DECIMAL NOT NULL,
    "maximum" DECIMAL,
    "description" TEXT,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "scheme" TEXT,
    "identifier" TEXT,
    "uri" TEXT,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsds"."urls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT,
    "url" TEXT NOT NULL,
    "organization_id" UUID,
    "service_id" UUID,

    CONSTRAINT "urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_audit"."import_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "summary" JSONB,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_audit"."source_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_run_id" UUID NOT NULL,
    "source_table" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_audit"."source_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_record_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "rule" TEXT,

    CONSTRAINT "source_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_audit"."import_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_run_id" UUID NOT NULL,
    "source_table" TEXT,
    "source_key" TEXT,
    "field" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programs_organization_id_idx" ON "hsds"."programs"("organization_id");

-- CreateIndex
CREATE INDEX "services_organization_id_idx" ON "hsds"."services"("organization_id");

-- CreateIndex
CREATE INDEX "services_program_id_idx" ON "hsds"."services"("program_id");

-- CreateIndex
CREATE INDEX "services_status_idx" ON "hsds"."services"("status");

-- CreateIndex
CREATE INDEX "services_last_modified_idx" ON "hsds"."services"("last_modified");

-- CreateIndex
CREATE UNIQUE INDEX "service_at_locations_service_id_location_id_key" ON "hsds"."service_at_locations"("service_id", "location_id");

-- CreateIndex
CREATE INDEX "locations_organization_id_idx" ON "hsds"."locations"("organization_id");

-- CreateIndex
CREATE INDEX "phones_location_id_idx" ON "hsds"."phones"("location_id");

-- CreateIndex
CREATE INDEX "phones_service_id_idx" ON "hsds"."phones"("service_id");

-- CreateIndex
CREATE INDEX "phones_organization_id_idx" ON "hsds"."phones"("organization_id");

-- CreateIndex
CREATE INDEX "contacts_organization_id_idx" ON "hsds"."contacts"("organization_id");

-- CreateIndex
CREATE INDEX "contacts_service_id_idx" ON "hsds"."contacts"("service_id");

-- CreateIndex
CREATE INDEX "addresses_location_id_idx" ON "hsds"."addresses"("location_id");

-- CreateIndex
CREATE INDEX "schedules_service_id_idx" ON "hsds"."schedules"("service_id");

-- CreateIndex
CREATE INDEX "schedules_location_id_idx" ON "hsds"."schedules"("location_id");

-- CreateIndex
CREATE INDEX "funding_organization_id_idx" ON "hsds"."funding"("organization_id");

-- CreateIndex
CREATE INDEX "funding_service_id_idx" ON "hsds"."funding"("service_id");

-- CreateIndex
CREATE INDEX "service_areas_service_id_idx" ON "hsds"."service_areas"("service_id");

-- CreateIndex
CREATE INDEX "languages_service_id_idx" ON "hsds"."languages"("service_id");

-- CreateIndex
CREATE INDEX "languages_location_id_idx" ON "hsds"."languages"("location_id");

-- CreateIndex
CREATE INDEX "accessibility_location_id_idx" ON "hsds"."accessibility"("location_id");

-- CreateIndex
CREATE INDEX "required_documents_service_id_idx" ON "hsds"."required_documents"("service_id");

-- CreateIndex
CREATE INDEX "taxonomy_terms_taxonomy_id_idx" ON "hsds"."taxonomy_terms"("taxonomy_id");

-- CreateIndex
CREATE INDEX "taxonomy_terms_parent_id_idx" ON "hsds"."taxonomy_terms"("parent_id");

-- CreateIndex
CREATE INDEX "attributes_link_entity_link_id_idx" ON "hsds"."attributes"("link_entity", "link_id");

-- CreateIndex
CREATE INDEX "attributes_taxonomy_term_id_idx" ON "hsds"."attributes"("taxonomy_term_id");

-- CreateIndex
CREATE INDEX "metadata_resource_type_resource_id_idx" ON "hsds"."metadata"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "cost_options_service_id_idx" ON "hsds"."cost_options"("service_id");

-- CreateIndex
CREATE INDEX "organization_identifiers_organization_id_idx" ON "hsds"."organization_identifiers"("organization_id");

-- CreateIndex
CREATE INDEX "service_capacity_service_id_idx" ON "hsds"."service_capacity"("service_id");

-- CreateIndex
CREATE INDEX "service_capacity_unit_id_idx" ON "hsds"."service_capacity"("unit_id");

-- CreateIndex
CREATE INDEX "urls_organization_id_idx" ON "hsds"."urls"("organization_id");

-- CreateIndex
CREATE INDEX "urls_service_id_idx" ON "hsds"."urls"("service_id");

-- CreateIndex
CREATE INDEX "source_records_source_table_source_key_idx" ON "import_audit"."source_records"("source_table", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "source_records_import_run_id_source_table_source_key_key" ON "import_audit"."source_records"("import_run_id", "source_table", "source_key");

-- CreateIndex
CREATE INDEX "source_mappings_target_type_target_id_idx" ON "import_audit"."source_mappings"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_mappings_source_record_id_target_type_target_id_key" ON "import_audit"."source_mappings"("source_record_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "import_issues_import_run_id_idx" ON "import_audit"."import_issues"("import_run_id");

-- AddForeignKey
ALTER TABLE "hsds"."organizations" ADD CONSTRAINT "organizations_parent_organization_id_fkey" FOREIGN KEY ("parent_organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."programs" ADD CONSTRAINT "programs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."services" ADD CONSTRAINT "services_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "hsds"."programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."service_at_locations" ADD CONSTRAINT "service_at_locations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."service_at_locations" ADD CONSTRAINT "service_at_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "hsds"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."phones" ADD CONSTRAINT "phones_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "hsds"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."phones" ADD CONSTRAINT "phones_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."phones" ADD CONSTRAINT "phones_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."phones" ADD CONSTRAINT "phones_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "hsds"."contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."phones" ADD CONSTRAINT "phones_service_at_location_id_fkey" FOREIGN KEY ("service_at_location_id") REFERENCES "hsds"."service_at_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."contacts" ADD CONSTRAINT "contacts_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."contacts" ADD CONSTRAINT "contacts_service_at_location_id_fkey" FOREIGN KEY ("service_at_location_id") REFERENCES "hsds"."service_at_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."contacts" ADD CONSTRAINT "contacts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "hsds"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."addresses" ADD CONSTRAINT "addresses_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "hsds"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."schedules" ADD CONSTRAINT "schedules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."schedules" ADD CONSTRAINT "schedules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "hsds"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."schedules" ADD CONSTRAINT "schedules_service_at_location_id_fkey" FOREIGN KEY ("service_at_location_id") REFERENCES "hsds"."service_at_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."funding" ADD CONSTRAINT "funding_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."funding" ADD CONSTRAINT "funding_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."service_areas" ADD CONSTRAINT "service_areas_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."service_areas" ADD CONSTRAINT "service_areas_service_at_location_id_fkey" FOREIGN KEY ("service_at_location_id") REFERENCES "hsds"."service_at_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."languages" ADD CONSTRAINT "languages_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."languages" ADD CONSTRAINT "languages_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "hsds"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."languages" ADD CONSTRAINT "languages_phone_id_fkey" FOREIGN KEY ("phone_id") REFERENCES "hsds"."phones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."accessibility" ADD CONSTRAINT "accessibility_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "hsds"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."required_documents" ADD CONSTRAINT "required_documents_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "hsds"."taxonomy_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_taxonomy_id_fkey" FOREIGN KEY ("taxonomy_id") REFERENCES "hsds"."taxonomies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."attributes" ADD CONSTRAINT "attributes_taxonomy_term_id_fkey" FOREIGN KEY ("taxonomy_term_id") REFERENCES "hsds"."taxonomy_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."cost_options" ADD CONSTRAINT "cost_options_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."organization_identifiers" ADD CONSTRAINT "organization_identifiers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."service_capacity" ADD CONSTRAINT "service_capacity_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."service_capacity" ADD CONSTRAINT "service_capacity_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "hsds"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."urls" ADD CONSTRAINT "urls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hsds"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsds"."urls" ADD CONSTRAINT "urls_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hsds"."services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_audit"."source_records" ADD CONSTRAINT "source_records_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "import_audit"."import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_audit"."source_mappings" ADD CONSTRAINT "source_mappings_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "import_audit"."source_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_audit"."import_issues" ADD CONSTRAINT "import_issues_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "import_audit"."import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
