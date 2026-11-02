-- Sequência atômica para o código de retalho (RET-00001...). Substitui o sorteio de 4 dígitos, que colidia.
CREATE SEQUENCE IF NOT EXISTS "remnant_code_seq" START WITH 1;--> statement-breakpoint
-- O próximo valor é o maior código numérico já existente + 1 (ou 1 se a tabela estiver vazia).
SELECT setval('remnant_code_seq', coalesce((SELECT max((substring("code" from '^RET-([0-9]+)$'))::int) FROM "stock_remnants"), 0) + 1, false);
