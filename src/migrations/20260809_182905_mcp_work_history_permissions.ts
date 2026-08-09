import {
  MigrateUpArgs,
  MigrateDownArgs,
  sql,
} from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "work_history_find" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "work_history_create" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "work_history_update" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "work_history_delete" boolean DEFAULT false;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "work_history_find";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "work_history_create";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "work_history_update";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "work_history_delete";`)
}
