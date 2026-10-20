INSERT INTO usuarios (rol_id, cliente_id, nombre, email, password_hash) VALUES
  (1, NULL, 'Equipo TeleMon', 'admin@telemon.bo', '$2b$10$mPy/XEFW.FCUa42mig1GcOqxepSEXiQcJmGwr7f7L3vRujlqhFKq2'),
  (2, 1, 'Ana Rojas', 'direccion@redvallealto.edu.bo', '$2b$10$.Kg7qfDpz6YNjP8VRCX5YeYaFJYuxyNMoJchn.VKTgxxoKBxIjgDC')
ON CONFLICT (email) DO NOTHING;
