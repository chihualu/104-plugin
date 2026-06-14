import type { Env } from './env';
import type { JwtPayload } from './lib/jwt';

/** Hono 應用的型別環境：Bindings = Worker env，Variables.user = JWT payload。 */
export type AppEnv = {
  Bindings: Env;
  Variables: { user: JwtPayload };
};
