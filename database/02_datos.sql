INSERT INTO roles (id, nombre) VALUES (1, 'admin_plataforma'), (2, 'cliente');

INSERT INTO clientes (id, nombre, email_contacto, origen, creado_en) VALUES
  (1, 'Red Escolar Valle Alto', 'direccion@redvallealto.edu.bo', 'registro', '2026-10-12 10:00-04'),
  (2, 'Vivero Los Andes', 'contacto@viveroandes.com', 'admin', '2026-10-03 10:00-04');

INSERT INTO ubicaciones (id, cliente_id, localidad, nombre) VALUES
  (1, 1, 'Punata', 'Escuela Adela Zamudio'),
  (2, 1, 'Vinto', 'Salón de maestros, Escuela Avaroa'),
  (3, 2, 'Chapare', 'Vivero San Agustín');

INSERT INTO dispositivos (id, mac_address, codigo, cliente_id, ubicacion_id, nombre, estado, asignado_en) VALUES
  (1, 'F8:B3:B7:2B:FC:24', 'H7QD-4MXA', 1, 1, 'Aula 3', 'en_uso', now()),
  (2, '24:6F:28:B1:07:5A', 'W3FJ-7KTA', 1, NULL, NULL, 'reservado', NULL),
  (3, '7C:9E:BD:3A:44:E8', 'M5RY-2QFJ', NULL, NULL, NULL, 'disponible', NULL);

INSERT INTO eventos_dispositivo (dispositivo_id, texto) VALUES
  (1, 'Registrado con el código H7QD-4MXA'),
  (1, 'Reservado para Red Escolar Valle Alto'),
  (1, 'Activado por el cliente como «Aula 3»'),
  (2, 'Registrado con el código W3FJ-7KTA'),
  (2, 'Reservado para Red Escolar Valle Alto'),
  (3, 'Registrado con el código M5RY-2QFJ');

INSERT INTO umbrales (ubicacion_id, variable, valor_min, valor_max, activo)
SELECT u.id, v.variable, v.valor_min, v.valor_max, v.activo
FROM ubicaciones u
CROSS JOIN (VALUES
  ('temperatura', 18, 28, true),
  ('humedad', 30, 60, true),
  ('presion', 740, 760, false),
  ('calidad_aire', 0.5, NULL, true)
) AS v (variable, valor_min, valor_max, activo);

SELECT setval('roles_id_seq', (SELECT max(id) FROM roles));
SELECT setval('clientes_id_seq', (SELECT max(id) FROM clientes));
SELECT setval('ubicaciones_id_seq', (SELECT max(id) FROM ubicaciones));
SELECT setval('dispositivos_id_seq', (SELECT max(id) FROM dispositivos));
