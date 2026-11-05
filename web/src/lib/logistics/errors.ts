export class LogisticsError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
