import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './server/src/db/schema/index.ts',
  out: './server/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:mNloQEWQA3wpBfhYK50HlbIrQgT8mKy7@127.0.0.1:5432/convo_insight',
  },
});
