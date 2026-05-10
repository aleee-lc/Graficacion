-- DropForeignKey
ALTER TABLE "public"."users" DROP CONSTRAINT "fk_user_type";

-- DropForeignKey
ALTER TABLE "public"."tech_user_roles" DROP CONSTRAINT "tech_user_roles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tech_user_roles" DROP CONSTRAINT "tech_user_roles_role_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."stakeholder_profile" DROP CONSTRAINT "stakeholder_profile_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."stakeholder_profile" DROP CONSTRAINT "stakeholder_profile_stakeholder_role_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_users" DROP CONSTRAINT "project_users_project_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_users" DROP CONSTRAINT "project_users_user_id_fkey";

-- AlterTable
CREATE SEQUENCE "public".user_types_id_seq;
ALTER TABLE "public"."user_types" ALTER COLUMN "id" SET DEFAULT nextval('"public".user_types_id_seq');
ALTER SEQUENCE "public".user_types_id_seq OWNED BY "public"."user_types"."id";

-- CreateTable
CREATE TABLE "public"."class_attributes" (
    "id" SERIAL NOT NULL,
    "class_id" INTEGER,
    "name" TEXT,
    "data_type" TEXT,

    CONSTRAINT "class_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."class_inheritance" (
    "parent_class_id" INTEGER NOT NULL,
    "child_class_id" INTEGER NOT NULL,

    CONSTRAINT "class_inheritance_pkey" PRIMARY KEY ("parent_class_id","child_class_id")
);

