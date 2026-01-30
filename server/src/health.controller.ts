import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('api/health')
  apiHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
