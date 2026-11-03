export class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function ensure(value, code, message, status = 400) { if (!value) throw new AppError(code, message, status); }
export const copy = value => structuredClone(value);
export const identifier = () => crypto.randomUUID();
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value))))).map(x => x.toString(16).padStart(2, '0')).join('');
}
export function safeError(error) {
  return {ok:false, code:error instanceof AppError ? error.code : 'unavailable', error:error instanceof AppError ? error.message : 'Не удалось завершить запрос. Сохранённую работу можно проверить после восстановления связи.'};
}
