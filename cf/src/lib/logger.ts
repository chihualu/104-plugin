/**
 * 極簡結構化 logger（取代 pino）。Workers 的 console.* 會出現在 `wrangler tail`。
 * 用法相容原 pino：logger.info({ msg, ... }) 或 logger.info('text')。
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, payload: Record<string, unknown> | string, msg?: string) {
  const record =
    typeof payload === 'string'
      ? { level, msg: payload }
      : { level, ...(msg ? { msg } : {}), ...payload };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (p: Record<string, unknown> | string, msg?: string) => emit('debug', p, msg),
  info: (p: Record<string, unknown> | string, msg?: string) => emit('info', p, msg),
  warn: (p: Record<string, unknown> | string, msg?: string) => emit('warn', p, msg),
  error: (p: Record<string, unknown> | string, msg?: string) => emit('error', p, msg),
};
