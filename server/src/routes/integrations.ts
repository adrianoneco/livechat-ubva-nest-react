import { Router, Request, Response } from 'express';
import { db } from '../db';
import { whatsappContacts } from '../db/schema/whatsapp';
import { authenticate } from '../middleware/auth';
import { eq, and } from 'drizzle-orm';

const router = Router();

interface GoogleContact {
  resourceName: string;
  names?: Array<{ displayName: string }>;
  phoneNumbers?: Array<{ value: string; canonicalForm?: string }>;
  emailAddresses?: Array<{ value: string }>;
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Import contacts from Google
router.post('/google-contacts', authenticate, async (req: Request, res: Response) => {
  try {
    const { googleAccessToken, instanceId, sectorId } = req.body;
    const userId = req.user!.userId;

    if (!googleAccessToken) {
      return res.status(400).json({ error: 'Token de acesso do Google não fornecido' });
    }

    if (!instanceId) {
      return res.status(400).json({ error: 'ID da instância não fornecido' });
    }

    console.log(`[import-google-contacts] Starting import for user ${userId}`);

    // Fetch contacts from Google People API
    const googleApiUrl = 'https://people.googleapis.com/v1/people/me/connections';
    const params = new URLSearchParams({
      personFields: 'names,phoneNumbers,emailAddresses',
      pageSize: '1000',
    });

    const googleResponse = await fetch(`${googleApiUrl}?${params}`, {
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
      },
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error('[import-google-contacts] Google API error:', errorText);
      return res.status(400).json({ 
        error: 'Erro ao acessar contatos do Google. Verifique se autorizou o acesso.' 
      });
    }

    const googleData = await googleResponse.json() as { connections?: GoogleContact[] };
    const connections: GoogleContact[] = googleData.connections || [];

    console.log(`[import-google-contacts] Found ${connections.length} contacts from Google`);

    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Process each contact
    for (const contact of connections) {
      try {
        // Get phone number (required field)
        const phoneNumbers = contact.phoneNumbers || [];
        if (phoneNumbers.length === 0) {
          result.skipped++;
          continue;
        }

        // Normalize phone number
        let phoneNumber = phoneNumbers[0].canonicalForm || phoneNumbers[0].value;
        phoneNumber = phoneNumber.replace(/\D/g, '');
        
        // Skip if no valid phone
        if (!phoneNumber || phoneNumber.length < 8) {
          result.skipped++;
          continue;
        }

        // Ensure phone has country code (default Brazil +55)
        if (!phoneNumber.startsWith('55') && phoneNumber.length <= 11) {
          phoneNumber = '55' + phoneNumber;
        }

        // Get name
        const name = contact.names?.[0]?.displayName || `Contato ${phoneNumber.slice(-4)}`;
        
        // Get email
        const email = contact.emailAddresses?.[0]?.value || null;

        // Check if contact already exists in this instance
        const [existingContact] = await db
          .select()
          .from(whatsappContacts)
          .where(
            and(
              eq(whatsappContacts.instanceId, instanceId),
              eq(whatsappContacts.phoneNumber, phoneNumber)
            )
          )
          .limit(1);

        if (existingContact) {
          // Update existing contact
          await db
            .update(whatsappContacts)
            .set({
              name,
              metadata: { email, source: 'google', sectorId: sectorId || null },
              updatedAt: new Date(),
            })
            .where(eq(whatsappContacts.id, existingContact.id));

          result.updated++;
        } else {
          // Create new contact
          await db.insert(whatsappContacts).values({
            instanceId,
            phoneNumber,
            name,
            metadata: { email, source: 'google', sectorId: sectorId || null },
          });

          result.imported++;
        }
      } catch (contactError: unknown) {
        console.error('[import-google-contacts] Error processing contact:', contactError);
        const message = contactError instanceof Error ? contactError.message : 'Erro desconhecido';
        result.errors.push(`Erro ao processar contato: ${message}`);
      }
    }

    console.log(`[import-google-contacts] Import complete:`, result);

    res.json({
      success: true,
      result,
      message: `Importação concluída: ${result.imported} novos, ${result.updated} atualizados, ${result.skipped} ignorados`,
    });
  } catch (error) {
    console.error('[import-google-contacts] Error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    res.status(500).json({ error: message });
  }
});

export default router;
