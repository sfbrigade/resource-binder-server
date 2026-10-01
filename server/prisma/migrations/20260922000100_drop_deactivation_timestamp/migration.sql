-- The cutover migration already preserved legacy deactivations as native bans.
ALTER TABLE "User" DROP COLUMN "deactivatedAt";
