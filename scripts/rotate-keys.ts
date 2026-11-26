/**
 * Re-encrypt every stored secret with the current ENCRYPTION_KEY.
 *
 *  1. Move the old key to ENCRYPTION_KEY_PREVIOUS.
 *  2. Put a new key in ENCRYPTION_KEY (openssl rand -base64 32).
 *  3. Run `pnpm keys:rotate` (in Docker: docker compose exec app node dist/cli.mjs keys:rotate).
 *  4. Remove ENCRYPTION_KEY_PREVIOUS and restart.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { apiCredential, instanceSetting } from "../src/lib/db/schema";
import { decrypt, encrypt, needsRotation } from "../src/lib/crypto/vault";

export async function rotateKeys() {
  let rotated = 0;
  for (const row of await db.select().from(apiCredential)) {
    const patch: Partial<typeof apiCredential.$inferInsert> = {};
    if (needsRotation(row.keyEnc)) patch.keyEnc = encrypt(decrypt(row.keyEnc, "hf-key", row.id), "hf-key", row.id);
    if (row.webhookSecretEnc && needsRotation(row.webhookSecretEnc)) {
      patch.webhookSecretEnc = encrypt(decrypt(row.webhookSecretEnc, "hf-webhook-secret", row.id), "hf-webhook-secret", row.id);
    }
    if (Object.keys(patch).length) {
      await db.update(apiCredential).set(patch).where(eq(apiCredential.id, row.id));
      rotated++;
    }
  }
  for (const row of await db.select().from(instanceSetting)) {
    if (row.secretEnc && needsRotation(row.secretEnc)) {
      await db.update(instanceSetting).set({ secretEnc: encrypt(decrypt(row.secretEnc, "instance-setting", row.key), "instance-setting", row.key) }).where(eq(instanceSetting.key, row.key));
      rotated++;
    }
  }
  return rotated;
}

if (process.argv[1]?.includes("rotate")) {
  rotateKeys()
    .then((n) => {
      console.log(`Re-encrypted ${n} record(s) with the current ENCRYPTION_KEY. You can now remove ENCRYPTION_KEY_PREVIOUS.`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("Rotation failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
