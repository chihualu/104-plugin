import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req.headers['x-request-id'] as string) || uuidv4(),
  // 不可再用 autoLogging.ignore: () => true —— 那會連 4xx/5xx 一起吞掉，
  // 被限流(429)/JWT 過期(401)擋下的請求在後台完全看不到，誤以為「API 沒進來」。
  // 成功請求的靜音交給下面的 customLogLevel 回傳 'silent'。
  // 只記必要欄位：預設序列化會帶整包 headers，Authorization(JWT)/Cookie 會落進 log。
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.originalUrl ?? req.url, ip: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customSuccessMessage: (req: any, res) => `${req.method} ${req.originalUrl} → ${res.statusCode}`,
  customErrorMessage: (req: any, res, err) => `${req.method} ${req.originalUrl} → ${res.statusCode} ${err.message}`,
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
