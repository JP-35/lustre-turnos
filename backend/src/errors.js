// R26: todo error de negocio tiene status, código estable y mensaje en español.
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status, code, message) => new AppError(status, code, message);
