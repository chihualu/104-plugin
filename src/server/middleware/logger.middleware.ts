import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req.headers['x-request-id'] as string) || uuidv4(),
  autoLogging: {
    ignore: () => true, // Disable automatic successful logging
  },
  customSuccessMessage: (req, _res) => `Request successful: ${req.method} ${req.url}`,
  customErrorMessage: (req, _res, _err) => `Request failed: ${req.method} ${req.url}`,
  // Only log if status code >= 400 or there is an error
  customProps: (_req, _res) => ({
    // custom props
  }),
  // Use custom level logic
  customLogLevel: function (_req, res, err) {
    if (res.statusCode >= 400 || err) {
      return 'error';
    }
    return 'silent'; // Skip 200/300
  },
});
