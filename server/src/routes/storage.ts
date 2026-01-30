import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { 
  uploadFile, 
  getFile, 
  deleteFile, 
  getSignedDownloadUrl, 
  getSignedUploadUrl 
} from '../lib/storage';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Upload file - supports both multipart and bucket/path parameters
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get bucket and path from form data or use defaults
    const bucket = req.body.bucket || 'uploads';
    const customPath = req.body.path;
    
    const fileExtension = path.extname(req.file.originalname);
    const fileKey = customPath || `${crypto.randomUUID()}${fileExtension}`;
    
    // Build full path: bucket/filename
    const filePath = `${bucket}/${fileKey}`;

    console.log('[storage/upload] Uploading file:', {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      bucket,
      filePath,
    });

    await uploadFile(filePath, req.file.buffer, req.file.mimetype);

    res.json({
      success: true,
      key: filePath,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download file (redirect to signed URL)
router.get('/download/:bucket/:path1/:path2', async (req: Request, res: Response) => {
  try {
    const key = `${req.params.bucket}/${req.params.path1}/${req.params.path2}`;
    const url = await getSignedDownloadUrl(key, 3600);
    res.redirect(url);
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download file with 2-part path
router.get('/download/:bucket/:path1', async (req: Request, res: Response) => {
  try {
    const key = `${req.params.bucket}/${req.params.path1}`;
    const url = await getSignedDownloadUrl(key, 3600);
    res.redirect(url);
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download file with simple key
router.get('/download/:key', async (req: Request, res: Response) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const url = await getSignedDownloadUrl(key, 3600);
    res.redirect(url);
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get signed upload URL
router.post('/signed-upload-url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({ error: 'fileName and contentType are required' });
    }

    const fileExtension = path.extname(fileName);
    const fileKey = `${crypto.randomUUID()}${fileExtension}`;
    const filePath = `uploads/${fileKey}`;

    const url = await getSignedUploadUrl(filePath, contentType, 3600);

    res.json({
      success: true,
      uploadUrl: url,
      key: filePath,
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete file
router.delete('/:key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get the full path after the first param
    const key = req.url.split('?')[0].substring(1); // Remove leading /

    await deleteFile(key);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
