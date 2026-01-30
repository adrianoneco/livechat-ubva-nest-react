import pg from 'pg';

const { Client } = pg;

// Clients for both databases
const livechatClient = new Client({
  host: '127.0.0.1',
  user: 'postgres',
  password: 'HbVRLm4R3sHLRWTTFz79vMmdcgMw7xkj',
  database: 'livechat'
});

const evolutionClient = new Client({
  host: '127.0.0.1',
  user: 'postgres',
  password: 'HbVRLm4R3sHLRWTTFz79vMmdcgMw7xkj',
  database: 'evolution'
});

async function run() {
  await livechatClient.connect();
  await evolutionClient.connect();
  
  console.log('Syncing group names and profile pictures from Evolution to Livechat...\n');
  
  // Get all groups from Evolution Chat table
  const { rows: evolutionGroups } = await evolutionClient.query(`
    SELECT c."remoteJid", c.name, ct."profilePicUrl"
    FROM "Chat" c
    LEFT JOIN "Contact" ct ON c."remoteJid" = ct."remoteJid" AND c."instanceId" = ct."instanceId"
    WHERE c."remoteJid" LIKE '%@g.us'
      AND c.name IS NOT NULL 
      AND c.name != ''
  `);
  
  console.log(`Found ${evolutionGroups.length} groups in Evolution\n`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const group of evolutionGroups) {
    // Find corresponding contact in livechat by remote_jid or phone_number
    const groupId = group.remoteJid.replace(/@.*$/, '');
    
    const result = await livechatClient.query(`
      UPDATE whatsapp_contacts 
      SET name = COALESCE($1, name),
          profile_picture_url = COALESCE($2, profile_picture_url),
          updated_at = NOW()
      WHERE (remote_jid = $3 OR phone_number = $4)
      RETURNING id, name, phone_number, remote_jid
    `, [group.name, group.profilePicUrl, group.remoteJid, groupId]);
    
    if (result.rowCount > 0) {
      console.log(`✓ Updated: ${group.name} (${group.remoteJid}) ${group.profilePicUrl ? '+ pic' : ''}`);
      updated++;
    } else {
      console.log(`✗ Not found in livechat: ${group.name} (${group.remoteJid})`);
      notFound++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  
  // Show current groups in livechat
  const { rows: livechatGroups } = await livechatClient.query(`
    SELECT id, name, phone_number, remote_jid, profile_picture_url, is_group
    FROM whatsapp_contacts
    WHERE is_group = true
    ORDER BY updated_at DESC
    LIMIT 20
  `);
  
  console.log(`\nGroups in livechat now:`);
  livechatGroups.forEach(g => {
    console.log(`  - ${g.name || '(no name)'} | ${g.phone_number} | pic: ${g.profile_picture_url ? 'yes' : 'no'}`);
  });
  
  await livechatClient.end();
  await evolutionClient.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
