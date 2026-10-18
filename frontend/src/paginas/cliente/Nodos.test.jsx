import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dibujar } from '../../test/dibujar';
import Nodos from './Nodos';

const opciones = {
  ruta: '/ubicaciones/1/nodos',
  patron: '/ubicaciones/:ubicacionId/nodos',
  usuario: { nombre: 'Ana Rojas', rol: 'cliente', monitores: 7 },
};

async function cargar() {
  dibujar(<Nodos />, opciones);
  await screen.findByText('Patio');
}

async function editar() {
  await cargar();
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
}

describe('Nodos', () => {
  it('muestra cada nodo con su estado y el aviso de monitores reservados', async () => {
    await cargar();
    expect(screen.getByText(/nodos · \d+ en línea/)).toBeInTheDocument();
    expect(screen.getByText('En línea · 1 sensor sin respuesta')).toBeInTheDocument();
    expect(screen.getByText('En línea · 1 sensor sin calibrar')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByText(/Tienes 1 monitor reservado sin activar/)).toBeInTheDocument();
  });

  it('despliega los sensores de un nodo', async () => {
    await cargar();
    const patio = screen.getByText('Patio').closest('li');
    await userEvent.click(within(patio).getByRole('button', { name: /Mostrar más/ }));
    expect(within(patio).getByText('Sin respuesta')).toBeInTheDocument();
    expect(within(patio).getAllByText('Funcionando')).toHaveLength(3);
  });

  it('rechaza un código mal escrito o de otra cuenta', async () => {
    await editar();
    const codigo = screen.getByLabelText('Código de la etiqueta');
    await userEvent.type(codigo, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir nodo' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Código no válido');
    await userEvent.clear(codigo);
    await userEvent.type(codigo, 'm5ry2qfj');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir nodo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no está disponible para tu cuenta');
  });

  it('añade un nodo con el código de su etiqueta', async () => {
    await editar();
    await userEvent.type(screen.getByLabelText('Código de la etiqueta'), 'w3fj-7kta');
    await userEvent.type(screen.getAllByLabelText('Nombre del nodo')[0], 'Laboratorio');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir nodo' }));
    expect(await screen.findByDisplayValue('Laboratorio')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Esperando la primera lectura')).toBeInTheDocument();
  });

  it('mueve un nodo a otra ubicación y avisa', async () => {
    await editar();
    const fila = screen.getByDisplayValue('Biblioteca').closest('li');
    await userEvent.selectOptions(
      within(fila).getByLabelText('Mover a'),
      within(fila).getByRole('option', { name: /Vinto/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Biblioteca se movió a Vinto');
    expect(screen.queryByText('Biblioteca')).not.toBeInTheDocument();
  });

  it('guarda la frecuencia de actualización del panel', async () => {
    await cargar();
    await userEvent.selectOptions(screen.getByLabelText('Actualizar el panel cada'), '30');
    expect(localStorage.getItem('telemon.refresco')).toBe('30');
  });
});
