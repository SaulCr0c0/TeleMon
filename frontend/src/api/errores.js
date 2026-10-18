export class ErrorApi extends Error {
  constructor(estado, mensaje, datos) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.datos = datos;
  }
}
