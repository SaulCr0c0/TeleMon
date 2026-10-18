import { Navigate, Route, Routes } from 'react-router-dom';
import { SesionProvider } from './sesion/SesionContext';
import RutaProtegida from './sesion/RutaProtegida';
import LayoutAcceso from './componentes/layout/LayoutAcceso';
import LayoutCliente from './componentes/layout/LayoutCliente';
import LayoutAdmin from './componentes/layout/LayoutAdmin';
import Login from './paginas/acceso/Login';
import CrearCuenta from './paginas/acceso/CrearCuenta';
import Bienvenida from './paginas/acceso/Bienvenida';
import CrearClave from './paginas/acceso/CrearClave';
import Ubicaciones from './paginas/cliente/Ubicaciones';
import Panel from './paginas/cliente/Panel';
import Graficas from './paginas/cliente/Graficas';
import Alertas from './paginas/cliente/Alertas';
import Nodos from './paginas/cliente/Nodos';
import Historial from './paginas/cliente/Historial';
import Umbrales from './paginas/cliente/Umbrales';
import MiCuenta from './paginas/cliente/MiCuenta';
import Clientes from './paginas/admin/Clientes';
import ClienteFicha from './paginas/admin/ClienteFicha';
import Inventario from './paginas/admin/Inventario';
import MonitorFicha from './paginas/admin/MonitorFicha';
import NoEncontrada from './paginas/NoEncontrada';

export default function App() {
  return (
    <SesionProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route element={<LayoutAcceso />}>
          <Route path="/crear-cuenta" element={<CrearCuenta />} />
        </Route>

        <Route element={<RutaProtegida rol="cliente" />}>
          <Route element={<LayoutAcceso />}>
            <Route path="/bienvenida" element={<Bienvenida />} />
            <Route path="/crear-clave" element={<CrearClave />} />
          </Route>
          <Route element={<LayoutCliente />}>
            <Route path="/ubicaciones" element={<Ubicaciones />} />
            <Route path="/cuenta" element={<MiCuenta />} />
            <Route path="/ubicaciones/:ubicacionId">
              <Route index element={<Navigate to="panel" replace />} />
              <Route path="panel" element={<Panel />} />
              <Route path="graficas" element={<Graficas />} />
              <Route path="alertas" element={<Alertas />} />
              <Route path="nodos" element={<Nodos />} />
              <Route path="historial" element={<Historial />} />
              <Route path="umbrales" element={<Umbrales />} />
            </Route>
          </Route>
        </Route>

        <Route element={<RutaProtegida rol="admin" />}>
          <Route element={<LayoutAdmin />}>
            <Route path="/admin" element={<Navigate to="/admin/clientes" replace />} />
            <Route path="/admin/clientes" element={<Clientes />} />
            <Route path="/admin/clientes/:clienteId" element={<ClienteFicha />} />
            <Route path="/admin/inventario" element={<Inventario />} />
            <Route path="/admin/inventario/:dispositivoId" element={<MonitorFicha />} />
          </Route>
        </Route>

        <Route path="*" element={<NoEncontrada />} />
      </Routes>
    </SesionProvider>
  );
}
