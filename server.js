// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zoomnote',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.use(cors());
app.use(express.json());

function getZoomIdentifiers(req) {
  const body = req.body || {};
  return {
    id:
      req.query.zoomUserId ||
      req.headers['x-zoom-user-id'] ||
      body.zoomUserId ||
      null,
    email:
      req.query.zoomEmail ||
      req.headers['x-zoom-user-email'] ||
      body.zoomEmail ||
      null,
    accountId:
      req.query.zoomAccountId ||
      req.headers['x-zoom-account-id'] ||
      body.zoomAccountId ||
      process.env.ZOOM_ACCOUNT_ID ||
      null,
  };
}

async function getZoomAccessToken() {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  if (!clientId || !clientSecret || !accountId) {
    throw new Error('Zoom OAuth env missing');
  }

  const tokenUrl = 'https://zoom.us/oauth/token';
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const params = new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: accountId,
  });

  const res = await axios.post(tokenUrl, params.toString(), {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return res.data.access_token;
}

function normalizeDepartmentName(raw) {
  if (!raw) return null;
  const first = String(raw)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return first || null;
}

function inferRoleFromTitle(title) {
  const text = (title || '').toLowerCase();
  if (/cto|ceo|coo|cfo|president|vp|vice president|부사장|임원|이사/.test(text)) {
    return 'executive';
  }
  if (/lead|leader|manager|director|head|팀장|리더/.test(text)) {
    return 'leader';
  }
  return 'staff';
}

async function findOrCreateDepartment(name, conn, cache) {
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);

  await conn.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name]);
  const [rows] = await conn.query('SELECT id FROM departments WHERE name = ? LIMIT 1', [name]);
  const id = rows[0]?.id || null;
  cache.set(name, id);
  return id;
}

async function getCurrentUser(identifier) {
  if (!identifier) return null;
  const [rows] = await pool.query(
    `
    SELECT
      u.zoom_user_id,
      u.zoom_account_id,
      u.email,
      u.name,
      u.job_title,
      u.role,
      u.department_id,
      d.name AS department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.zoom_user_id = ? OR u.email = ?
    LIMIT 1
    `,
    [identifier, identifier]
  );
  return rows[0] || null;
}

function mapZoomUserFromApi(z) {
  const fullName = [z.first_name, z.last_name].filter(Boolean).join(' ').trim();
  const name = fullName || z.display_name || z.name || z.email;
  return {
    id: z.id,
    account_id: z.account_id,
    email: z.email,
    name,
    department: normalizeDepartmentName(z.dept || z.department),
    job_title:
      z.job_title ||
      z.title ||
      (z.custom_attributes &&
        (z.custom_attributes.job_title || z.custom_attributes.title)) ||
      '',
  };
}

async function fetchZoomUserFromApi(identifier) {
  const accessToken = await getZoomAccessToken();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const url = `https://api.zoom.us/v2/users/${encodeURIComponent(identifier)}`;
  const resp = await axios.get(url, { headers });
  return mapZoomUserFromApi(resp.data);
}

async function syncZoomUsersToDb(users) {
  const conn = await pool.getConnection();
  try {
    const cache = new Map(); // department name -> id
    for (const u of users) {
      const deptId = await findOrCreateDepartment(u.department, conn, cache);
      const role = inferRoleFromTitle(u.job_title);
      await conn.query(
        `
        INSERT INTO users (zoom_user_id, zoom_account_id, email, name, job_title, department_id, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          zoom_account_id = VALUES(zoom_account_id),
          email           = VALUES(email),
          name            = VALUES(name),
          job_title       = VALUES(job_title),
          department_id   = VALUES(department_id),
          role            = VALUES(role)
        `,
        [
          u.id,
          u.account_id || process.env.ZOOM_ACCOUNT_ID || '',
          u.email,
          u.name,
          u.job_title || null,
          deptId,
          role,
        ]
      );
    }
    console.log(`syncZoomUsersToDb: synced ${users.length} users`);
  } catch (err) {
    console.error('syncZoomUsersToDb error:', err.response?.data || err.message);
  } finally {
    conn.release();
  }
}

async function ensureUserInDb(zoomId, email) {
  const identifier = zoomId || email;
  if (!identifier) {
    console.warn('ensureUserInDb: zoomId & email missing');
    return null;
  }

  const existing = await getCurrentUser(identifier);
  if (existing) return existing;

  try {
    const zoomUser = await fetchZoomUserFromApi(identifier);
    await syncZoomUsersToDb([zoomUser]);
    return await getCurrentUser(zoomUser.id);
  } catch (err) {
    console.error('ensureUserInDb error:', err.response?.data || err.message);
    return null;
  }
}

