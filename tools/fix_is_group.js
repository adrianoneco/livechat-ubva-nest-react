import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: '127.0.0.1',
  user: 'postgres',
  password: 'HbVRLm4R3sHLRWTTFz79vMmdcgMw7xkj',
  database: 'livechat'
});

async function run() {
  await client.connect();
  
  // Set is_group = true for group chats (@g.us in remote_jid)
  const r1 = await client.query(`
    UPDATE whatsapp_contacts 
    SET is_group = true 
    WHERE remote_jid LIKE '%@g.us' AND (is_group IS NULL OR is_group = false)
  `);
  console.log('Groups updated (by remote_jid @g.us):', r1.rowCount);
  
  // Set is_group = true for contacts with group-style phone_number (contains hyphen between numbers)
  // WhatsApp group IDs have format like: 554198439494-1568377507
  const r2 = await client.query(`
    UPDATE whatsapp_contacts 
    SET is_group = true 
    WHERE phone_number ~ '^[0-9]+-[0-9]+$' AND (is_group IS NULL OR is_group = false)
  `);
  console.log('Groups updated (by phone_number pattern):', r2.rowCount);
  
  // Also fix remote_jid for these contacts if null
  const r3 = await client.query(`
    UPDATE whatsapp_contacts 
    SET remote_jid = phone_number || '@g.us'
    WHERE phone_number ~ '^[0-9]+-[0-9]+$' AND remote_jid IS NULL
  `);
  console.log('Remote JID fixed for groups:', r3.rowCount);
  
  // Set is_group = false for individual chats (not @g.us and not group phone pattern)
  const r4 = await client.query(`
    UPDATE whatsapp_contacts 
    SET is_group = false 
    WHERE (remote_jid NOT LIKE '%@g.us' OR remote_jid IS NULL)
      AND (phone_number !~ '^[0-9]+-[0-9]+$' OR phone_number IS NULL)
      AND (is_group IS NULL OR is_group = true)
  `);
  console.log('Individual chats updated:', r4.rowCount);
  
  // Show results
  const groups = await client.query(`
    SELECT id, name, phone_number, remote_jid, is_group 
    FROM whatsapp_contacts 
    WHERE is_group = true
    LIMIT 20
  `);
  console.log('\nGroups in DB now:');
  groups.rows.forEach(r => console.log(r));
  
  await client.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
