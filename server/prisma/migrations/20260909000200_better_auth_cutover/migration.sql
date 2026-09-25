-- Preserve profile/access metadata; legacy passwords and sessions are not imported.
UPDATE "User" SET "name" = "firstName" || ' ' || "lastName" WHERE "name" = '';
UPDATE "User" SET "role" = 'admin' WHERE "isAdmin" = true;
UPDATE "User" SET "banned" = true WHERE "deactivatedAt" IS NOT NULL;

-- DropIndex
DROP INDEX "User_passwordResetToken_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "hashedPassword",
DROP COLUMN "isAdmin",
DROP COLUMN "passwordResetExpiresAt",
DROP COLUMN "passwordResetToken";
