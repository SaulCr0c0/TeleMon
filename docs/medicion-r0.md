# Medición del R0 del MQ-135 (#37, HU-28)

El backend calcula Rs/R0 y el nivel del aire (bueno ≥ 0,80, moderado ≥ 0,50, malo) con el R0 de cada monitor. Mientras la ficha no tenga R0, `rs_r0` y `nivel_aire` llegan vacíos. R0 es la resistencia del sensor en aire limpio, distinta en cada MQ-135, y se mide una vez por monitor.

## Condiciones

- **Quemado:** el sensor nuevo, o guardado por semanas, debe estar alimentado a 5 V de forma continua entre 24 y 48 h antes de medir.
- **Aire limpio:** junto a una ventana abierta o en un ambiente ventilado, sin personas cerca, sin alcohol, perfume, productos de limpieza, cocina ni humo.
- **Sensor estable:** el monitor encendido y publicando al menos 30 min seguidos antes de la ventana de medición; los primeros 3 min de cada encendido llegan como `null`.
- **Cableado:** VIN a 5 V, AOUT por el divisor 10 kΩ / 20 kΩ al GPIO 34 y GND común. El cálculo supone RL = 1 kΩ (resistencia marcada `102` en el módulo); si el módulo tiene `103` (10 kΩ), hay que corregir `RL_EF` en Node-RED y `MQ135_RL_KOHM` en el firmware antes de medir.
- Anotar la temperatura y la humedad del ambiente: el MQ-135 depende de ambas, y conviene medir en condiciones parecidas a las de uso.

## Procedimiento

1. Con el monitor en aire limpio y estable, dejarlo publicar al menos 10 min sin tocarlo.
2. En el servidor, desde `~/TeleMon`:
   ```bash
   ./pruebas/medir_r0.sh <MAC> 10
   ```
3. Aceptar la medición si: `encendido_h` ≥ 24 (o el quemado se hizo antes con el sensor alimentado), ~120 lecturas en 10 min, `variacion_pct` < 5 y `deriva_pct` entre −2 y 2. Si la deriva es mayor, el sensor todavía se está asentando: esperar y repetir.
4. Anotar el resultado en la tabla y cargar `r0_kohm` en la ficha del monitor (admin → Inventario → monitor → R0).
5. Comprobar que las lecturas siguientes traen `rs_r0` cercano a 1 y `nivel_aire = bueno` en aire limpio.

## Resultados

| MAC | Monitor | Fecha y hora | Encendido (h) | T / H ambiente | Lecturas | MQ-135 (V) | R0 (kΩ) | Variación | Deriva | Cargado |
|---|---|---|---|---|---|---|---|---|---|---|
| F8:B3:B7:2B:FC:24 | Aula 3 | 03/11 14:05–14:15 | 0,2 | ~30 °C / 10 % | 120 | 0,404 | 11,00 | 1,5 % | −0,7 % | No (prueba del script, sin quemado) |
