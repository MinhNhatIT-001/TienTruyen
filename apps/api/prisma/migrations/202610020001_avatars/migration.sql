ALTER TABLE "User" ADD COLUMN "avatar" TEXT NOT NULL DEFAULT '/avatars/avatar-01.webp';
UPDATE "User" SET "avatar" = '/avatars/avatar-' || lpad((1 + mod(abs(hashtext(id)::bigint), 11))::text, 2, '0') || '.webp';
