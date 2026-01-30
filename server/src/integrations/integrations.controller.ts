import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Post('google-contacts')
  async importGoogleContacts(@Body() body: { googleAccessToken: string; instanceId: string; sectorId?: string }) {
    return this.integrationsService.importGoogleContacts(body.googleAccessToken, body.instanceId, body.sectorId);
  }
}
