-- MARES — Instituição executora (encalhe) e peso na necrópsia (condição).
--
-- `executingInstitution` → "Nome da instituição executora" do SIMBA (`dwc:institutionCode`).
--   É a instituição responsável pelo trecho do PMP onde o animal foi encontrado; em alguns
--   PMPs a própria coluna traz o nome do trecho ("Trecho 09"), que é como o pessoal de campo
--   identifica o local. Fica no encalhe por descrever ONDE/POR QUEM o animal foi achado.
--
-- `necropsyWeightKg` → peso da carcaça na necrópsia, em QUILOS. Vem do campo "Peso total" da
--   biometria do SIMBA (par `dc:measurementType`/`dc:measurementValue`), medida na mesma
--   ocasião de `necropsyDate` (`dc:measurementDeterminedDate`). Float e não Decimal pelo
--   mesmo motivo de strandingLat/Lon: é medida de campo, não valor monetário.
--
-- Ambas opcionais e sem backfill: são dados que não existiam antes: registros anteriores
-- ficam NULL ("—" na tela) até alguém preencher ou reimportar do SIMBA.

ALTER TABLE "Animal"
  ADD COLUMN "executingInstitution" TEXT,
  ADD COLUMN "necropsyWeightKg"     DOUBLE PRECISION;
