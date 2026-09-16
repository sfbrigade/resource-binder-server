-- AlterTable
ALTER TABLE "phones" ALTER COLUMN "extension" SET DATA TYPE TEXT USING "extension"::text;
