import { Request } from 'express';
import { uploadFile as s3UploadFile } from '../lib/storage';

export async function uploadFile(file: Express.Multer.File, req: Request): Promise<string> {
  // Upload para S3/MinIO
  const key = await s3UploadFile(file.buffer, file.originalname, file.mimetype);
  return key;
}
