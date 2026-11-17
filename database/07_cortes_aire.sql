-- Cortes de calidad del aire por monitor. NULL = valores por defecto (bueno >= 0.80, moderado >= 0.50).
ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS aire_corte_bueno NUMERIC(4, 2);
ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS aire_corte_moderado NUMERIC(4, 2);
ALTER TABLE dispositivos DROP CONSTRAINT IF EXISTS dispositivos_cortes_aire_check;
ALTER TABLE dispositivos ADD CONSTRAINT dispositivos_cortes_aire_check CHECK (
  (aire_corte_bueno IS NULL AND aire_corte_moderado IS NULL)
  OR (aire_corte_moderado > 0 AND aire_corte_moderado < aire_corte_bueno AND aire_corte_bueno <= 10)
);
