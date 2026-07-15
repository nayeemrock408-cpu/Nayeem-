// Admit Card Portal — backend
// Zero external dependencies: runs on plain Node.js (http, fs, crypto, path, url).
// Start with:  node server.js
// Then open:   http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const DEFAULT_ADMIN_CODE = 'admin123';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

// ---------- tiny JSON file "database" ----------
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

function ensureAdminSeed() {
  if (!fs.existsSync(ADMIN_FILE)) {
    const { salt, hash } = hashPassword(DEFAULT_ADMIN_CODE);
    writeJSON(ADMIN_FILE, { salt, hash });
    console.log('Created default admin access code: ' + DEFAULT_ADMIN_CODE + '  (change it in data/admin.json or via the admin panel)');
  }
}
function ensureStudentsSeed() {
  if (!fs.existsSync(STUDENTS_FILE)) {
    writeJSON(STUDENTS_FILE, []);
  }
}

// ---------- in-memory session tokens ----------
const sessions = new Map(); // token -> expiry timestamp

function issueToken() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}
function isValidToken(token) {
  if (!token || !sessions.has(token)) return false;
  const expiry = sessions.get(token);
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}
function getBearerToken(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

// ---------- request helpers ----------
function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', c => {
      chunks += c;
      if (chunks.length > 1e6) req.destroy(); // 1MB guard
    });
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  // prevent path traversal outside the public dir
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- validation ----------
function validateStudentPayload(body) {
  const required = ['roll', 'dob', 'name', 'course', 'semester', 'centre'];
  for (const field of required) {
    if (!body[field] || typeof body[field] !== 'string' || !body[field].trim()) {
      return 'Missing or empty field: ' + field;
    }
  }
  if (!Array.isArray(body.subjects) || body.subjects.length === 0) {
    return 'At least one subject is required';
  }
  for (const s of body.subjects) {
    if (!s.name || !s.date || !s.time) {
      return 'Each subject needs a name, date, and time';
    }
  }
  return null;
}

// ---------- routes ----------
async function handleApi(req, res, pathname) {
  const students = readJSON(STUDENTS_FILE, []);

  // Public: look up a single admit card by roll + dob
  if (pathname === '/api/find-admit-card' && req.method === 'POST') {
    const body = await readBody(req);
    const roll = (body.roll || '').trim().toLowerCase();
    const dob = (body.dob || '').trim();
    const match = students.find(s => s.roll.toLowerCase() === roll && s.dob === dob);
    if (!match) return sendJSON(res, 404, { error: 'No admit card found for that roll number and date of birth.' });
    return sendJSON(res, 200, match);
  }

  // Admin login
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const body = await readBody(req);
    const admin = readJSON(ADMIN_FILE, null);
    if (!admin || !body.code || !verifyPassword(body.code, admin.salt, admin.hash)) {
      return sendJSON(res, 401, { error: 'Incorrect access code.' });
    }
    return sendJSON(res, 200, { token: issueToken() });
  }

  // Everything below requires a valid admin session
  if (pathname.startsWith('/api/admin/')) {
    const token = getBearerToken(req);
    if (!isValidToken(token)) {
      return sendJSON(res, 401, { error: 'Session expired or invalid. Log in again.' });
    }

    if (pathname === '/api/admin/students' && req.method === 'GET') {
      return sendJSON(res, 200, students);
    }

    if (pathname === '/api/admin/students' && req.method === 'POST') {
      const body = await readBody(req);
      const err = validateStudentPayload(body);
      if (err) return sendJSON(res, 400, { error: err });
      const roll = body.roll.trim();
      if (students.some(s => s.roll.toLowerCase() === roll.toLowerCase())) {
        return sendJSON(res, 409, { error: 'A record with this roll number already exists.' });
      }
      const record = {
        roll,
        dob: body.dob.trim(),
        name: body.name.trim(),
        course: body.course.trim(),
        semester: body.semester.trim(),
        centre: body.centre.trim(),
        subjects: body.subjects.map(s => ({ name: s.name.trim(), date: s.date.trim(), time: s.time.trim() }))
      };
      students.push(record);
      writeJSON(STUDENTS_FILE, students);
      return sendJSON(res, 201, record);
    }

    const deleteMatch = pathname.match(/^\/api\/admin\/students\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const roll = decodeURIComponent(deleteMatch[1]).toLowerCase();
      const idx = students.findIndex(s => s.roll.toLowerCase() === roll);
      if (idx === -1) return sendJSON(res, 404, { error: 'Record not found.' });
      students.splice(idx, 1);
      writeJSON(STUDENTS_FILE, students);
      return sendJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/change-code' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.newCode || body.newCode.length < 6) {
        return sendJSON(res, 400, { error: 'New access code must be at least 6 characters.' });
      }
      const { salt, hash } = hashPassword(body.newCode);
      writeJSON(ADMIN_FILE, { salt, hash });
      return sendJSON(res, 200, { ok: true });
    }
  }

  return sendJSON(res, 404, { error: 'Not found' });
}

ensureAdminSeed();
ensureStudentsSeed();

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname);
    } catch (err) {
      sendJSON(res, 400, { error: err.message || 'Bad request' });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log('Admit Card Portal running at http://localhost:' + PORT);
});
