-- MARES — Unicidade do nome em inglês (case-insensitive), além do PT já existente.
CREATE UNIQUE INDEX "Organ_name_en_key" ON "Organ" (lower(("name" ->> 'en')));
CREATE UNIQUE INDEX "ExamType_name_en_key" ON "ExamType" (lower(("name" ->> 'en')));
CREATE UNIQUE INDEX "Pathogen_name_en_key" ON "Pathogen" (lower(("name" ->> 'en'))) WHERE "name" IS NOT NULL;
