import dotenv from 'dotenv';
import path from 'path';

// Load .env from parent directory (livechat root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Also try current directory as fallback
dotenv.config();
