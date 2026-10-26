import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/cliente';
import { dibujar } from '../../test/dibujar';
import Ubicaciones from './Ubicaciones';

const usuario = { nombre: 'Ana Rojas', rol: 'cliente', monitores: 7 };

afterEach(() => vi.restoreAllMocks());

async function editar() {
  await screen.findByRole('link', { name: /Escuela Adela Zamudio/ });
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
}

describe('Ubicaciones', () => {
  it('muestra una tarjeta por ubicación con sus nodos y alertas', async () => {
    dibujar(<Ubicaciones />, { usuario });
    const escuela = await screen.findByRole('link', { name: /Escuela Adela Zamudio/ });
    expect(within(escuela).getByText('Punata')).toBeInTheDocument();
    expect(within(escuela).getByText('5 nodos · 4 en línea')).toBeInTheDocument();
    expect(within(escuela).getByText('3 alertas activas')).toBeInTheDocument();
    expect(escuela).toHaveAttribute('href', '/ubicaciones/1/panel');
    expect(screen.getByRole('link', { name: /Vivero San Agustín/ })).toHaveTextContent(
      '1 nodo · en línea',
    );
  });

  it('renombra una ubicación y vuelve a la vista normal', async () => {
    dibujar(<Ubicaciones />, { usuario });
    await editar();
    const nombre = screen.getAllByLabelText('Nombre de la ubicación')[2];
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Vivero Central');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('link', { name: /Vivero Central/ })).toBeInTheDocument();
  });

  it('añade una ubicación nueva', async () => {
    dibujar(<Ubicaciones />, { usuario });
    await editar();
    await userEvent.click(screen.getByRole('button', { name: 'Añadir ubicación' }));
    const nombres = screen.getAllByLabelText('Nombre de la ubicación');
    await userEvent.type(nombres[nombres.length - 1], 'Laboratorio de Química');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('link', { name: /Laboratorio de Química/ })).toHaveTextContent(
      'Sin nodos todavía',
    );
  });

  it('rechaza una ubicación nueva sin nombre y conserva el formulario', async () => {
    dibujar(<Ubicaciones />, { usuario });
    await editar();
    await userEvent.click(screen.getByRole('button', { name: 'Añadir ubicación' }));
    const nombres = screen.getAllByLabelText('Nombre de la ubicación');
    await userEvent.type(nombres[nombres.length - 1], '   ');
    const crear = vi.spyOn(api, 'post');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el nombre de cada ubicación.');
    expect(crear).not.toHaveBeenCalled();
    expect(nombres[nombres.length - 1]).toHaveValue('   ');
  });

  it('rechaza un nombre vacío al renombrar sin enviar cambios', async () => {
    dibujar(<Ubicaciones />, { usuario });
    await editar();
    await userEvent.clear(screen.getAllByLabelText('Nombre de la ubicación')[0]);
    const cambiar = vi.spyOn(api, 'patch');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el nombre de cada ubicación.');
    expect(cambiar).not.toHaveBeenCalled();
  });

  it('valida toda la lista antes de guardar cambios anteriores a un nombre vacío', async () => {
    dibujar(<Ubicaciones />, { usuario });
    await editar();
    await userEvent.type(screen.getAllByLabelText('Nombre de la ubicación')[0], ' Central');
    await userEvent.click(screen.getAllByRole('button', { name: 'Archivar' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Añadir ubicación' }));
    const nombres = screen.getAllByLabelText('Nombre de la ubicación');
    await userEvent.type(nombres[nombres.length - 1], '   ');
    const cambiar = vi.spyOn(api, 'patch');
    const crear = vi.spyOn(api, 'post');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el nombre de cada ubicación.');
    expect(cambiar).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it('archiva en lugar de borrar y avisa que el historial se conserva', async () => {
    dibujar(<Ubicaciones />, { usuario });
    await editar();
    await userEvent.click(screen.getAllByRole('button', { name: 'Archivar' })[1]);
    expect(screen.getByText('Se archivará al guardar.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Su historial se conserva.');
    expect(screen.queryByRole('link', { name: /Escuela Avaroa/ })).not.toBeInTheDocument();
  });

  it('cancelar descarta los cambios', async () => {
    dibujar(<Ubicaciones />, { usuario });
    await editar();
    const nombre = screen.getAllByLabelText('Nombre de la ubicación')[0];
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Otra');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('link', { name: /Escuela Adela Zamudio/ })).toBeInTheDocument();
  });
});
