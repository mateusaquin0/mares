-- A Data API do Supabase fica FECHADA para anon (complementa data_api_read_only).
--
-- O ramo "público" das policies de SELECT entregava ao visitante a linha INTEIRA dos
-- indivíduos públicos (observações, valores quantitativos, local de armazenamento, laudo) e
-- seguia a pesquisa primária do indivíduo — num compartilhado, expunha também as amostras da
-- pesquisa participante privada. O mapa público lê pelo servidor, que escolhe os campos e
-- filtra por pesquisa; nenhum visitante precisa da Data API.
--
-- authenticated continua lendo sob RLS (isolamento por organização).

REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;
