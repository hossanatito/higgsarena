import "server-only";
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSetting, getSettingSecrets, type StorageSettings } from "@/lib/settings";
import { safeGet } from "./ssrf";

type Ready = { client: S3Client; settings: StorageSettings };

export async function storageClient(): Promise<Ready | null> {
  const { value } = await getSetting("storage");
  if (!value.enabled || !value.bucket) return null;
  const secrets = await getSettingSecrets("storage");
  if (!secrets.accessKeyId || !secrets.secretAccessKey) return null;
  const client = new S3Client({
    region: value.region || "auto",
    endpoint: value.endpoint || undefined,
    forcePathStyle: value.forcePathStyle,
    credentials: { accessKeyId: secrets.accessKeyId, secretAccessKey: secrets.secretAccessKey },
  });
  return { client, settings: value };
}

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Copy a Higgsfield output into the bucket. Returns the object key. */
export async function mirrorToStorage(ready: Ready, sourceUrl: string, key: string, contentType?: string): Promise<string> {
  const res = await safeGet(sourceUrl, { timeoutMs: 120_000 });
  const length = Number(res.headers["content-length"] ?? 0);
  if (length > MAX_BYTES) {
    res.destroy();
    throw new Error("File is too large to mirror");
  }
  const upload = new Upload({
    client: ready.client,
    params: {
      Bucket: ready.settings.bucket,
      Key: key,
      Body: res,
      ContentType: contentType || (res.headers["content-type"] as string | undefined) || "application/octet-stream",
      CacheControl: "private, max-age=31536000, immutable",
    },
  });
  await upload.done();
  return key;
}

export async function storageUrl(ready: Ready, key: string): Promise<string> {
  if (ready.settings.publicBaseUrl) return `${ready.settings.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  return getSignedUrl(ready.client, new GetObjectCommand({ Bucket: ready.settings.bucket, Key: key }), { expiresIn: 3600 });
}

export async function deleteFromStorage(ready: Ready, key: string) {
  await ready.client.send(new DeleteObjectCommand({ Bucket: ready.settings.bucket, Key: key }));
}

/** "Test connection": checks the bucket and writes then deletes a small object. */
export async function testStorage(ready: Ready): Promise<void> {
  await ready.client.send(new HeadBucketCommand({ Bucket: ready.settings.bucket }));
  const key = `.higgsarena-test/${Date.now()}.txt`;
  await ready.client.send(new PutObjectCommand({ Bucket: ready.settings.bucket, Key: key, Body: "ok", ContentType: "text/plain" }));
  await deleteFromStorage(ready, key);
}