app.get('/api/users', async (req, res) => {
  try {
    const accessToken = await getZoomAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    let nextPageToken = '';
    const allUsers = [];

    do {
      const params = {
        status: 'active',
        page_size: 300,
      };
      if (nextPageToken) params.next_page_token = nextPageToken;

      const usersRes = await axios.get('https://api.zoom.us/v2/users', {
        headers,
        params,
      });

      allUsers.push(...(usersRes.data.users || []));
      nextPageToken = usersRes.data.next_page_token || '';
    } while (nextPageToken);

    const mapped = allUsers.map(mapZoomUserFromApi);
    try {
      await syncZoomUsersToDb(mapped);
    } catch (e) {
      console.error('users sync error:', e);
    }

    res.json(mapped);
  } catch (err) {
    console.error('GET /api/users error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Zoom API Error' });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const { id, email } = getZoomIdentifiers(req);
    const fallback = process.env.DEV_ZOOM_USER_ID || process.env.DEV_ZOOM_USER_EMAIL || null;
    const me = await ensureUserInDb(id || fallback, email);

    if (!me) {
      return res.status(404).json({ error: 'User not found or not synced' });
    }
    res.json(me);
  } catch (err) {
    console.error('GET /api/me error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/research-notes', async (req, res) => {
  const { id, email } = getZoomIdentifiers(req);
  const fallback = process.env.DEV_ZOOM_USER_ID || process.env.DEV_ZOOM_USER_EMAIL || null;

  try {
    const me = await ensureUserInDb(id || fallback, email);
    if (!me) {
      return res.status(403).json({
        error: 'Unknown user',
        zoomId: id,
        email,
      });
    }

    let sql = `
      SELECT rn.*,
             u.name      AS writer_name,
             u.job_title AS writer_job_title,
             u.role      AS writer_role,
             u.department_id AS writer_department_id,
             d.name      AS department_name
      FROM research_notes rn
      JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
      LEFT JOIN departments d ON u.department_id = d.id
    `;
    const params = [];

    if (me.role === 'staff') {
      sql += ' WHERE rn.writer_zoom_user_id = ?';
      params.push(me.zoom_user_id);
    } else if (me.role === 'leader' && me.department_id) {
      sql += ' WHERE u.department_id = ?';
      params.push(me.department_id);
    }

    sql += ' ORDER BY rn.record_date DESC, rn.id DESC';

    const [rows] = await pool.query(sql, params);

    res.json({ me, notes: rows });
  } catch (err) {
    console.error('GET /api/research-notes error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/research-notes', async (req, res) => {
  const { id, email } = getZoomIdentifiers(req);
  const fallback = process.env.DEV_ZOOM_USER_ID || process.env.DEV_ZOOM_USER_EMAIL || null;

  try {
    const me = await ensureUserInDb(id || fallback, email);
    if (!me) {
      return res.status(403).json({ error: 'Unknown user', zoomId: id, email });
    }

    const {
      recordDate,
      reportYear,
      reportWeek,
      serialNo,
      title,
      periodStart,
      periodEnd,
      weeklyGoal,
      content,
    } = req.body;

    if (!recordDate || !reportYear || !reportWeek || !serialNo || !title || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [result] = await pool.query(
      `
      INSERT INTO research_notes
        (writer_zoom_user_id, record_date, report_year, report_week,
         serial_no, title, period_start, period_end, weekly_goal, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        me.zoom_user_id,
        recordDate,
        reportYear,
        reportWeek,
        serialNo,
        title,
        periodStart || null,
        periodEnd || null,
        weeklyGoal || null,
        content,
      ]
    );

    const [rows] = await pool.query(
      `
      SELECT rn.*,
             u.name      AS writer_name,
             u.job_title AS writer_job_title,
             u.role      AS writer_role,
             u.department_id AS writer_department_id,
             d.name      AS department_name
      FROM research_notes rn
      JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE rn.id = ?
      `,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/research-notes error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/research-notes/:id', async (req, res) => {
  const { id: zoomId, email } = getZoomIdentifiers(req);
  const fallback = process.env.DEV_ZOOM_USER_ID || process.env.DEV_ZOOM_USER_EMAIL || null;
  const noteId = req.params.id;

  try {
    const me = await ensureUserInDb(zoomId || fallback, email);
    if (!me) {
      return res.status(403).json({ error: 'Unknown user', zoomId, email });
    }

    const [rows] = await pool.query(
      `
      SELECT rn.*,
             u.name      AS writer_name,
             u.job_title AS writer_job_title,
             u.role      AS writer_role,
             u.department_id AS writer_department_id,
             d.name      AS department_name
      FROM research_notes rn
      JOIN users u ON rn.writer_zoom_user_id = u.zoom_user_id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE rn.id = ?
      `,
      [noteId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const note = rows[0];

    const sameDept =
      me.department_id && note.writer_department_id && me.department_id === note.writer_department_id;
    const isOwner = note.writer_zoom_user_id === me.zoom_user_id;
    const canView =
      me.role === 'executive' || (me.role === 'leader' && sameDept) || (me.role === 'staff' && isOwner);

    if (!canView) {
      return res.status(403).json({ error: 'No permission' });
    }

    res.json({ note });
  } catch (err) {
    console.error('GET /api/research-notes/:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

const clientBuildPath = path.join(__dirname, 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.use((req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
