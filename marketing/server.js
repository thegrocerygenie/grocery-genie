#!/usr/bin/env node
// Standalone Node http server for local dev and self-hosted deploys.
// Serves the static site from this directory and dispatches /api/waitlist to the handler.
//
// Usage:
//   PORT=3000 RESEND_API_KEY=re_... RESEND_AUDIENCE_ID=... node server.js
//   npm run dev   (with nodemon-style auto-reload via --watch)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleWaitlistJoin } from './api/_handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function safePath(urlPath) {
  // Decode and strip query/hash, then resolve and confirm we stay inside ROOT.
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  let p = normalize(decoded.replace(/^\/+/, ''));
  if (p === '' || p === '.') p = 'index.html';
  const full = resolve(ROOT, p);
  if (!full.startsWith(ROOT + sep) && full !== ROOT) return null;
  return full;
}

async function serveStatic(req, res) {
  let target = safePath(req.url || '/');
  if (!target) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  let stats;
  try { stats = await stat(target); } catch { stats = null; }

  if (stats && stats.isDirectory()) {
    target = join(target, 'index.html');
    try { stats = await stat(target); } catch { stats = null; }
  }

  if (!stats || !stats.isFile()) {
    // Try serving the SPA root for unknown paths (so /privacy etc. fall through to 404).
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><meta charset="utf-8"><title>404</title><h1>Not found</h1>');
  }

  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
  const data = await readFile(target);
  const headers = {
    'Content-Type': type,
    'Content-Length': data.length,
    'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  res.writeHead(200, headers);
  res.end(data);
}

async function readJsonBody(req, limit = 4096) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try { resolveBody(raw ? JSON.parse(raw) : {}); }
      catch { resolveBody({}); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'browsing-topics=()');

  if (req.url === '/api/waitlist') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
    let body;
    try { body = await readJsonBody(req); }
    catch { body = {}; }

    const result = await handleWaitlistJoin(
      {
        email: body?.email,
        source: body?.source,
        path: body?.path,
        referrer: body?.referrer,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
      process.env,
    );
    res.writeHead(result.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    });
    return res.end(JSON.stringify(result.body));
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`grocery-genie marketing — http://localhost:${PORT}`);
});
