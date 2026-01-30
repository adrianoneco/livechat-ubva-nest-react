# Convo Insight Backend API

Backend Express + TypeScript + Drizzle ORM + PostgreSQL + MinIO S3

## 🚀 Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 4.21
- **Language**: TypeScript 5.7
- **Database**: PostgreSQL 16 (via Docker)
- **ORM**: Drizzle ORM 0.36
- **Storage**: MinIO S3-compatible
- **Auth**: JWT (jsonwebtoken + bcrypt)
- **AI**: Groq API (llama-3.3-70b)

## 📦 Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# 3. Iniciar Docker (PostgreSQL + MinIO)
cd ..
docker-compose up -d

# 4. Gerar e rodar migrações
npm run db:generate
npm run db:migrate

# 5. Iniciar servidor de desenvolvimento
npm run dev
```

Servidor rodando em: http://localhost:3000

## 🔧 Scripts Disponíveis

```bash
npm run dev          # Desenvolvimento com hot-reload
npm run build        # Build para produção
npm start            # Iniciar em produção
npm run db:generate  # Gerar migrações Drizzle
npm run db:migrate   # Rodar migrações
npm run db:studio    # Abrir Drizzle Studio
npm run db:push      # Push schema direto (dev only)
```

## 📁 Estrutura

```
server/
├── src/
│   ├── db/
│   │   ├── schema/           # Schemas Drizzle
│   │   │   ├── users.ts      # Usuários e perfis
│   │   │   ├── auth.ts       # Autenticação
│   │   │   ├── whatsapp.ts   # WhatsApp
│   │   │   ├── sentiment.ts  # Análise IA
│   │   │   ├── sales.ts      # CRM
│   │   │   ├── campaigns.ts  # Campanhas
│   │   │   ├── relations.ts  # Relações
│   │   │   └── index.ts      # Exports
│   │   ├── index.ts          # DB connection
│   │   └── migrate.ts        # Migration runner
│   ├── middleware/
│   │   └── auth.ts           # JWT auth middleware
│   ├── lib/
│   │   └── storage.ts        # MinIO S3 client
│   ├── routes/
│   │   ├── auth.ts           # Autenticação
│   │   ├── users.ts          # Usuários
│   │   ├── conversations.ts  # Conversas
│   │   ├── storage.ts        # Storage
│   │   ├── whatsapp.ts       # WhatsApp
│   │   ├── ai.ts             # IA
│   │   ├── campaigns.ts      # Campanhas
│   │   ├── leads.ts          # Leads
│   │   ├── escalations.ts    # Escalações
│   │   ├── meetings.ts       # Reuniões
│   │   ├── knowledge.ts      # Conhecimento
│   │   ├── admin.ts          # Admin
│   │   ├── team.ts           # Equipe
│   │   └── setup.ts          # Setup
│   └── index.ts              # App principal
├── drizzle/                  # Migrações geradas
├── .env.example              # Exemplo de env
├── package.json
├── tsconfig.json
└── drizzle.config.ts
```

## 🔐 Variáveis de Ambiente

```env
# Server
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=convo_insight

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# S3/MinIO
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=convo-insight

