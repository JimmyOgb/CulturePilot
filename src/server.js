import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, validateConfig, redactSecrets } from './config.js';
import { defaultCulturePipeline } from './pipeline/intent-pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

/**
 * Read request body safely with size limit
 */
export function readJsonBody(req, maxBytes = 1048576) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (err) {
      return Promise.reject(new Error('Invalid JSON format: ' + err.message));
    }
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let bytesReceived = 0;

    req.on('data', (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        reject(new Error('Request payload exceeds maximum size limit (1MB).'));
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON format: ' + err.message));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

/**
 * Send JSON response with secret redaction
 */
export function sendJsonResponse(res, statusCode, data) {
  const safeData = redactSecrets(data);
  const jsonString = JSON.stringify(safeData, null, 2);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(jsonString);
}

/**
 * Serve static frontend files
 */
export function serveStaticFile(req, res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
}

/**
 * Health check request handler
 */
export function handleHealthRequest(req, res) {
  const configStatus = validateConfig();
  sendJsonResponse(res, 200, {
    status: configStatus.valid ? 'ok' : 'degraded',
    service: 'CulturePilot Cultural Intelligence API',
    mode: 'configuration_verified',
    qloo_configured: configStatus.configured.hasKey,
    base_url: configStatus.configured.baseUrl,
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString()
  });
}

/**
 * Cultural Discovery API request handler
 */
export async function handleCultureRequest(req, res, pipeline = defaultCulturePipeline) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJsonResponse(res, 405, {
      status: 'error',
      message: `Method ${req.method} not allowed. Use POST.`
    });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await pipeline.process(body);
    const httpStatus = result.status === 'error' && !result.results?.length ? 500 : 200;
    sendJsonResponse(res, httpStatus, result);
  } catch (err) {
    sendJsonResponse(res, 400, {
      status: 'error',
      message: redactSecrets(err.message),
      results: [],
      connections: [],
      provenance: [],
      warnings: ['Failed to process request body.']
    });
  }
}

export function createServer(pipeline = defaultCulturePipeline) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    // Health check endpoint
    if (pathname === '/api/health' || pathname === '/health') {
      handleHealthRequest(req, res);
      return;
    }

    // Cultural Discovery API
    if (pathname === '/api/culture') {
      await handleCultureRequest(req, res, pipeline);
      return;
    }

    // Static Frontend Serving
    if (method === 'GET') {
      if (pathname === '/' || pathname === '/index.html') {
        const indexPath = path.join(FRONTEND_DIR, 'index.html');
        serveStaticFile(req, res, indexPath, 'text/html; charset=utf-8');
        return;
      }
    }

    // Fallback 404
    sendJsonResponse(res, 404, {
      status: 'error',
      message: `Route not found: ${method} ${pathname}`
    });
  });
}

// Start standalone server if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  const PORT = config.port;

  server.listen(PORT, () => {
    console.log(`[CulturePilot] Server running at http://localhost:${PORT}`);
    console.log(`[CulturePilot] Frontend available at http://localhost:${PORT}/`);
    console.log(`[CulturePilot] API available at POST http://localhost:${PORT}/api/culture`);
  });

  const shutdown = () => {
    console.log('[CulturePilot] Shutting down gracefully...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const defaultServerInstance = createServer();
export default function handler(req, res) {
  defaultServerInstance.emit('request', req, res);
}
