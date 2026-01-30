import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { AiModule } from './ai/ai.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { LeadsModule } from './leads/leads.module';
import { EscalationsModule } from './escalations/escalations.module';
import { MeetingsModule } from './meetings/meetings.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AdminModule } from './admin/admin.module';
import { TeamModule } from './team/team.module';
import { SetupModule } from './setup/setup.module';
import { TicketsModule } from './tickets/tickets.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AudioModule } from './audio/audio.module';
import { FunctionsModule } from './functions/functions.module';
import { TablesModule } from './tables/tables.module';
import { WebsocketModule } from './websocket/websocket.module';
import { HealthController } from './health.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'livechat',
      entities: [__dirname + '/entities/*.entity{.ts,.js}'],
      synchronize: true, // Don't auto-sync in production - use migrations
      logging: false,
    }),

    AuthModule,
    UsersModule,
    ConversationsModule,
    WhatsappModule,
    AiModule,
    CampaignsModule,
    LeadsModule,
    EscalationsModule,
    MeetingsModule,
    KnowledgeModule,
    AdminModule,
    TeamModule,
    SetupModule,
    TicketsModule,
    IntegrationsModule,
    AudioModule,
    FunctionsModule,
    TablesModule,
    WebsocketModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
