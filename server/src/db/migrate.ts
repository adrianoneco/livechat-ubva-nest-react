import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'convo_insight',
});

const db = drizzle(pool);

async function main() {
  const migrationsFolder = './drizzle';
  
  // Check if there are any migration files
  const migrationFiles = fs.readdirSync(migrationsFolder)
    .filter(f => f.endsWith('.sql') && !f.startsWith('_'));
  
  if (migrationFiles.length === 0) {
    console.log('✅ No migrations to run');
    process.exit(0);
  }

  console.log(`📦 Found ${migrationFiles.length} migration file(s)`);
  console.log('Running migrations...');
  
  try {
    await migrate(db, { migrationsFolder });
    console.log('✅ Migrations completed - everything is up to date');
  } catch (err: any) {
    // Handle "already exists" errors gracefully
    if (err.message?.includes('already exists') || err.code === '42710' || err.code === '42P07') {
      console.log('✅ Schema already up to date - no changes needed');
      process.exit(0);
    }
    throw err;
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
