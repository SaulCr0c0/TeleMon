CREATE OR REPLACE FUNCTION agregar_lecturas_minuto() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  hasta timestamptz := date_trunc('minute', now());
  desde timestamptz;
  filas integer;
BEGIN
  SELECT max(minuto) - interval '2 minutes' INTO desde FROM lecturas_minuto;
  INSERT INTO lecturas_minuto (dispositivo_id, ubicacion_id, minuto,
    temp_avg, temp_min, temp_max, hum_avg, hum_min, hum_max,
    pres_avg, pres_min, pres_max, rs_r0_avg, rs_r0_min, n_lecturas)
  SELECT dispositivo_id,
    (array_agg(ubicacion_id ORDER BY fecha_hora DESC, id DESC))[1],
    date_trunc('minute', fecha_hora),
    avg(temperatura), min(temperatura), max(temperatura),
    avg(humedad), min(humedad), max(humedad),
    avg(presion), min(presion), max(presion),
    avg(rs_r0), min(rs_r0), count(*)
  FROM lecturas
  WHERE fecha_hora < hasta AND (desde IS NULL OR fecha_hora >= desde)
  GROUP BY dispositivo_id, date_trunc('minute', fecha_hora)
  ON CONFLICT (dispositivo_id, minuto) DO UPDATE SET
    ubicacion_id = EXCLUDED.ubicacion_id,
    temp_avg = EXCLUDED.temp_avg, temp_min = EXCLUDED.temp_min, temp_max = EXCLUDED.temp_max,
    hum_avg = EXCLUDED.hum_avg, hum_min = EXCLUDED.hum_min, hum_max = EXCLUDED.hum_max,
    pres_avg = EXCLUDED.pres_avg, pres_min = EXCLUDED.pres_min, pres_max = EXCLUDED.pres_max,
    rs_r0_avg = EXCLUDED.rs_r0_avg, rs_r0_min = EXCLUDED.rs_r0_min, n_lecturas = EXCLUDED.n_lecturas
  WHERE lecturas_minuto.n_lecturas IS DISTINCT FROM EXCLUDED.n_lecturas;
  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$;

CREATE OR REPLACE FUNCTION limpiar_lecturas(dias integer DEFAULT 30) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  filas integer;
BEGIN
  PERFORM agregar_lecturas_minuto();
  DELETE FROM lecturas l
  WHERE l.fecha_hora < now() - make_interval(days => dias)
    AND EXISTS (
      SELECT 1 FROM lecturas_minuto m
      WHERE m.dispositivo_id = l.dispositivo_id AND m.minuto = date_trunc('minute', l.fecha_hora)
    );
  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_lecturas_minuto_ubic_minuto ON lecturas_minuto (ubicacion_id, minuto);
