# Graficacion Backend (Node.js + TypeScript + Express + PostgreSQL)

## Requisitos
- Node.js 18+
- PostgreSQL (o Supabase PostgreSQL)

## Variables de entorno
Copia `.env.example` a `.env` y configura:

```env
PORT=4000
DATABASE_URL=postgresql://postgres.<project-ref>:password@aws-1-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres:password@db.<project-ref>.supabase.co:5432/postgres
DB_SSL=true
JWT_SECRET=super_secret_change_me
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:4200
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_STORAGE_BUCKET=technique-evidences
EVIDENCE_MAX_SIZE_MB=25
EVIDENCE_ALLOWED_MIME=audio/*,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain
EVIDENCE_SIGNED_URL_TTL_SECONDS=600
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Notas:
- Para Supabase usa `DATABASE_URL` (pooler, puerto `6543`) para runtime.
- Con pooler agrega `?pgbouncer=true&connection_limit=1` para evitar errores de prepared statements en Prisma.
- Usa `DIRECT_URL` (conexion directa, puerto `5432`) para migraciones Prisma.
- Si `DATABASE_URL` existe, tiene prioridad sobre `DB_HOST/DB_PORT/...`.

## Ejecutar
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Prisma only
Flujo recomendado: usa solo `backend/prisma/migrations` con Prisma.
No agregues nuevas migraciones en `../database/migrations`.

Crear o editar migraciones:
```bash
npm run prisma:migrate:dev -- --name init
```

Aplicar migraciones en deploy/produccion:
```bash
npm run prisma:migrate:deploy
```

Ver estado de migraciones:
```bash
npm run prisma:migrate:status
```

Ejecutar seed:
```bash
npm run prisma:seed
```

## Endpoints base
- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /projects`
- `POST /projects`
- `POST /projects/wizard`
- `GET /projects/:id`
- `PUT /projects/:id`
- `GET /projects/:id/users`
- `POST /projects/:id/users`
- `GET /projects/:id/processes`
- `POST /projects/:id/processes`
- `GET /processes/:id`
- `PUT /processes/:id`
- `GET /processes/:id/subprocesses`
- `POST /processes/:id/subprocesses`
- `GET /subprocesses/:id`
- `PUT /subprocesses/:id`
- `GET /subprocesses/:id/techniques`
- `POST /subprocesses/:id/techniques`
- `GET /subprocesses/:id/techniques/:assignmentId/evidences`
- `POST /subprocesses/:id/techniques/:assignmentId/evidences`
- `POST /subprocesses/:id/techniques/:assignmentId/evidences/:evidenceId/signed-url`
- `DELETE /subprocesses/:id/techniques/:assignmentId/evidences/:evidenceId`
- `GET /roles/tech`
- `POST /roles/tech`
- `PUT /roles/tech/:id`
- `DELETE /roles/tech/:id`
- `GET /roles/stakeholders`
- `POST /roles/stakeholders`
- `PUT /roles/stakeholders/:id`
- `DELETE /roles/stakeholders/:id`
- `GET /users?type=TECH|CLIENT&query=`
- `POST /users`
- `POST /projects/:id/ai/draft-findings`
- `GET /projects/:id/ai/draft-findings`
- `PATCH /projects/:id/ai/draft-findings/:draftId`
- `POST /projects/:id/ai/draft-requirements`
- `GET /projects/:id/ai/draft-requirements`
- `PATCH /projects/:id/ai/draft-requirements/:draftId`

## Catálogos usados
- `user_types` (ej: `TECH`, `CLIENT`)
- `technique_statuses` (ej: `PLANNED`, `DONE`, `CANCELLED`)

El backend guarda IDs en FK y expone `code` en respuestas cuando aplica.
