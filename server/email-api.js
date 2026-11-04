import { createServer } from 'node:http';
import { handleReportEmail } from './reportEmail.js';

const allowedOrigins = new Set(
  (process.env.REPORT_EMAIL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const port = Number(process.env.REPORT_EMAIL_PORT || 3001);

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  } else if (origin) {
    response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'This web origin is not allowed to send email.' }));
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.url !== '/api/reports/email') {
    response.writeHead(404);
    response.end();
    return;
  }
  void handleReportEmail(request, response);
});

server.listen(port, () => {
  console.log(`NutriGrid report email API listening on port ${port}`);
});
