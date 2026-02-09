# Graficación Backend (Node.js + TypeScript + Express + MySQL)

## Requisitos
- Node.js 18+
- MySQL 8+

## 1) Importar la base de datos
El dump está en `C:\Users\el_al\Downloads\graficacionbdd.sql`.

Ejemplo (PowerShell):
```
mysql -u root -p < "C:\Users\el_al\Downloads\graficacionbdd.sql"
```

## 2) Variables de entorno
Copia `.env.example` a `.env` y actualiza credenciales:
```
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=graficacion
JWT_SECRET=super_secret_change_me
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:4200
```

## 3) Instalar dependencias
```
npm install
```

## 4) Ejecutar en desarrollo
```
npm run dev
```

## Endpoints base
- `GET /health`
- `POST /auth/register` (name, email, password, mobile)
- `POST /auth/login`
- `GET /auth/me` (Bearer token)
- `GET /projects`
- `POST /projects`
- `POST /projects/wizard`
- `GET /projects/:id`
- `PUT /projects/:id`
- `GET /projects/:id/processes`
- `POST /projects/:id/processes`
- `GET /processes/:id`
- `PUT /processes/:id`
- `GET /processes/:id/subprocesses`
- `POST /processes/:id/subprocesses`
- `GET /subprocesses/:id`
- `PUT /subprocesses/:id`
- `GET /roles/tech`
- `POST /roles/tech`
- `GET /roles/stakeholders`
- `POST /roles/stakeholders`
- `GET /users?type=TECH|CLIENT&query=`
- `POST /users`

## Notas
- Solo usuarios con `user_type = 'TECH'` pueden autenticarse.
- Passwords se guardan hasheados con bcrypt.
- La tabla `users` debe incluir la columna `mobile`.
- Los endpoints de proyectos devuelven solo los proyectos asociados al usuario autenticado.
