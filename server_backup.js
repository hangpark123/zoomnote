// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const multer = require('multer'); 
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const htmlPdf = require('html-pdf');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// [설정] Multer (파일 업로드) - 메모리 저장
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }, // 50MB 제한, 최대 10개
});

// [조건부 업로드 미들웨어]
const conditionalUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    upload.array('attachments', 10)(req, res, (err) => {
      if (err) return res.status(400).json({ error: '파일 업로드 에러: ' + err.message });
      next();
    });
  } else {
    next();
  }
};

// [헬퍼] 날짜 변환
function toDateStringSafe(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateTimeMinuteStringSafe(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

// ===== DB Connection =====
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zoomnote',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ===== Middleware =====
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use((req, res, next) => {
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  next();
});
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https://appssdk.zoom.us; img-src * data: blob:; media-src *; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://appssdk.zoom.us; connect-src *; frame-ancestors 'self' https://*.zoom.us https://*.ngrok-free.app;"
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json());
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

// 클라이언트에서 전달한 디버그 로그를 서버 콘솔에 남김
app.post('/api/client-log', (req, res) => {
  const { message, context } = req.body || {};
  res.json({ ok: true });
});

// ===== Cookie / Session helpers =====
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx === -1) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  else parts.push('Path=/');
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; Max-Age=0`);
}

function logEvent(label, payload = {}) {
  // logging disabled per request
}

const SESSIONS = new Map();
function randomSid() {
  return 'zn_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.zn_sid;
  if (!sid) return null;
  return SESSIONS.get(sid) || null;
}

const FONT_PRIMARY_PATH = path.join(__dirname, 'fonts', 'NotoSansKR-Regular.ttf');
const FONT_SECONDARY_PATH = path.join(__dirname, 'fonts', 'NotoSansKR-Medium.ttf');
const FONT_NAME = 'KRFont';
let cachedFontCss = null;
const DOC_TITLE = '아이알링크(주) 정보통신연구소 연구노트';

function getFontCss() {
  if (cachedFontCss !== null) return cachedFontCss;
  let css = 'body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif; }';
  try {
    const fontPath = fs.existsSync(FONT_PRIMARY_PATH)
      ? FONT_PRIMARY_PATH
      : (fs.existsSync(FONT_SECONDARY_PATH) ? FONT_SECONDARY_PATH : null);
    if (fontPath) {
      const fontData = fs.readFileSync(fontPath).toString('base64');
      const ext = path.extname(fontPath).toLowerCase();
      const mime = ext === '.otf' ? 'font/otf' : 'font/ttf';
      css = `
        @font-face {
          font-family: '${FONT_NAME}';
          src: url(data:${mime};base64,${fontData}) format('truetype');
          font-weight: normal;
          font-style: normal;
        }
        body { font-family: '${FONT_NAME}', "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif; }
      `;
    }
  } catch (e) {
    // fallback to default css
  }
  cachedFontCss = css;
  return css;
}

// ===== Zoom identity helpers (복호화 로직 포함) =====
function decodeAppContext(headerValue) {
  if (!headerValue) return null;
  const tryJsonParse = (txt) => { try { return JSON.parse(txt); } catch (err) { return null; } };
  const direct = tryJsonParse(headerValue);
  if (direct) return direct;
  const normalizeB64 = (str) => {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    return s;
  };
  try {
    const b64 = normalizeB64(headerValue);
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const parsed = tryJsonParse(json);
    if (parsed) return parsed;
  } catch (e) {}
  return null;
}

function decodeInnerContext(raw) {
  if (!raw) return null;
  const str = String(raw);
  try {
    const parts = str.split('.');
    if (parts.length === 3) {
      const payload = Buffer.from(parts[1], 'base64').toString('utf8');
      return JSON.parse(payload);
    }
  } catch (e) {}
  const tryParseJsonFromB64 = (txt) => {
    try {
      const norm = txt.replace(/-/g, '+').replace(/_/g, '/');
      const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
      const buf = Buffer.from(padded, 'base64');
      const s = buf.toString('utf8');
      return JSON.parse(s);
    } catch (e) { return null; }
  };
  const direct = tryParseJsonFromB64(str);
  if (direct) return direct;
  try {
    const norm = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
    const buf = Buffer.from(padded, 'base64');
    const zlib = require('zlib');
    const inflated = zlib.inflateRawSync(buf).toString('utf8');
    return JSON.parse(inflated);
  } catch (e) {}
  return null;
}

function unpackZoomAppContext(ctxB64) {
  let buf = Buffer.from(String(ctxB64 || ''), 'base64');
  if (!buf.length) throw new Error('empty ctx');
  const ivLength = buf.readUInt8(0);
  buf = buf.subarray(1);
  const iv = buf.subarray(0, ivLength);
  buf = buf.subarray(ivLength);
  const aadLength = buf.readUInt16LE(0);
  buf = buf.subarray(2);
  const aad = buf.subarray(0, aadLength);
  buf = buf.subarray(aadLength);
  const cipherLength = buf.readInt32LE(0);
  buf = buf.subarray(4);
  const cipherText = buf.subarray(0, cipherLength);
  const tag = buf.subarray(cipherLength);
  return { iv, aad, cipherText, tag };
}

function decryptZoomAppContext(ctxToken, clientSecret) {
  if (!ctxToken || !clientSecret) return null;
  const { iv, aad, cipherText, tag } = unpackZoomAppContext(ctxToken);
  if (!tag || tag.length !== 16) throw new Error(`invalid auth tag length: ${tag?.length}`);
  const key = crypto.createHash('sha256').update(String(clientSecret), 'utf8').digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function decodeZoomAppContextFromHeader(headerValue) {
  if (!headerValue) return {};
  const parsed = decodeAppContext(headerValue);
  if (parsed && typeof parsed === 'object') {
    return parsed;
  }
  try {
    const dec = decryptZoomAppContext(headerValue, process.env.ZOOM_CLIENT_SECRET);
    if (dec) return dec;
  } catch (e) {}
  return {};
}

function extractZoomIdentifiers(req) {
  const ctxHeader = req.headers['x-zoom-app-context'] || req.headers['x-zoom-app-context-b64'];
  let decodedCtx = decodeZoomAppContextFromHeader(ctxHeader) || {};
  if (decodedCtx && decodedCtx.context && !decodedCtx.uid && !decodedCtx.userId) {
    const inner = decodeInnerContext(decodedCtx.context);
    if (inner) decodedCtx = { ...decodedCtx, ...inner };
  }
  const query = req.query || {};
  const zoomUserId =
    query.zoomUserId ||
    decodedCtx?.uid ||
    decodedCtx?.userId ||
    decodedCtx?.user_id ||
    decodedCtx?.userUUID ||
    decodedCtx?.id ||
    decodedCtx?.creatorId ||
    decodedCtx?.participantId ||
    decodedCtx?.participantUUID ||
    null;
  const zoomEmail =
    query.zoomEmail ||
    decodedCtx?.email ||
    decodedCtx?.userEmail ||
    decodedCtx?.user_email ||
    decodedCtx?.emailAddress ||
    null;
  const zoomAccountId =
    query.zoomAccountId ||
    decodedCtx?.accountId ||
    decodedCtx?.account_id ||
    decodedCtx?.aid ||
    decodedCtx?.acctId ||
    decodedCtx?.zoom_account_id ||
    null;
  extractZoomIdentifiers._lastDecoded = decodedCtx;
  return { zoomUserId, zoomEmail, zoomAccountId, appContextRaw: decodedCtx };
}
extractZoomIdentifiers._lastDecoded = null;

async function findUserByZoom({ zoomUserId, zoomEmail }) {
  const baseSelect = `
    SELECT u.zoom_user_id, u.zoom_account_id, u.email, u.name, u.job_title, u.signature_data, u.signature_type, u.signature_updated_at, u.role, u.department_id, d.name AS department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE __COND__
    LIMIT 1
  `;
  if (zoomUserId) {
    const [rows] = await pool.query(baseSelect.replace('__COND__', 'u.zoom_user_id = ?'), [zoomUserId]);
    if (rows.length) return rows[0];
  }
  if (zoomEmail) {
    const [rows] = await pool.query(baseSelect.replace('__COND__', 'u.email = ?'), [zoomEmail]);
    if (rows.length) return rows[0];
  }
  return null;
}

async function upsertUserFromZoom(zoomUser) {
  const conn = await pool.getConnection();
  try {
    const existing = await findUserByZoom({ zoomUserId: zoomUser.id, zoomEmail: zoomUser.email });
    const deptName = zoomUser.dept || zoomUser.department || null;
    let deptId = existing?.department_id || null;
    if (deptName) {
      await conn.query('INSERT IGNORE INTO departments (name) VALUES (?)', [deptName]);
      const [drows] = await conn.query('SELECT id FROM departments WHERE name = ? LIMIT 1', [deptName]);
      deptId = drows[0]?.id || null;
    }
    const fullName = [zoomUser.first_name, zoomUser.last_name].filter(Boolean).join(' ').trim();
    const name = zoomUser.display_name || zoomUser.name || fullName || existing?.name || zoomUser.email || zoomUser.id || 'Unknown';
    let jobTitle = existing?.job_title || null;
    const hasJobTitleField =
      Object.prototype.hasOwnProperty.call(zoomUser, 'job_title') ||
      Object.prototype.hasOwnProperty.call(zoomUser, 'jobTitle') ||
      Object.prototype.hasOwnProperty.call(zoomUser, 'title');
    if (hasJobTitleField) {
      const raw = zoomUser.job_title ?? zoomUser.jobTitle ?? zoomUser.title;
      const trimmed = raw == null ? '' : String(raw).trim();
      jobTitle = trimmed ? trimmed.slice(0, 191) : null;
    }
    const safeEmail = zoomUser.email || existing?.email || `${zoomUser.id || 'unknown'}@zoom.local`;
    const accountId = zoomUser.account_id || zoomUser.zoom_account_id || existing?.zoom_account_id || '';
    const role = existing?.role || 'staff';
    await conn.query(
      `INSERT INTO users (zoom_user_id, zoom_account_id, email, name, job_title, department_id, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        zoom_account_id = VALUES(zoom_account_id), 
        email = VALUES(email), 
        name = VALUES(name), 
        job_title = VALUES(job_title), 
        department_id = VALUES(department_id),
        role = COALESCE(users.role, VALUES(role))`,
      [zoomUser.id, accountId, safeEmail, name, jobTitle, deptId, role]
    );
    return await findUserByZoom({ zoomUserId: zoomUser.id, zoomEmail: zoomUser.email });
  } finally {
    conn.release();
  }
}

function buildAuthorizeUrl() {
  const clientId = getZoomOauthClientId();
  const redirectUri = getZoomOauthRedirectUri();
  if (!clientId || !redirectUri) throw new Error('Missing ZOOM_CLIENT_ID_OAUTH/ZOOM_CLIENT_SECRET_OAUTH (or ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET) and ZOOM_REDIRECT_URI');
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri });
  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const clientId = getZoomOauthClientId();
  const clientSecret = getZoomOauthClientSecret();
  const redirectUri = getZoomOauthRedirectUri();
  const res = await require('axios').post('https://zoom.us/oauth/token', null, {
    params: { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
    auth: { username: clientId, password: clientSecret },
  });
  return res.data;
}

async function zoomGetMe(accessToken) {
  const res = await require('axios').get('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

// ===== Zoom API Token helpers (OAuth / Server-to-Server) =====
const ZOOM_TOKEN_SKEW_MS = 60 * 1000;
let zoomS2STokenCache = { accessToken: null, expiresAtMs: 0, accountId: null };

function getZoomOauthClientId() {
  return (
    process.env.ZOOM_CLIENT_ID_OAUTH ||
    process.env.ZOOM_CLIENT_ID_OAuth ||
    process.env.ZOOM_OAUTH_CLIENT_ID ||
    process.env.ZOOM_CLIENT_ID ||
    null
  );
}

function getZoomOauthClientSecret() {
  return (
    process.env.ZOOM_CLIENT_SECRET_OAUTH ||
    process.env.ZOOM_CLIENT_SECRET_OAuth ||
    process.env.ZOOM_OAUTH_CLIENT_SECRET ||
    process.env.ZOOM_CLIENT_SECRET ||
    null
  );
}

function getZoomOauthRedirectUri() {
  return process.env.ZOOM_OAUTH_REDIRECT_URI || process.env.ZOOM_REDIRECT_URI || null;
}

async function ensureZoomOauthTokenTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zoom_oauth_tokens (
      id INT PRIMARY KEY,
      access_token TEXT NULL,
      refresh_token TEXT NULL,
      expires_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function saveZoomOauthTokenToDb(token) {
  if (!token || !token.access_token) return;
  await ensureZoomOauthTokenTable();
  const expiresInSec = Number(token.expires_in) || 0;
  const expiresAtMs = Date.now() + Math.max(0, expiresInSec - 60) * 1000;
  const expiresAt = new Date(expiresAtMs);
  const refreshToken = token.refresh_token || null;
  await pool.query(
    `INSERT INTO zoom_oauth_tokens (id, access_token, refresh_token, expires_at)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       access_token = VALUES(access_token),
       refresh_token = COALESCE(VALUES(refresh_token), zoom_oauth_tokens.refresh_token),
       expires_at = VALUES(expires_at)`,
    [token.access_token, refreshToken, expiresAt]
  );
}

async function getZoomOauthTokenFromDb() {
  await ensureZoomOauthTokenTable();
  const [rows] = await pool.query('SELECT access_token, refresh_token, expires_at FROM zoom_oauth_tokens WHERE id = 1 LIMIT 1');
  return rows[0] || null;
}

async function refreshZoomOauthToken(refreshToken) {
  const clientId = getZoomOauthClientId();
  const clientSecret = getZoomOauthClientSecret();
  if (!clientId || !clientSecret) throw new Error('Missing ZOOM_CLIENT_ID_OAUTH/ZOOM_CLIENT_SECRET_OAUTH (or ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET)');
  if (!refreshToken) throw new Error('Missing refresh_token');
  const res = await require('axios').post('https://zoom.us/oauth/token', null, {
    params: { grant_type: 'refresh_token', refresh_token: refreshToken },
    auth: { username: clientId, password: clientSecret },
  });
  return res.data;
}

async function getServerToServerAccessToken(accountIdOverride) {
  const clientId = getZoomOauthClientId();
  const clientSecret = getZoomOauthClientSecret();
  const accountId = process.env.ZOOM_ACCOUNT_ID || accountIdOverride || null;
  if (!clientId || !clientSecret || !accountId) return null;

  const now = Date.now();
  if (
    zoomS2STokenCache.accessToken &&
    zoomS2STokenCache.accountId === accountId &&
    zoomS2STokenCache.expiresAtMs - ZOOM_TOKEN_SKEW_MS > now
  ) {
    return zoomS2STokenCache.accessToken;
  }

  try {
    const res = await require('axios').post('https://zoom.us/oauth/token', null, {
      params: { grant_type: 'account_credentials', account_id: accountId },
      auth: { username: clientId, password: clientSecret },
    });

    const accessToken = res.data?.access_token || null;
    const expiresInSec = Number(res.data?.expires_in) || 0;
    if (!accessToken) return null;
    zoomS2STokenCache = {
      accessToken,
      expiresAtMs: now + Math.max(0, expiresInSec - 60) * 1000,
      accountId,
    };
    return accessToken;
  } catch (e) {
    console.error('Zoom S2S token error:', e.response?.data || e.message);
    return null;
  }
}

async function getZoomAccessToken(accountIdOverride) {
  // 1) Server-to-Server OAuth (권장): ZOOM_ACCOUNT_ID가 있으면 우선 사용
  const s2s = await getServerToServerAccessToken(accountIdOverride);
  if (s2s) return s2s;

  // 2) 일반 OAuth(authorization_code)로 저장된 refresh_token 기반
  const stored = await getZoomOauthTokenFromDb();
  if (!stored) return null;

  const expiresAt = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;
  if (stored.access_token && expiresAt - ZOOM_TOKEN_SKEW_MS > Date.now()) {
    return stored.access_token;
  }

  if (stored.refresh_token) {
    const next = await refreshZoomOauthToken(stored.refresh_token);
    await saveZoomOauthTokenToDb(next);
    return next.access_token || null;
  }

  return null;
}

async function zoomListAllUsers(accessToken) {
  const axios = require('axios');
  const all = [];
  const pageSize = 300;
  let pageNumber = 1;
  let nextPageToken = null;

  for (let iter = 0; iter < 50; iter += 1) {
    const params = { page_size: pageSize, status: 'active' };
    if (nextPageToken) params.next_page_token = nextPageToken;
    else params.page_number = pageNumber;

    const res = await axios.get('https://api.zoom.us/v2/users', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });

    const users = Array.isArray(res.data?.users) ? res.data.users : [];
    all.push(...users);

    if (res.data?.next_page_token) {
      nextPageToken = res.data.next_page_token;
      if (!nextPageToken) break;
      continue;
    }

    const current = Number(res.data?.page_number) || pageNumber;
    const totalPages = Number(res.data?.page_count) || current;
    if (current >= totalPages) break;
    pageNumber = current + 1;
  }

  return all;
}

async function zoomGetUser(accessToken, userIdOrEmail) {
  const axios = require('axios');
  const id = userIdOrEmail ? encodeURIComponent(String(userIdOrEmail)) : 'me';
  const res = await axios.get(`https://api.zoom.us/v2/users/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

async function syncUsersFromZoom(accountIdOverride) {
  const token = await getZoomAccessToken(accountIdOverride);
  if (!token) {
    const hasAccountId = Boolean(process.env.ZOOM_ACCOUNT_ID || accountIdOverride);
    const hint = hasAccountId
      ? 'Zoom 토큰 발급에 실패했습니다.'
      : '`.env`에 `ZOOM_ACCOUNT_ID`(Server-to-Server OAuth) 설정 또는 `/api/auth/zoom/start`로 OAuth 인증이 필요합니다.';
    const err = new Error(`Zoom 사용자 동기화 실패: ${hint}`);
    err.code = 'ZOOM_AUTH_REQUIRED';
    throw err;
  }

  const zoomUsers = await zoomListAllUsers(token);
  for (const u of zoomUsers) {
    try {
      let payload = u;
      const hasJobTitle =
        Object.prototype.hasOwnProperty.call(payload, 'job_title') ||
        Object.prototype.hasOwnProperty.call(payload, 'jobTitle') ||
        Object.prototype.hasOwnProperty.call(payload, 'title');
      if (!hasJobTitle) {
        try {
          const detail = await zoomGetUser(token, payload?.id || payload?.email || null);
          if (detail && typeof detail === 'object') payload = { ...payload, ...detail };
        } catch (e) {
          console.error('sync user detail failed:', payload?.id, e.response?.data || e.message);
        }
      }
      await upsertUserFromZoom(payload);
    } catch (e) {
      // 한 명 실패로 전체 실패 방지 (메일 중복 등)
      console.error('sync user failed:', u?.id, e.message);
    }
  }
  return { total: zoomUsers.length };
}

async function sendWebhookMessage(text) {
  const url = process.env.ZOOM_WEBHOOK_URL;
  const token = process.env.ZOOM_WEBHOOK_TOKEN;
  if (!url || !token) return;
  try {
    await require('axios').post(url, text, {
      headers: { 'Content-Type': 'text/plain', Authorization: token },
    });
  } catch (e) {
    console.error('sendWebhookMessage error:', e.response?.data || e.message);
  }
}

async function attachMe(req, res, next) {
  try {
    const sess = getSession(req);
    if (sess?.user) {
      try {
        const fresh = await findUserByZoom({ zoomUserId: sess.user.zoom_user_id, zoomEmail: sess.user.email });
        if (fresh) {
          sess.user = fresh;
          req.me = fresh;
          req.zoomIdentifiers = { source: 'session' };
          return next();
        }
      } catch (e) {
        // ignore refresh failure
      }
      req.me = sess.user;
      req.zoomIdentifiers = { source: 'session' };
      return next();
    }
    const identifiers = extractZoomIdentifiers(req);
    const allowDevFallback = process.env.ALLOW_DEV_FALLBACK === 'true' || process.env.DEV_ALLOW_FALLBACK === 'true';
    const devUserId = process.env.DEV_ZOOM_USER_ID || process.env.ZOOM_USER_ID || null;
    const devEmail = process.env.DEV_ZOOM_USER_EMAIL || process.env.ZOOM_USER_EMAIL || null;
    const devAccountId = process.env.DEV_ZOOM_ACCOUNT_ID || process.env.ZOOM_ACCOUNT_ID || null;
    const rawCtx = extractZoomIdentifiers._lastDecoded || {};
    const rawEmail = rawCtx.email || rawCtx.userEmail || rawCtx.user_email || rawCtx.emailAddress || null;
    const zoomEmail = identifiers.zoomEmail || rawEmail || null;
    const zoomAccountId = identifiers.zoomAccountId || rawCtx.accountId || rawCtx.account_id || null;
    const ctxName = rawCtx.displayName || rawCtx.name || rawCtx.userName || null;
    const ctxDept = rawCtx.dept || rawCtx.department || null;
    const ctxTitle = rawCtx.job_title || rawCtx.title || null;

    let me = await findUserByZoom({ zoomUserId: identifiers.zoomUserId, zoomEmail: zoomEmail });

    if (me) {
      const updates = [];
      const params = [];
      if (zoomAccountId && zoomAccountId !== me.zoom_account_id) { updates.push('zoom_account_id = ?'); params.push(zoomAccountId); }
      if (ctxTitle && ctxTitle !== me.job_title) { updates.push('job_title = ?'); params.push(ctxTitle); }
      if (ctxName && me.name === '미등록 사용자') { updates.push('name = ?'); params.push(ctxName); }
      if (ctxDept) {
        const [drows] = await pool.query('SELECT id FROM departments WHERE name = ? LIMIT 1', [ctxDept]);
        let deptId = drows[0]?.id || null;
        if (!deptId) {
          const [r] = await pool.query('INSERT INTO departments (name) VALUES (?)', [ctxDept]);
          deptId = r.insertId || null;
        }
        if (deptId && deptId !== me.department_id) { updates.push('department_id = ?'); params.push(deptId); }
      }
      if (updates.length) {
        params.push(me.zoom_user_id);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE zoom_user_id = ?`, params);
        me = await findUserByZoom({ zoomUserId: identifiers.zoomUserId, zoomEmail: zoomEmail });
      }
    } else if (identifiers.zoomUserId || zoomEmail) {
      const fallbackName = ctxName || (zoomEmail ? zoomEmail.split('@')[0] : '미등록 사용자');
      const zoomUserPayload = {
        id: identifiers.zoomUserId || zoomEmail || null,
        account_id: zoomAccountId || null,
        email: zoomEmail || (identifiers.zoomUserId ? `${identifiers.zoomUserId}@zoom.local` : null),
        display_name: fallbackName,
        dept: ctxDept,
        job_title: ctxTitle,
      };
      me = await upsertUserFromZoom(zoomUserPayload);
      me = await findUserByZoom({ zoomUserId: zoomUserPayload.id, zoomEmail: zoomUserPayload.email });
    }
    if (!me && allowDevFallback && devUserId && devEmail) {
      me = await findUserByZoom({ zoomUserId: devUserId, zoomEmail: devEmail });
    }
    if (!me) return res.status(401).json({ error: 'Zoom 사용자 매핑에 실패했습니다.' });
    if (zoomEmail && me.email !== zoomEmail) {
      await pool.query('UPDATE users SET email = ? WHERE zoom_user_id = ?', [zoomEmail, me.zoom_user_id]);
      me.email = zoomEmail;
    }

    // [부트스트랩] DB가 초기화된 경우 첫 로그인 사용자를 master로 설정 (관리 기능 잠김 방지)
    try {
      const [mrows] = await pool.query("SELECT zoom_user_id FROM users WHERE role = 'master' LIMIT 1");
      if (!mrows.length) {
        await pool.query("UPDATE users SET role = 'master' WHERE zoom_user_id = ?", [me.zoom_user_id]);
        me.role = 'master';
      }
    } catch (e) {
      // ignore
    }

    req.me = me;
    req.zoomIdentifiers = { ...identifiers, fallback: !identifiers.zoomUserId && !identifiers.zoomEmail };
    const sid = randomSid();
    SESSIONS.set(sid, { user: me });
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    setCookie(res, 'zn_sid', sid, { httpOnly: true, sameSite: isHttps ? 'None' : 'Lax', secure: isHttps, maxAge: 60 * 60 * 24 * 7, path: '/' });
    if (devAccountId && !req.me.zoom_account_id) req.me.zoom_account_id = devAccountId;
    return next();
  } catch (e) {
    console.error('attachMe error:', e.message);
    logEvent('attachMe.error', { message: e.message });
    return res.status(500).json({ error: 'Server error' });
  }
}

async function fetchAttachments(noteIds) {
  if (!noteIds.length) return {};
  const placeholders = noteIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, note_id, file_name, file_mime FROM research_note_files WHERE note_id IN (${placeholders}) ORDER BY id ASC`,
    noteIds
  );
  const grouped = {};
  rows.forEach((r) => {
    if (!grouped[r.note_id]) grouped[r.note_id] = [];
    grouped[r.note_id].push({ id: r.id, file_name: r.file_name, file_mime: r.file_mime });
  });
  return grouped;
}

// ===== API Routes =====
app.get('/api/auth/zoom/start', (req, res) => {
  try { return res.redirect(buildAuthorizeUrl()); } catch (e) { return res.status(500).send('OAuth start failed'); }
});

app.get('/api/auth/zoom/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const token = await exchangeCodeForToken(code);
    await saveZoomOauthTokenToDb(token);
    const meRaw = await zoomGetMe(token.access_token);
    logEvent('zoom.callback.user', { id: meRaw.id, email: meRaw.email, account_id: meRaw.account_id });
    const me = await upsertUserFromZoom(meRaw);
    const sid = randomSid();
    SESSIONS.set(sid, { user: me });
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    setCookie(res, 'zn_sid', sid, { httpOnly: true, sameSite: isHttps ? 'None' : 'Lax', secure: isHttps, maxAge: 60 * 60 * 24 * 7, path: '/' });
    const redirect = process.env.APP_SUCCESS_REDIRECT || '/';
    return res.redirect(redirect);
  } catch (e) {
    return res.status(500).send('OAuth callback failed');
  }
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.zn_sid) SESSIONS.delete(cookies.zn_sid);
  clearCookie(res, 'zn_sid');
  res.json({ ok: true });
});

app.get('/api/my-signature', attachMe, async (req, res) => {
  try {
    const me = req.me;
    const [rows] = await pool.query('SELECT signature_data, signature_type, signature_updated_at FROM users WHERE zoom_user_id = ? LIMIT 1', [me.zoom_user_id]);
    res.json(rows[0] || { signature_data: null, signature_type: 'none', signature_updated_at: null });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/my-signature', attachMe, async (req, res) => {
  try {
    const me = req.me;
    const { signatureData, signatureType } = req.body;
    if (!signatureType || !['none', 'draw', 'text', 'image'].includes(signatureType)) return res.status(400).json({ error: 'Invalid signature type' });
    await pool.query('UPDATE users SET signature_data = ?, signature_type = ?, signature_updated_at = NOW() WHERE zoom_user_id = ?', [signatureData || null, signatureType, me.zoom_user_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/me', attachMe, (req, res) => res.json(req.me));

const encodeHtml = (txt) =>
  txt == null
    ? ''
    : String(txt)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const renderSignatureCell = (data, type, name = '', signedAt = null) => {
  let mark;
  if (!data) {
    mark = '<div class="sig-empty">(미서명)</div>';
  } else if (type === 'text') {
    mark = `<div class="sig-text">${encodeHtml(data)}</div>`;
  } else {
    mark = `<img src="${data}" alt="signature" class="sig-image" />`;
  }
  const ts = toDateTimeMinuteStringSafe(signedAt);
  return `
    <div class="sig-cell">
      <div class="sig-mark">${mark}</div>
      <div class="sig-name-inline">${encodeHtml(name) || '-'}</div>
      <div class="sig-time-inline">${encodeHtml(ts) || '-'}</div>
    </div>
  `;
};

const renderSignatureBox = (label, data, type, name = '', signedAt = null) => {
  return `
    <div class="sig-box">
      <div class="sig-box-role">${encodeHtml(label)}</div>
      <div class="sig-box-body">
        ${renderSignatureCell(data, type, name, signedAt)}
      </div>
    </div>
  `;
};

function buildNoteSectionHtml(n) {
  const period = `${toDateStringSafe(n.period_start)} ~ ${toDateStringSafe(n.period_end)}`;
  const weekText = n.report_year ? `${n.report_year}년 ${n.report_week}주차` : '-';
  const goalHtml = n.weekly_goal ? encodeHtml(n.weekly_goal).replace(/\n/g, '<br />') : '-';
  const rawContent = n.content || '';
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(rawContent);
  const contentHtml = looksHtml ? rawContent : encodeHtml(rawContent).replace(/\n/g, '<br />');
  return `
    <section class="note-section">
      <div class="note-inner">
        <h1 class="doc-title">${DOC_TITLE}</h1>

        <div class="top-row">
          <table class="top-row-table">
            <tbody>
              <tr>
                <td class="top-meta">
                  <table class="meta-list">
                    <tbody>
                      <tr><th>부서</th><td>${encodeHtml(n.department_name) || '-'}</td></tr>
                      <tr><th>작성자</th><td>${encodeHtml(n.writer_name) || '-'}</td></tr>
                      <tr><th>기록일자</th><td>${toDateStringSafe(n.record_date)}</td></tr>
                      <tr><th>문서번호</th><td>${encodeHtml(n.serial_no) || '-'}</td></tr>
                      <tr><th>보고주차</th><td>${encodeHtml(weekText)}</td></tr>
                      <tr><th>제목</th><td>${encodeHtml(n.title) || '-'}</td></tr>
                      <tr><th>기간</th><td>${encodeHtml(period)}</td></tr>
                    </tbody>
                  </table>
                </td>
                <td class="top-sig">
                  <table class="sig-grid">
                    <tbody>
                      <tr>
                        <td>${renderSignatureBox('기록자', n.writer_signature_data, n.writer_signature_type, n.writer_name || '', n.created_at)}</td>
                        <td>${renderSignatureBox('확인자', n.checker_signature_data, n.checker_signature_type, n.checker_name || '', n.checker_signed_at)}</td>
                        <td>${renderSignatureBox('점검자', n.reviewer_signature_data, n.reviewer_signature_type, n.reviewer_name || '', n.reviewer_signed_at)}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="goal-box">
          <div class="section-label">금주 연구 목표</div>
          <div class="section-body">${goalHtml}</div>
        </div>

        <table class="content-table">
          <thead>
            <tr><th>금주 연구 내용</th></tr>
          </thead>
          <tbody>
            <tr>
              <td class="content-box">
                ${contentHtml || '<div class="sig-empty">(내용이 없습니다)</div>'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function buildNoteHtml(note) {
  const fontCss = getFontCss();
  const styles = `
    ${fontCss}
    @page { margin: 12mm; }
    body { margin:0; padding:12px; background:#fff; color:#0f172a; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .note-section { page-break-after:always; font-size:12px; }
    .note-inner { max-width:800px; margin:0 auto; }
    .doc-title { text-align:center; margin:0 0 16px; font-size:20px; font-weight:700; }

    .top-row { padding:14px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; margin:0; }
    .top-row-table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .top-row-table td { padding:0; vertical-align:top; }
    .top-meta { padding-right:16px; }
    .top-sig { width:400px; white-space:nowrap; text-align:right; }

    .meta-list { width:100%; border-collapse:collapse; table-layout:fixed; font-size:13px; line-height:1.4; }
    .meta-list th { width:90px; font-weight:700; color:#0f172a; white-space:nowrap; text-align:left; padding:4px 10px 4px 0; vertical-align:top; }
    .meta-list td { padding:4px 0; word-break:keep-all; overflow-wrap:break-word; }

    .goal-box { border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin:12px 0 0; }
    .section-label { padding:8px 10px; background:#f3f4f6; font-weight:700; color:#0f172a; border-bottom:1px solid #cbd5e1; text-align:center; }
    .section-body { padding:10px 12px; background:#fff; font-size:13px; line-height:1.6; word-break:break-word; overflow-wrap:break-word; }

    .sig-grid { border-collapse:collapse; }
    .sig-grid td { padding-left:8px; vertical-align:top; }
    .sig-grid td:first-child { padding-left:0; }

    .sig-box { width:120px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#fff; }
    .sig-box-role { padding:6px 8px; font-weight:700; font-size:12px; text-align:center; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#0f172a; }
    .sig-box-body { padding:8px 8px 10px; }

    .sig-cell { text-align:center; }
    .sig-mark { margin:0 auto 4px; }
    .sig-image { max-height:26px; max-width:100%; object-fit:contain; }
    .sig-text { font-weight:700; font-size:14px; }
    .sig-name-inline { font-weight:700; font-size:8px; text-align:center; }
    .sig-time-inline { font-size:8px; color:#64748b; text-align:center; }
    .sig-empty { color:#94a3b8; font-size:12px; }
    .content-table { width:100%; margin-top:12px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; border-collapse:separate; border-spacing:0; }
    .content-table thead { display: table-header-group; }
    .content-table th { padding:8px 10px; font-weight:700; text-align:center; color:#0f172a; background:#f3f4f6; border:0; border-bottom:1px solid #cbd5e1; }
    .content-box { border:0; padding:10px 12px; font-size:13px; line-height:1.6; word-break:break-word; overflow-wrap:break-word; background:#fff; vertical-align:top; }
    .content-box img { max-width:100%; height:auto; }
    section:last-of-type { page-break-after: auto; }
  `;
  const section = buildNoteSectionHtml(note);
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Research Note</title>
        <style>${styles}</style>
      </head>
      <body>${section}</body>
    </html>
  `;
}

// [내보내기] 선택 문서 HTML 다운로드
async function buildExportHtml(ids) {
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `
    SELECT rn.*,
           u.name AS writer_name, u.job_title AS writer_job_title, u.role AS writer_role, u.department_id AS writer_department_id,
           u.signature_data AS writer_signature_data, u.signature_type AS writer_signature_type,
           d.name AS department_name, c.name AS checker_name, r.name AS reviewer_name,
           c.signature_data AS checker_signature_data, c.signature_type AS checker_signature_type,
           r.signature_data AS reviewer_signature_data, r.signature_type AS reviewer_signature_type
    FROM research_notes rn
    JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN users c ON rn.checker_zoom_user_id = c.zoom_user_id
    LEFT JOIN users r ON rn.reviewer_zoom_user_id = r.zoom_user_id
    WHERE rn.id IN (${placeholders})
    ORDER BY rn.record_date DESC, rn.id DESC
    `,
    ids
  );

  const sections = rows.map((n) => buildNoteSectionHtml(n)).join('\n');
  const fontCss = getFontCss();
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Research Notes</title>
        <style>
          ${fontCss}
          @page { margin: 12mm; }
          body { margin:0; padding:12px; background:#fff; color:#0f172a; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .note-section { page-break-after:always; font-size:12px; }
          .note-inner { max-width:800px; margin:0 auto; }
          .doc-title { text-align:center; margin:0 0 16px; font-size:20px; font-weight:700; }

          .top-row { padding:14px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; margin:0; }
          .top-row-table { width:100%; border-collapse:collapse; table-layout:fixed; }
          .top-row-table td { padding:0; vertical-align:top; }
          .top-meta { padding-right:16px; }
          .top-sig { width:400px; white-space:nowrap; text-align:right; }

          .meta-list { width:100%; border-collapse:collapse; table-layout:fixed; font-size:13px; line-height:1.4; }
          .meta-list th { width:90px; font-weight:700; color:#0f172a; white-space:nowrap; text-align:left; padding:4px 10px 4px 0; vertical-align:top; }
          .meta-list td { padding:4px 0; word-break:keep-all; overflow-wrap:break-word; }

          .goal-box { border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin:12px 0 0; }
          .section-label { padding:8px 10px; background:#f3f4f6; font-weight:700; color:#0f172a; border-bottom:1px solid #cbd5e1; text-align:center; }
          .section-body { padding:10px 12px; background:#fff; font-size:13px; line-height:1.6; word-break:break-word; overflow-wrap:break-word; }

          .sig-grid { border-collapse:collapse; }
          .sig-grid td { padding-left:8px; vertical-align:top; }
          .sig-grid td:first-child { padding-left:0; }

          .sig-box { width:120px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#fff; }
          .sig-box-role { padding:6px 8px; font-weight:700; font-size:12px; text-align:center; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#0f172a; }
          .sig-box-body { padding:8px 8px 10px; }

          .sig-cell { text-align:center; }
          .sig-mark { margin:0 auto 4px; }
          .sig-image { max-height:26px; max-width:100%; object-fit:contain; }
          .sig-text { font-weight:700; font-size:14px; }
          .sig-name-inline { font-weight:700; font-size:8px; text-align:center; }
          .sig-time-inline { font-size:8px; color:#64748b; text-align:center; }
          .sig-empty { color:#94a3b8; font-size:12px; }
          .content-table { width:100%; margin-top:12px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; border-collapse:separate; border-spacing:0; }
          .content-table thead { display: table-header-group; }
          .content-table th { padding:8px 10px; font-weight:700; text-align:center; color:#0f172a; background:#f3f4f6; border:0; border-bottom:1px solid #cbd5e1; }
          .content-box { border:0; padding:10px 12px; font-size:13px; line-height:1.6; word-break:break-word; overflow-wrap:break-word; background:#fff; vertical-align:top; }
          .content-box img { max-width:100%; height:auto; }
          section:last-of-type { page-break-after: auto; }
        </style>
      </head>
      <body>${sections || '<p>선택된 문서가 없습니다.</p>'}</body>
    </html>
  `;
}

async function buildNotePdfBuffer(note) {
  const html = buildNoteHtml(note);
  const options = {
    format: 'A4',
    border: {
      top: '12mm',
      right: '12mm',
      bottom: '12mm',
      left: '12mm',
    },
    timeout: 180000,
  };
  return new Promise((resolve, reject) => {
    htmlPdf.create(html, options).toBuffer((err, buffer) => {
      if (err) return reject(err);
      return resolve(buffer);
    });
  });
}

async function sendExport(ids, res) {
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `
    SELECT rn.*,
           u.name AS writer_name, u.job_title AS writer_job_title, u.role AS writer_role, u.department_id AS writer_department_id,
           u.signature_data AS writer_signature_data, u.signature_type AS writer_signature_type,
           d.name AS department_name, c.name AS checker_name, r.name AS reviewer_name,
           c.signature_data AS checker_signature_data, c.signature_type AS checker_signature_type,
           r.signature_data AS reviewer_signature_data, r.signature_type AS reviewer_signature_type
    FROM research_notes rn
    JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN users c ON rn.checker_zoom_user_id = c.zoom_user_id
    LEFT JOIN users r ON rn.reviewer_zoom_user_id = r.zoom_user_id
    WHERE rn.id IN (${placeholders})
    ORDER BY rn.record_date DESC, rn.id DESC
    `,
    ids
  );

  res.setHeader('Content-Type', 'application/zip');
  const zipName = `research-notes-${Date.now()}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('export zip error:', err.message);
    try { res.status(500).end(); } catch (e) {}
  });
  archive.pipe(res);

  for (const note of rows) {
    const buf = await buildNotePdfBuffer(note);
    const safeName = `${note.report_week || '주차미정'}주차_${note.writer_name || '작성자미상'}_연구노트.pdf`.replace(/[\\/:*?"<>|]/g, '_');
    archive.append(buf, { name: safeName });
  }

  archive.finalize();
}

app.post('/api/research-notes/export', attachMe, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids가 필요합니다.' });
    await sendExport(ids, res);
  } catch (e) {
    console.error('POST /api/research-notes/export error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/research-notes/export', attachMe, async (req, res) => {
  try {
    const idsParam = req.query.ids ? decodeURIComponent(String(req.query.ids)) : null;
    if (!idsParam) return res.status(400).json({ error: 'ids가 필요합니다.' });
    const ids = String(idsParam)
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0);
    if (!ids.length) return res.status(400).json({ error: 'ids가 필요합니다.' });
    await sendExport(ids, res);
  } catch (e) {
    console.error('GET /api/research-notes/export error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/research-notes/export-pdf', attachMe, async (req, res) => {
  try {
    const idsParam = req.query.ids ? decodeURIComponent(String(req.query.ids)) : null;
    if (!idsParam) return res.status(400).json({ error: 'ids가 필요합니다.' });
    const ids = String(idsParam)
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0);
    if (!ids.length) return res.status(400).json({ error: 'ids가 필요합니다.' });
    await sendExport(ids, res);
  } catch (e) {
    console.error('GET /api/research-notes/export-pdf error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// [조회] 연구노트 목록
app.get('/api/research-notes', attachMe, async (req, res) => {
  try {
    const me = req.me;
    const allowAll = ['admin', 'master'].includes(me.role);
    let sql = `
      SELECT rn.*,
             u.name AS writer_name, u.job_title AS writer_job_title, u.role AS writer_role, u.department_id AS writer_department_id,
             u.signature_data AS writer_signature_data,
             u.signature_type AS writer_signature_type,
             d.name AS department_name, c.name AS checker_name, r.name AS reviewer_name
      FROM research_notes rn
      JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users c ON rn.checker_zoom_user_id = c.zoom_user_id
      LEFT JOIN users r ON rn.reviewer_zoom_user_id = r.zoom_user_id
    `;
    const params = [];
    if (me.role === 'staff') {
      sql += ' WHERE rn.writer_zoom_user_id = ?';
      params.push(me.zoom_user_id);
    } else if (me.role === 'leader' && me.department_id && !allowAll) {
      sql += ' WHERE u.department_id = ?';
      params.push(me.department_id);
    }
    sql += ' ORDER BY rn.record_date DESC, rn.id DESC';
    const [rows] = await pool.query(sql, params);
    const attachments = await fetchAttachments(rows.map(r => r.id));
    const notes = rows.map(r => ({ ...r, attachments: attachments[r.id] || [] }));
    res.json({ me, notes });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// [작성] 연구노트
app.post('/api/research-notes', attachMe, conditionalUpload, async (req, res) => {
  try {
    const me = req.me;
    const body = req.body || {};
    const { recordDate, reportYear, reportWeek, title, periodStart, periodEnd, weeklyGoal, content } = body;
    
    const hasSignature = Boolean(me?.signature_data) && me?.signature_type && me.signature_type !== 'none';
    if (!hasSignature) {
      return res.status(400).json({ error: '서명을 먼저 등록해주세요.' });
    }

    const yr = Number(reportYear);
    const wk = Number(reportWeek);
    if (!Number.isInteger(yr) || !Number.isInteger(wk) || wk < 1 || wk > 53) {
      return res.status(400).json({ error: '보고 주차가 올바르지 않습니다. (1~53)' });
    }

    if (!recordDate || !title || !content) {
      return res.status(400).json({ error: '필수 입력값이 누락되었습니다.' });
    }

    // 문서 번호 자동 생성
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as count FROM research_notes WHERE report_year = ? AND report_week = ?',
      [yr, wk]
    );
    const nextCount = (countResult[0]?.count || 0) + 1;
    const generatedSerialNo = `${yr}-${wk}-${nextCount}`;

    // 파일 데이터 처리
    const [result] = await pool.query(
      `INSERT INTO research_notes
        (writer_zoom_user_id, record_date, report_year, report_week, serial_no, title, period_start, period_end, weekly_goal, content,
         attachment_name, attachment_data,
         checker_zoom_user_id, reviewer_zoom_user_id, checker_signature_data, checker_signature_type, reviewer_signature_data, reviewer_signature_type, checker_signed_at, reviewer_signed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'none', NULL, 'none', NULL, NULL)`,
      [me.zoom_user_id, recordDate, yr, wk, generatedSerialNo, title, periodStart || null, periodEnd || null, weeklyGoal || null, content]
    );

    const noteId = result.insertId;

    if (req.files && req.files.length) {
      for (const f of req.files) {
        const b64 = f.buffer.toString('base64');
        const data = Buffer.from(b64, 'base64');
        await pool.query(
          'INSERT INTO research_note_files (note_id, file_name, file_mime, file_data) VALUES (?, ?, ?, ?)',
          [noteId, f.originalname, f.mimetype, data]
        );
      }
    }

    const [rows] = await pool.query(
      `SELECT rn.*, u.name AS writer_name, u.job_title AS writer_job_title, u.role AS writer_role, u.department_id AS writer_department_id,
              d.name AS department_name, c.name AS checker_name, r.name AS reviewer_name
       FROM research_notes rn
       JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN users c ON rn.checker_zoom_user_id = c.zoom_user_id
       LEFT JOIN users r ON rn.reviewer_zoom_user_id = r.zoom_user_id
       WHERE rn.id = ?`,
      [result.insertId]
    );
    
    const message = [
      '새 연구노트 작성 알림',
      `- 작성자: ${me.name}`,
      `- 제목: ${title}`,
      `- 보고주차: ${yr}년 ${wk}주차`,
      `- 보고기간: ${toDateStringSafe(periodStart) || '-'} ~ ${toDateStringSafe(periodEnd) || '-'}`,
      '앱 > 연구노트 메뉴에서 확인해 주세요.',
    ].join('\n');
    sendWebhookMessage(message);
    const attachmentMap = await fetchAttachments([noteId]);
    const responseNote = { ...rows[0], attachments: attachmentMap[noteId] || [] };
    res.status(201).json(responseNote);
  } catch (e) {
    console.error('POST /api/research-notes error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// [수정] 연구노트 수정 (파일 삭제 기능 + 관리자 모드)
app.put('/api/research-notes/:id', attachMe, conditionalUpload, async (req, res) => {
  try {
    const me = req.me;
    const noteId = req.params.id;
    const body = req.body || {};
    const {
      title,
      periodStart,
      periodEnd,
      weeklyGoal,
      content,
      deleteAttachment,
      recordDate,
      reportYear,
      reportWeek,
      serialNo,
      adminEdit,
    } = body;

    const [rows] = await pool.query('SELECT * FROM research_notes WHERE id = ? LIMIT 1', [noteId]);
    if (!rows.length) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });

    const note = rows[0];
    const attachments = await fetchAttachments([note.id]);
    note.attachments = attachments[note.id] || [];
    const canAdminEdit = ['leader', 'admin', 'master'].includes(me.role);
    const isOwner = note.writer_zoom_user_id === me.zoom_user_id;
    const adminMode = adminEdit === 'true' || adminEdit === true;

    if (!isOwner && !canAdminEdit) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    if (adminMode && !canAdminEdit) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    if (note.checker_signature_data && !(adminMode && canAdminEdit)) {
      return res.status(400).json({ error: '확인완료된 문서는 수정할 수 없습니다. (관리자 수정 필요)' });
    }

    if (!title || !String(title).trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
    if (!content) return res.status(400).json({ error: '내용을 입력해주세요.' });

    const sqlParts = [
      'title = ?',
      'period_start = ?',
      'period_end = ?',
      'weekly_goal = ?',
      'content = ?',
    ];
    const params = [title, periodStart || null, periodEnd || null, weeklyGoal || null, content];

    if (adminMode) {
      const yr = reportYear ? Number(reportYear) : null;
      const wk = reportWeek ? Number(reportWeek) : null;
      const rd = recordDate || null;
      const sn = serialNo || null;
      if (!rd || !yr || !wk || !sn) {
        return res.status(400).json({ error: '기록일, 보고 주차, 문서번호를 모두 입력해주세요.' });
      }
      sqlParts.push('record_date = ?', 'report_year = ?', 'report_week = ?', 'serial_no = ?');
      params.push(rd, yr, wk, sn);
    }

    if (deleteAttachment === 'true') {
      await pool.query('DELETE FROM research_note_files WHERE note_id = ?', [noteId]);
      sqlParts.push('attachment_name = NULL', 'attachment_data = NULL');
    }
    if (req.files && req.files.length) {
      for (const f of req.files) {
        const b64 = f.buffer.toString('base64');
        const data = Buffer.from(b64, 'base64');
        await pool.query(
          'INSERT INTO research_note_files (note_id, file_name, file_mime, file_data) VALUES (?, ?, ?, ?)',
          [noteId, f.originalname, f.mimetype, data]
        );
      }
      sqlParts.push('attachment_name = NULL', 'attachment_data = NULL');
    }

    const sql = `UPDATE research_notes SET ${sqlParts.join(', ')} WHERE id = ?`;
    params.push(noteId);

    await pool.query(sql, params);

    const [updatedRows] = await pool.query(
      `SELECT rn.*, u.name AS writer_name, u.job_title AS writer_job_title, u.role AS writer_role, u.department_id AS writer_department_id,
              d.name AS department_name, c.name AS checker_name, r.name AS reviewer_name
       FROM research_notes rn
       JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN users c ON rn.checker_zoom_user_id = c.zoom_user_id
       LEFT JOIN users r ON rn.reviewer_zoom_user_id = r.zoom_user_id
       WHERE rn.id = ?`,
      [noteId]
    );

    const updatedNote = updatedRows[0];
    const newAttachments = await fetchAttachments([noteId]);
    updatedNote.attachments = newAttachments[noteId] || [];
    res.json(updatedNote);
  } catch (e) {
    console.error('PUT /api/research-notes error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// [신규] 파일 다운로드 (GET) - noteId/fileId
app.get('/api/research-notes/:noteId/files/:fileId/download', async (req, res) => {
  try {
    const noteId = req.params.noteId;
    const fileId = req.params.fileId;
    const [rows] = await pool.query('SELECT file_name, file_mime, file_data FROM research_note_files WHERE id = ? AND note_id = ? LIMIT 1', [fileId, noteId]);
    if (!rows.length) return res.status(404).send('File not found');
    const { file_name, file_mime, file_data } = rows[0];
    const mime = file_mime || 'application/octet-stream';
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file_name)}"; filename*=UTF-8''${encodeURIComponent(file_name)}`);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', file_data?.length || 0);
    res.send(file_data);
  } catch (e) {
    console.error('Download error:', e);
    res.status(500).send('Server Error');
  }
});

// [호환] 첫 번째 파일 다운로드 (구버전)
app.get('/api/research-notes/:id/download', async (req, res) => {
  try {
    const noteId = req.params.id;
    const [rows] = await pool.query('SELECT id, file_name, file_mime, file_data FROM research_note_files WHERE note_id = ? ORDER BY id ASC LIMIT 1', [noteId]);
    if (!rows.length) return res.status(404).send('File not found');
    const { id, file_name, file_mime, file_data } = rows[0];
    const mime = file_mime || 'application/octet-stream';
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file_name)}"; filename*=UTF-8''${encodeURIComponent(file_name)}`);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', file_data?.length || 0);
    res.send(file_data);
  } catch (e) {
    console.error('Download error:', e);
    res.status(500).send('Server Error');
  }
});

// [구버전 데이터] 단일 필드에서 다운로드
app.get('/api/research-notes/:id/legacy-download', async (req, res) => {
  try {
    const noteId = req.params.id;
    const [rows] = await pool.query('SELECT attachment_name, attachment_data FROM research_notes WHERE id = ? LIMIT 1', [noteId]);
    if (!rows.length || !rows[0].attachment_data) return res.status(404).send('File not found');
    const { attachment_name, attachment_data } = rows[0];
    const matches = attachment_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return res.status(500).send('Invalid file format');
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment_name)}"; filename*=UTF-8''${encodeURIComponent(attachment_name)}`);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length || 0);
    res.send(buffer);
  } catch (e) {
    console.error('Download error:', e);
    res.status(500).send('Server Error');
  }
});

app.delete('/api/research-notes/:id', attachMe, async (req, res) => {
  try {
    const me = req.me;
    const noteId = req.params.id;
    const [rows] = await pool.query('SELECT id, writer_zoom_user_id, checker_signature_data FROM research_notes WHERE id = ? LIMIT 1', [noteId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const note = rows[0];
    const canDelete = note.writer_zoom_user_id === me.zoom_user_id || me.role === 'executive' || me.role === 'leader' || me.role === 'admin' || me.role === 'master';
    if (!canDelete) return res.status(403).json({ error: '권한이 없습니다.' });
    const canForceDeleteConfirmed = ['executive', 'leader', 'admin', 'master'].includes(me.role);
    if (note.checker_signature_data && !canForceDeleteConfirmed) {
      return res.status(400).json({ error: '확인완료된 문서는 삭제할 수 없습니다.' });
    }
    await pool.query('DELETE FROM research_notes WHERE id = ?', [noteId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/research-notes/:id/sign', attachMe, async (req, res) => {
  try {
    const me = req.me;
    const { role, clear, proxyZoomUserId } = req.body;
    if (!['checker', 'reviewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    let signer = await findUserByZoom({ zoomUserId: me.zoom_user_id });
    if (proxyZoomUserId) {
      if (me.role !== 'master') return res.status(403).json({ error: '대리 서명 권한이 없습니다.' });
      const proxy = await findUserByZoom({ zoomUserId: proxyZoomUserId });
      if (proxy) signer = proxy;
    }
    if (!signer) return res.status(400).json({ error: '서명자 정보를 찾을 수 없습니다.' });
    const sigData = clear ? null : signer.signature_data || null;
    const sigType = clear ? 'none' : signer.signature_type || 'none';
    const nowSql = clear ? null : new Date();
    const fields = role === 'checker'
        ? { zoomField: 'checker_zoom_user_id', dataField: 'checker_signature_data', typeField: 'checker_signature_type', timeField: 'checker_signed_at' }
        : { zoomField: 'reviewer_zoom_user_id', dataField: 'reviewer_signature_data', typeField: 'reviewer_signature_type', timeField: 'reviewer_signed_at' };
    await pool.query(`UPDATE research_notes SET ${fields.zoomField} = ?, ${fields.dataField} = ?, ${fields.typeField} = ?, ${fields.timeField} = ? WHERE id = ?`,
      [clear ? null : signer.zoom_user_id, sigData, sigType, nowSql, req.params.id]
    );
    const [rows] = await pool.query(
      `SELECT rn.*, u.name AS writer_name, u.job_title AS writer_job_title, u.role AS writer_role, u.department_id AS writer_department_id,
              d.name AS department_name, c.name AS checker_name, r.name AS reviewer_name
       FROM research_notes rn
       JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN users c ON rn.checker_zoom_user_id = c.zoom_user_id
       LEFT JOIN users r ON rn.reviewer_zoom_user_id = r.zoom_user_id
       WHERE rn.id = ?`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// [휴가] 특정 주차 휴가자 조회
app.get('/api/vacations', attachMe, async (req, res) => {
  try {
    const me = req.me;
    if (!['leader', 'admin', 'master'].includes(me.role)) return res.status(403).json({ error: '권한이 없습니다.' });
    const year = Number(req.query.year);
    const week = Number(req.query.week);
    if (!Number.isInteger(year) || !Number.isInteger(week)) {
      return res.status(400).json({ error: 'year/week가 필요합니다.' });
    }
    const [rows] = await pool.query(
      'SELECT zoom_user_id, year, week, reason, created_at FROM user_vacations WHERE year = ? AND week = ? ORDER BY zoom_user_id ASC',
      [year, week]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/vacations error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// [휴가] 내 휴가 주차 조회 (연도 기준)
app.get('/api/my-vacations', attachMe, async (req, res) => {
  try {
    const me = req.me;
    const year = Number(req.query.year);
    if (!Number.isInteger(year)) {
      return res.status(400).json({ error: 'year가 필요합니다.' });
    }
    const [rows] = await pool.query(
      'SELECT year, week, reason, created_at FROM user_vacations WHERE zoom_user_id = ? AND year = ? ORDER BY week ASC',
      [me.zoom_user_id, year]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/my-vacations error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// [휴가] 특정 주차 휴가자 설정(추가/해제)
app.post('/api/vacations', attachMe, async (req, res) => {
  try {
    const me = req.me;
    if (!['leader', 'admin', 'master'].includes(me.role)) return res.status(403).json({ error: '권한이 없습니다.' });

    const body = req.body || {};
    const zoomUserId = body.zoom_user_id || body.zoomUserId || body.userId || null;
    const year = Number(body.year);
    const week = Number(body.week);
    const isVacation = Boolean(body.isVacation ?? body.vacation ?? body.on ?? false);
    const reason = body.reason != null ? String(body.reason).slice(0, 255) : null;

    if (!zoomUserId || !Number.isInteger(year) || !Number.isInteger(week)) {
      return res.status(400).json({ error: 'zoom_user_id, year, week가 필요합니다.' });
    }

    if (isVacation) {
      await pool.query(
        `INSERT INTO user_vacations (zoom_user_id, year, week, reason)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
        [zoomUserId, year, week, reason]
      );
    } else {
      await pool.query('DELETE FROM user_vacations WHERE zoom_user_id = ? AND year = ? AND week = ?', [zoomUserId, year, week]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/vacations error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// [직원] 직급(job_title) 수정 (비활성화 - Zoom 동기화 값 사용)
app.put('/api/users/:zoomUserId/job-title', attachMe, async (req, res) => {
  return res.status(400).json({ error: '직급은 Zoom에서 동기화됩니다. Zoom에서 수정 후 직원 현황 > 새로고침을 해주세요.' });
});

// [직원] 시스템 권한(role) 수정
app.put('/api/users/:zoomUserId/role', attachMe, async (req, res) => {
  try {
    const me = req.me;
    if (me.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });

    const zoomUserId = req.params.zoomUserId;
    const body = req.body || {};
    const nextRoleRaw = body.role ?? body.nextRole ?? body.userRole ?? null;
    const nextRole = nextRoleRaw == null ? '' : String(nextRoleRaw).trim();

    const allowed = ['staff', 'leader' , 'master'];
    if (!allowed.includes(nextRole)) {
      return res.status(400).json({ error: `role 값이 올바르지 않습니다. (${allowed.join(', ')})` });
    }

    const [trows] = await pool.query('SELECT zoom_user_id, role FROM users WHERE zoom_user_id = ? LIMIT 1', [zoomUserId]);
    if (!trows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    const currentRole = trows[0].role;
    if (currentRole === 'master' && nextRole !== 'master') {
      const [mrows] = await pool.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'master'");
      const cnt = Number(mrows?.[0]?.cnt || 0);
      if (cnt <= 1) {
        return res.status(400).json({ error: '마지막 master 권한은 해제할 수 없습니다.' });
      }
    }

    await pool.query('UPDATE users SET role = ? WHERE zoom_user_id = ?', [nextRole, zoomUserId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/users/:zoomUserId/role error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users', attachMe, async (req, res) => {
  try {
    const me = req.me;
    if (!['leader', 'admin', 'master'].includes(me.role)) return res.status(403).json({ error: '권한이 없습니다.' });

    const sync = String(req.query.sync || '').toLowerCase();
    const doSync = sync === '1' || sync === 'true' || sync === 'yes';
    if (doSync) {
      const accountIdOverride = req.zoomIdentifiers?.zoomAccountId || me?.zoom_account_id || null;
      await syncUsersFromZoom(accountIdOverride);
    }

    const [rows] = await pool.query(
      `SELECT u.zoom_user_id, u.zoom_account_id, u.email, u.name, u.job_title, u.role, u.department_id, d.name AS department_name,
              u.signature_data, u.signature_type
      FROM users u LEFT JOIN departments d ON u.department_id = d.id ORDER BY d.name IS NULL, d.name, u.name`
    );
    res.json(rows);
  } catch (e) {
    if (e?.code === 'ZOOM_AUTH_REQUIRED') return res.status(400).json({ error: e.message });
    console.error('GET /api/users error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

const clientBuildPath = path.join(__dirname, 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
  const staticOpts = {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
      else if (filePath.endsWith('.html')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    },
  };
  app.use(express.static(clientBuildPath, staticOpts));
  app.use((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