# AI
GROQ_API_KEY=your-groq-api-key
```

## 📡 API Endpoints

### Autenticação
- `POST /api/auth/register` - Registrar usuário
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Usuário atual

### Usuários
- `GET /api/users` - Listar usuários
- `GET /api/users/me` - Perfil atual
- `PUT /api/users/me` - Atualizar perfil
- `GET /api/users/:id` - Buscar usuário

### Conversas
- `GET /api/conversations` - Listar conversas
- `GET /api/conversations/:id` - Detalhes
- `PUT /api/conversations/:id` - Atualizar
- `POST /api/conversations/:id/read` - Marcar lido
- `POST /api/conversations/:id/assign` - Atribuir
- `POST /api/conversations/:id/mode` - Mudar modo

### WhatsApp
- `POST /api/whatsapp/messages/send` - Enviar mensagem
- `POST /api/whatsapp/webhooks/evolution` - Webhook
- `POST /api/whatsapp/instances/:id/test` - Testar
- `GET /api/whatsapp/instances/check-status` - Status
- `PUT /api/whatsapp/messages/:id` - Editar
- `POST /api/whatsapp/sentiment/analyze` - Analisar
- `POST /api/whatsapp/conversations/:id/summary` - Resumir
- `POST /api/whatsapp/conversations/:id/categorize` - Categorizar
- `POST /api/whatsapp/contacts/fix-names` - Corrigir nomes
- `POST /api/whatsapp/contacts/sync-profiles` - Sincronizar

### IA
- `POST /api/ai/respond` - Resposta automática
- `POST /api/ai/compose-message` - Compor mensagem
- `POST /api/ai/suggest-replies` - Sugerir respostas
- `POST /api/ai/learn` - Aprendizado

### Campanhas
- `POST /api/campaigns` - Criar
- `GET /api/campaigns` - Listar
- `GET /api/campaigns/:id` - Detalhes
- `POST /api/campaigns/:id/send` - Enviar
- `POST /api/campaigns/process-scheduled` - Processar
- `POST /api/campaigns/:id/cancel` - Cancelar

### Leads
- `POST /api/leads` - Criar
- `GET /api/leads` - Listar
- `GET /api/leads/:id` - Detalhes
- `PUT /api/leads/:id` - Atualizar
- `POST /api/leads/:id/activities` - Adicionar atividade
- `POST /api/leads/:id/qualify` - Qualificar com IA
- `DELETE /api/leads/:id` - Deletar

### Escalações
- `POST /api/escalations` - Criar
- `GET /api/escalations` - Listar
- `POST /api/escalations/prepare` - Preparar
- `POST /api/escalations/distribute` - Distribuir
- `POST /api/escalations/:id/resolve` - Resolver

### Reuniões
- `POST /api/meetings/schedule` - Agendar
- `GET /api/meetings` - Listar
- `PUT /api/meetings/:id` - Atualizar
- `POST /api/meetings/reminders/process` - Processar lembretes
- `POST /api/meetings/:id/cancel` - Cancelar

### Conhecimento
- `GET /api/knowledge` - Listar
- `POST /api/knowledge/manage` - Criar/Editar
- `PUT /api/knowledge/manage/:id` - Atualizar
- `DELETE /api/knowledge/manage/:id` - Deletar
- `POST /api/knowledge/optimize` - Otimizar
- `POST /api/knowledge/:id/use` - Registrar uso

### Admin
- `POST /api/admin/reset-password/:userId` - Reset senha
- `POST /api/admin/approve-user/:userId` - Aprovar
- `POST /api/admin/deactivate-user/:userId` - Desativar
- `POST /api/admin/change-role/:userId` - Mudar role
- `GET /api/admin/users` - Listar todos

### Equipe
- `POST /api/team/invite` - Convidar
- `GET /api/team/invites` - Listar convites
- `POST /api/team/accept-invite/:token` - Aceitar (público)
- `DELETE /api/team/invites/:id` - Revogar

### Setup
- `POST /api/setup/config` - Configurar
- `GET /api/setup/config` - Buscar config
- `POST /api/setup/infrastructure` - Setup inicial
- `GET /api/setup/status` - Status setup

### Storage
- `POST /api/storage/upload` - Upload
- `GET /api/storage/download/:key` - Download
- `POST /api/storage/signed-upload-url` - URL upload
- `DELETE /api/storage/:key` - Deletar

## 🔑 Autenticação

Todas as rotas (exceto auth públicas) requerem Bearer token:

```bash
Authorization: Bearer <access_token>
```

### Roles
- `admin` - Acesso total
- `supervisor` - Gestão de equipe e operações
- `agent` - Atendimento

### Primeiro Usuário
O primeiro usuário registrado recebe automaticamente role `admin`.

## 🗃️ Database Schema

32 tabelas organizadas em 6 módulos:

1. **Users** - Perfis, roles, senhas, config
2. **WhatsApp** - Instâncias, contatos, conversas, mensagens
3. **Sentiment** - Análise IA, resumos, notas
4. **Sales** - Leads, atividades, histórico
5. **Campaigns** - Campanhas, escalações, reuniões
6. **Knowledge** - Base de conhecimento

## 🤖 Integração com IA

Usa Groq API (llama-3.3-70b-versatile) para:

- Respostas automáticas em conversas
- Análise de sentimento
- Resumos de conversa
- Sugestões inteligentes
- Qualificação de leads (BANT)
- Composição de mensagens

## 📦 Storage (MinIO)

Armazenamento S3-compatible para:

- Avatares de usuários
- Mídia WhatsApp (imagens, vídeos, documentos)
- Arquivos de campanhas
- Documentos anexos

## 🔐 Segurança

- ✅ JWT authentication
- ✅ Role-based access control
- ✅ Rate limiting (100 req/15min)
- ✅ Helmet.js security headers
- ✅ CORS configurado
- ✅ Senhas com bcrypt (10 rounds)
- ✅ Input validation

## 🐳 Docker

Inclui PostgreSQL 16 e MinIO:

```bash
docker-compose up -d
```

Serviços:
- PostgreSQL: localhost:5432
- MinIO API: localhost:9000
- MinIO Console: localhost:9001

## 📚 Documentação Adicional

- [MIGRATION_STATUS.md](../MIGRATION_STATUS.md) - Status da migração
- [MIGRATION_COMPLETE.md](../MIGRATION_COMPLETE.md) - Resumo completo
- [MIGRATION.md](../MIGRATION.md) - Guia de migração

## 🚀 Deploy

### Produção

1. Build:
```bash
npm run build
```

2. Configurar env de produção

3. Rodar migrações:
```bash
npm run db:migrate
```

4. Iniciar:
```bash
npm start
```

### Recomendações
- Use PM2 ou similar para process management
- Configure nginx como reverse proxy
- Use PostgreSQL gerenciado (RDS, etc)
- Configure S3 real ou MinIO em produção
- Implemente backup automatizado
- Configure monitoring (Sentry, etc)

## 📄 Licença

ISC
