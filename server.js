// zoomnote/server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('querystring');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Security headers for Zoom client
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://appssdk.zoom.us 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.zoom.us https://appssdk.zoom.us https://*.ngrok-free.app",
      "frame-ancestors 'self' https://*.zoom.us",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Serve React build if exists
const buildPath = path.join(__dirname, 'client', 'build');
app.use(express.static(buildPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
  console.warn('ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET are missing in .env');
}

// Token cache
let tokenStore = { accessToken: null, expiresAt: 0 };

async function getZoomAccessToken() {
  const now = Date.now();
  const buffer = 5 * 60 * 1000;
  if (tokenStore.accessToken && now < tokenStore.expiresAt - buffer) {
    return tokenStore.accessToken;
  }

  const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const params = qs.stringify({ grant_type: 'account_credentials', account_id: ZOOM_ACCOUNT_ID });

  const response = await axios.post('https://zoom.us/oauth/token', params, {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  tokenStore.accessToken = response.data.access_token;
  tokenStore.expiresAt = Date.now() + response.data.expires_in * 1000;
  return tokenStore.accessToken;
}

// Batch fetch user details (job title, phone)
async function fetchUserDetails(users, headers) {
  const detailMap = {};
  const batchSize = 10;

  for (let i = 0; i < users.length; i += batchSize) {
    const slice = users.slice(i, i + batchSize);
    const results = await Promise.all(
      slice.map(async (user) => {
        try {
          const { data } = await axios.get(`https://api.zoom.us/v2/users/${user.id}`, { headers });
          return { id: user.id, data };
        } catch (err) {
          console.warn(`User detail failed: ${user.id} (${err?.response?.status || err.message})`);
          return { id: user.id, data: null };
        }
      })
    );
    results.forEach(({ id, data }) => {
      if (data) detailMap[id] = data;
    });
  }
  return detailMap;
}

// Main API
app.get('/api/users', async (req, res) => {
  try {
    const accessToken = await getZoomAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 1) basic users
    const basicRes = await axios.get('https://api.zoom.us/v2/users?page_size=300&status=active', {
      headers,
    });
    const basicUsers = basicRes.data.users || [];

    // 2) zoom phone users (extension)
    let phoneUsers = [];
    try {
      const phoneRes = await axios.get('https://api.zoom.us/v2/phone/users?page_size=300', {
        headers,
      });
      phoneUsers = phoneRes.data.users || [];
    } catch (e) {
      // ignore if no permission
    }
    const phoneMap = {};
    phoneUsers.forEach((p) => {
      phoneMap[p.email] = p.extension_number;
    });

    // 3) detail info
    const detailMap = await fetchUserDetails(basicUsers, headers);

    const users = basicUsers.map((user) => {
      const detail = detailMap[user.id] || {};
      const mobileEntry = (detail.phone_numbers || []).find((p) => {
        const type = (p.type || p.label || '').toLowerCase();
        return type === 'mobile';
      });
      const extension = phoneMap[user.email] || '';
      const mobileNumber = mobileEntry?.number || detail.phone_number || user.phone_number || '';

      return {
        id: user.id,
        name: `${user.last_name}${user.first_name}`,
        email: user.email,
        department: (detail.dept || user.dept || '').split('/')[0].trim(),
        job_title: detail.job_title || user.job_title || '',
        extension,
        phone: mobileNumber,
      };
    });

    res.json(users);
  } catch (error) {
    console.error('API error:', error.message);
    res.status(500).json({ error: 'Data Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