-- CreateTable
CREATE TABLE "public"."class_methods" (
    "id" SERIAL NOT NULL,
    "class_id" INTEGER,
    "name" TEXT,
    "return_type" TEXT,

    CONSTRAINT "class_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."class_relationships" (
    "id" SERIAL NOT NULL,
    "source_class_id" INTEGER,
    "target_class_id" INTEGER,
    "relationship_type" INTEGER,

    CONSTRAINT "class_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."classes" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER,
    "name" TEXT,
    "description" TEXT,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."interview_results" (
    "id" INTEGER NOT NULL,
    "audio_url" TEXT,
    "transcript" TEXT,

    CONSTRAINT "interview_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."processes" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER,
    "name" TEXT,
    "description" TEXT,

    CONSTRAINT "processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."relationship_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "relationship_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."requirement_reviews" (
    "requirement_id" INTEGER NOT NULL,
    "product_owner_id" INTEGER NOT NULL,
    "approved" BOOLEAN,
    "comments" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "requirement_reviews_pkey" PRIMARY KEY ("requirement_id","product_owner_id")
);

-- CreateTable
CREATE TABLE "public"."requirement_sources" (
    "requirement_id" INTEGER NOT NULL,
    "technique_result_id" INTEGER NOT NULL,

    CONSTRAINT "requirement_sources_pkey" PRIMARY KEY ("requirement_id","technique_result_id")
);

-- CreateTable
CREATE TABLE "public"."requirement_sources_catalog" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "requirement_sources_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."requirement_statuses" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "requirement_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."requirements" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER,
    "title" TEXT,
    "description" TEXT,
    "source" INTEGER,
    "status" INTEGER,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subprocess_techniques" (
    "id" SERIAL NOT NULL,
    "subprocess_id" INTEGER,
    "technique_id" INTEGER,
    "tech_user_id" INTEGER,
    "scheduled_date" TIMESTAMPTZ(6),
    "duration_minutes" INTEGER,
    "status" INTEGER,

    CONSTRAINT "subprocess_techniques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subprocesses" (
    "id" SERIAL NOT NULL,
    "process_id" INTEGER,
    "name" TEXT,
    "description" TEXT,

    CONSTRAINT "subprocesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."survey_results" (
    "id" INTEGER NOT NULL,
    "responses" JSONB,

    CONSTRAINT "survey_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."technique_evidences" (
    "id" SERIAL NOT NULL,
    "subprocess_technique_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "uploaded_by_user_id" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "object_path" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "technique_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."technique_results" (
    "id" SERIAL NOT NULL,
    "subprocess_technique_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technique_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."technique_stakeholders" (
    "subprocess_technique_id" INTEGER NOT NULL,
    "stakeholder_user_id" INTEGER NOT NULL,

    CONSTRAINT "technique_stakeholders_pkey" PRIMARY KEY ("subprocess_technique_id","stakeholder_user_id")
);

-- CreateTable
CREATE TABLE "public"."technique_statuses" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "technique_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."techniques" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "description" TEXT,

    CONSTRAINT "techniques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."workshop_observations" (
    "id" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "workshop_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "relationship_types_code_key" ON "public"."relationship_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_sources_catalog_code_key" ON "public"."requirement_sources_catalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_statuses_code_key" ON "public"."requirement_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "technique_evidences_object_path_key" ON "public"."technique_evidences"("object_path");

-- CreateIndex
CREATE UNIQUE INDEX "technique_results_subprocess_technique_id_key" ON "public"."technique_results"("subprocess_technique_id");

-- CreateIndex
CREATE UNIQUE INDEX "technique_statuses_code_key" ON "public"."technique_statuses"("code");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "fk_user_type" FOREIGN KEY ("user_type") REFERENCES "public"."user_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tech_user_roles" ADD CONSTRAINT "tech_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."tech_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."tech_user_roles" ADD CONSTRAINT "tech_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."stakeholder_profile" ADD CONSTRAINT "stakeholder_profile_stakeholder_role_id_fkey" FOREIGN KEY ("stakeholder_role_id") REFERENCES "public"."stakeholder_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."stakeholder_profile" ADD CONSTRAINT "stakeholder_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."project_users" ADD CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."project_users" ADD CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."class_attributes" ADD CONSTRAINT "class_attributes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."class_inheritance" ADD CONSTRAINT "class_inheritance_child_class_id_fkey" FOREIGN KEY ("child_class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."class_inheritance" ADD CONSTRAINT "class_inheritance_parent_class_id_fkey" FOREIGN KEY ("parent_class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."class_methods" ADD CONSTRAINT "class_methods_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."class_relationships" ADD CONSTRAINT "class_relationships_source_class_id_fkey" FOREIGN KEY ("source_class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."class_relationships" ADD CONSTRAINT "class_relationships_target_class_id_fkey" FOREIGN KEY ("target_class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."class_relationships" ADD CONSTRAINT "fk_relationship_type" FOREIGN KEY ("relationship_type") REFERENCES "public"."relationship_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."classes" ADD CONSTRAINT "classes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."interview_results" ADD CONSTRAINT "interview_results_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."technique_results"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."processes" ADD CONSTRAINT "processes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."requirement_reviews" ADD CONSTRAINT "requirement_reviews_product_owner_id_fkey" FOREIGN KEY ("product_owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."requirement_reviews" ADD CONSTRAINT "requirement_reviews_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."requirement_sources" ADD CONSTRAINT "requirement_sources_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."requirement_sources" ADD CONSTRAINT "requirement_sources_technique_result_id_fkey" FOREIGN KEY ("technique_result_id") REFERENCES "public"."technique_results"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."requirements" ADD CONSTRAINT "fk_requirement_source" FOREIGN KEY ("source") REFERENCES "public"."requirement_sources_catalog"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."requirements" ADD CONSTRAINT "fk_requirement_status" FOREIGN KEY ("status") REFERENCES "public"."requirement_statuses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."subprocess_techniques" ADD CONSTRAINT "fk_technique_status" FOREIGN KEY ("status") REFERENCES "public"."technique_statuses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."subprocess_techniques" ADD CONSTRAINT "subprocess_techniques_subprocess_id_fkey" FOREIGN KEY ("subprocess_id") REFERENCES "public"."subprocesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."subprocess_techniques" ADD CONSTRAINT "subprocess_techniques_tech_user_id_fkey" FOREIGN KEY ("tech_user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."subprocess_techniques" ADD CONSTRAINT "subprocess_techniques_technique_id_fkey" FOREIGN KEY ("technique_id") REFERENCES "public"."techniques"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."subprocesses" ADD CONSTRAINT "subprocesses_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."survey_results" ADD CONSTRAINT "survey_results_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."technique_results"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."technique_evidences" ADD CONSTRAINT "technique_evidences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."technique_evidences" ADD CONSTRAINT "technique_evidences_subprocess_technique_id_fkey" FOREIGN KEY ("subprocess_technique_id") REFERENCES "public"."subprocess_techniques"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."technique_evidences" ADD CONSTRAINT "technique_evidences_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."technique_results" ADD CONSTRAINT "technique_results_subprocess_technique_id_fkey" FOREIGN KEY ("subprocess_technique_id") REFERENCES "public"."subprocess_techniques"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."technique_stakeholders" ADD CONSTRAINT "technique_stakeholders_stakeholder_user_id_fkey" FOREIGN KEY ("stakeholder_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."technique_stakeholders" ADD CONSTRAINT "technique_stakeholders_subprocess_technique_id_fkey" FOREIGN KEY ("subprocess_technique_id") REFERENCES "public"."subprocess_techniques"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."workshop_observations" ADD CONSTRAINT "workshop_observations_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."technique_results"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

