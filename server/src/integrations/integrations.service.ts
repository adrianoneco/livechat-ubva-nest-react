import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, And } from 'typeorm';
import { WhatsappContact } from '../entities';

interface GoogleContact {
  resourceName: string;
  names?: Array<{ displayName: string }>;
  phoneNumbers?: Array<{ value: string; canonicalForm?: string }>;
  emailAddresses?: Array<{ value: string }>;
}

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(WhatsappContact)
    private contactRepository: Repository<WhatsappContact>,
  ) {}

  async importGoogleContacts(googleAccessToken: string, instanceId: string, sectorId?: string) {
    if (!googleAccessToken) throw new BadRequestException('Token de acesso do Google não fornecido');
    if (!instanceId) throw new BadRequestException('ID da instância não fornecido');

    const params = new URLSearchParams({
      personFields: 'names,phoneNumbers,emailAddresses',
      pageSize: '1000',
    });

    const googleResponse = await fetch(`https://people.googleapis.com/v1/people/me/connections?${params}`, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!googleResponse.ok) {
      throw new BadRequestException('Erro ao acessar contatos do Google. Verifique se autorizou o acesso.');
    }

    const googleData = await googleResponse.json() as { connections?: GoogleContact[] };
    const connections: GoogleContact[] = googleData.connections || [];

    const result = { imported: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (const contact of connections) {
      try {
        const phoneNumbers = contact.phoneNumbers || [];
        if (phoneNumbers.length === 0) { result.skipped++; continue; }

        let phoneNumber = phoneNumbers[0].canonicalForm || phoneNumbers[0].value;
        phoneNumber = phoneNumber.replace(/\D/g, '');
        if (!phoneNumber || phoneNumber.length < 8) { result.skipped++; continue; }
        if (!phoneNumber.startsWith('55') && phoneNumber.length <= 11) phoneNumber = '55' + phoneNumber;

        const name = contact.names?.[0]?.displayName || `Contato ${phoneNumber.slice(-4)}`;
        const email = contact.emailAddresses?.[0]?.value || null;

        const existing = await this.contactRepository.findOne({ where: { instanceId, phoneNumber } });

        if (existing) {
          await this.contactRepository.update(existing.id, {
            name,
            metadata: { email, source: 'google', sectorId: sectorId || null } as any,
            updatedAt: new Date(),
          });
          result.updated++;
        } else {
          await this.contactRepository.save({
            instanceId,
            phoneNumber,
            name,
            metadata: { email, source: 'google', sectorId: sectorId || null } as any,
          });
          result.imported++;
        }
      } catch (err: any) {
        result.errors.push(`Erro ao processar contato: ${err.message || 'Erro desconhecido'}`);
      }
    }

    return {
      success: true,
      result,
      message: `Importação concluída: ${result.imported} novos, ${result.updated} atualizados, ${result.skipped} ignorados`,
    };
  }
}
