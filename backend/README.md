# Graficacion Backend (Node.js + TypeScript + Express + PostgreSQL)

## Requisitos
- Node.js 18+
- PostgreSQL (o Supabase PostgreSQL)

## Variables de entorno
Copia `.env.example` a `.env` y configura:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/graficacion
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=graficacion
DB_SSL=false
JWT_SECRET=super_secret_change_me
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:4200
```

Notas:
- Para Supabase usa `DATABASE_URL` y `DB_SSL=true`.
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

## Catálogos usados
- `user_types` (ej: `TECH`, `CLIENT`)
- `technique_statuses` (ej: `PLANNED`, `DONE`, `CANCELLED`)

El backend guarda IDs en FK y expone `code` en respuestas cuando aplica.
