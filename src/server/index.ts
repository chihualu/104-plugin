import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import path from 'path';
import apiRoutes from './routes/api.routes';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { logger } from './utils/logger';
import { SchedulerService } from './services/scheduler.service';
import { LineBotService } from './services/lineBot.service';
import { WebhookController } from './controllers/webhook.controller';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Proxy for Rate Limiting
app.set('trust proxy', 1);

// Security Headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://static.line-scdn.net", "https://*.line.me", "https://static.cloudflareinsights.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"], // Leaflet CSS
      imgSrc: ["'self'", "data:", "https://*.line-scdn.net", "https://*.openstreetmap.org", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "https://*.line.me", "https://*.openstreetmap.org", "https://liffsdk.line-scdn.net"], // OpenStreetMap for GPS check
      frameSrc: ["'self'", "https://static.line-scdn.net"], 
    },
  },
}));

// Webhook Route (Must be before global body-parser)
app.post('/callback', 
  express.json({ 
    verify: (req: any, res, buf) => { req.rawBody = buf.toString(); } 
  }), 
  WebhookController.handleWebhook
);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(requestLogger);

// Static Files
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// API Routes
app.use('/api', apiRoutes);

// SPA Fallback
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Global Error Handler
app.use(errorHandler);

// Initialize Scheduler
SchedulerService.init();
LineBotService.setToken(process.env.LINE_CHANNEL_ACCESS_TOKEN);

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on http://0.0.0.0:${PORT}`);
});
