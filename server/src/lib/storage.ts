import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.S3_BUCKET || 'convo-insight';

// When S3_OVERRITE_URL=true, transform S3 URLs to use /s3/ proxy path
// This allows global access through the app's proxy instead of direct S3 endpoint
const S3_OVERRIDE_URL = process.env.S3_OVERRITE_URL === 'true';
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';

function transformToProxyUrl(signedUrl: string): string {
  if (!S3_OVERRIDE_URL) {
    return signedUrl;
  }
  
  try {
    const url = new URL(signedUrl);
    // Transform: https://s3.ubva.com.br/bucket/path?sig -> /s3/bucket/path?sig
    return `/s3${url.pathname}${url.search}`;
  } catch {
    // If URL parsing fails, return original
    return signedUrl;
  }
}

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);
  const chunks: Uint8Array[] = [];

  if (response.Body) {
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks);
}

export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return transformToProxyUrl(signedUrl);
}

export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return transformToProxyUrl(signedUrl);
}
