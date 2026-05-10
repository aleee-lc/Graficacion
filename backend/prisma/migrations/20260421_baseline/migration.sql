-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."user_types" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "user_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_type" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tech_roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "tech_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tech_user_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "tech_user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "public"."stakeholder_roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "stakeholder_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stakeholder_profile" (
    "user_id" INTEGER NOT NULL,
    "stakeholder_role_id" INTEGER,
    "company_name" TEXT,

    CONSTRAINT "stakeholder_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "start_date" DATE,
    "end_date" DATE,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_users" (
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "project_users_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_types_code_key" ON "public"."user_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "fk_user_type" FOREIGN KEY ("user_type") REFERENCES "public"."user_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tech_user_roles" ADD CONSTRAINT "tech_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tech_user_roles" ADD CONSTRAINT "tech_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."tech_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stakeholder_profile" ADD CONSTRAINT "stakeholder_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stakeholder_profile" ADD CONSTRAINT "stakeholder_profile_stakeholder_role_id_fkey" FOREIGN KEY ("stakeholder_role_id") REFERENCES "public"."stakeholder_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_users" ADD CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_users" ADD CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

