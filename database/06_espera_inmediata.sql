ALTER TABLE ubicaciones DROP CONSTRAINT IF EXISTS ubicaciones_espera_sin_conexion_s_check;
ALTER TABLE ubicaciones ADD CONSTRAINT ubicaciones_espera_sin_conexion_s_check
  CHECK (espera_sin_conexion_s IN (8, 10, 30, 60, 120, 300));
