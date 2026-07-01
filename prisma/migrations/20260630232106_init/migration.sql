-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORG_ADMIN', 'RESEARCHER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Result" AS ENUM ('POSITIVO', 'NEGATIVO', 'INCONCLUSIVO');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('STORED', 'IN_USE', 'DEPLETED', 'DEGRADED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'RESEARCHER',
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Research" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchProtocol" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "organId" TEXT NOT NULL,
    "pathogenId" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,

    CONSTRAINT "ResearchProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organ" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Organ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pathogen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,

    CONSTRAINT "Pathogen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ExamType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "controlId" TEXT,
    "simbaRecordNumber" TEXT,
    "species" TEXT NOT NULL,
    "wormsAphiaId" INTEGER,
    "taxonFamily" TEXT,
    "taxonOrder" TEXT,
    "sex" TEXT,
    "lifeStage" TEXT,
    "bodyCondition" TEXT,
    "decompositionStage" TEXT,
    "strandingLat" DOUBLE PRECISION,
    "strandingLon" DOUBLE PRECISION,
    "strandingBeach" TEXT,
    "municipality" TEXT,
    "state" TEXT,
    "eventDate" TIMESTAMP(3),
    "macroscopicNotes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "researchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "organId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "collectionDate" TIMESTAMP(3),
    "storageLocation" TEXT,
    "storageTemp" DOUBLE PRECISION,
    "status" "SampleStatus" NOT NULL DEFAULT 'STORED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "pathogenId" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,
    "result" "Result",
    "ctValue" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalMedia" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE INDEX "Research_orgId_idx" ON "Research"("orgId");

-- CreateIndex
CREATE INDEX "ResearchProtocol_researchId_idx" ON "ResearchProtocol"("researchId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchProtocol_researchId_organId_pathogenId_examTypeId_key" ON "ResearchProtocol"("researchId", "organId", "pathogenId", "examTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Organ_key_key" ON "Organ"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Pathogen_name_key" ON "Pathogen"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExamType_name_key" ON "ExamType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Animal_controlId_key" ON "Animal"("controlId");

-- CreateIndex
CREATE UNIQUE INDEX "Animal_simbaRecordNumber_key" ON "Animal"("simbaRecordNumber");

-- CreateIndex
CREATE INDEX "Animal_researchId_idx" ON "Animal"("researchId");

-- CreateIndex
CREATE INDEX "Animal_species_idx" ON "Animal"("species");

-- CreateIndex
CREATE INDEX "Sample_animalId_idx" ON "Sample"("animalId");

-- CreateIndex
CREATE INDEX "Analysis_sampleId_idx" ON "Analysis"("sampleId");

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_sampleId_pathogenId_examTypeId_key" ON "Analysis"("sampleId", "pathogenId", "examTypeId");

-- CreateIndex
CREATE INDEX "AnimalMedia_animalId_idx" ON "AnimalMedia"("animalId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Research" ADD CONSTRAINT "Research_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchProtocol" ADD CONSTRAINT "ResearchProtocol_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchProtocol" ADD CONSTRAINT "ResearchProtocol_organId_fkey" FOREIGN KEY ("organId") REFERENCES "Organ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchProtocol" ADD CONSTRAINT "ResearchProtocol_pathogenId_fkey" FOREIGN KEY ("pathogenId") REFERENCES "Pathogen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchProtocol" ADD CONSTRAINT "ResearchProtocol_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_organId_fkey" FOREIGN KEY ("organId") REFERENCES "Organ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_pathogenId_fkey" FOREIGN KEY ("pathogenId") REFERENCES "Pathogen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalMedia" ADD CONSTRAINT "AnimalMedia_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
