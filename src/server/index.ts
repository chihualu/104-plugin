import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import apiRoutes from './routes/api.routes';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Proxy for Rate Limiting
app.set('trust proxy', 1);

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

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on http://0.0.0.0:${PORT}`);
});
