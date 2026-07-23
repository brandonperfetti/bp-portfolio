import {
  MigrateUpArgs,
  MigrateDownArgs,
  sql,
} from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "identity" ADD COLUMN "resume_id" integer;
  ALTER TABLE "identity" ADD CONSTRAINT "identity_resume_id_media_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "identity_resume_idx" ON "identity" USING btree ("resume_id");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "identity" DROP CONSTRAINT "identity_resume_id_media_id_fk";
  
  DROP INDEX "identity_resume_idx";
  ALTER TABLE "identity" DROP COLUMN "resume_id";`)
}
