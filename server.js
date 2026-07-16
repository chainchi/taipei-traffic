require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
// Serve the FloodWatch app from cloudflare-deploy/public
app.use(express.static(path.join(__dirname, 'cloudflare-deploy', 'public')));


const PORT = process.env.PORT || 8080;
const CLIENT_ID = process.env.TDX_CLIENT_ID;
const CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error("Missing TDX API credentials in .env file.");
    }

    try {
        const response = await axios.post(
            'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
            qs.stringify({
                grant_type: 'client_credentials',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        accessToken = response.data.access_token;
        // Subtract a grace period (e.g. 60 seconds)
        tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
        return accessToken;
    } catch (error) {
        console.error("Failed to fetch TDX token:", error.response ? error.response.data : error.message);
        throw error;
    }
}

app.get('/api/traffic', async (req, res) => {
    try {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            // Fallback simulation mode if no keys are provided yet
            console.log("No TDX keys found, falling back to simulated data...");
            return res.json({ simulation: true });
        }

        const token = await getAccessToken();

        // Fetch Real-time VD data for Taipei City
        const response = await axios.get(
            'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/VD/City/Taipei?$format=JSON&$top=100',
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error("Error fetching traffic data:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Failed to fetch live traffic data" });
    }
});

app.get('/api/vd-info', async (req, res) => {
    try {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            return res.json({ simulation: true });
        }
        const token = await getAccessToken();
        const response = await axios.get(
            'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/VD/City/Taipei?$format=JSON',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching static VD data:", error.message);
        res.status(500).json({ error: "Failed to fetch VD static data" });
    }
});

app.get('/api/cctv', async (req, res) => {
    try {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            console.log("No TDX credentials, loading cached CCTV data...");
            const cachePath = path.join(__dirname, 'cctv_cache.json');
            const cacheData = fs.readFileSync(cachePath, 'utf8');
            return res.json(JSON.parse(cacheData));
        }
        const token = await getAccessToken();
        const response = await axios.get(
            'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/City/Taipei?$format=JSON',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching CCTV data, falling back to cache:", error.message);
        try {
            const cachePath = path.join(__dirname, 'cctv_cache.json');
            const cacheData = fs.readFileSync(cachePath, 'utf8');
            res.json(JSON.parse(cacheData));
        } catch (cacheError) {
            console.error("Failed to read CCTV cache:", cacheError.message);
            res.status(500).json({ error: "Failed to fetch CCTV data and cache unavailable" });
        }
    }
});

// ── HLS Stream Proxy ─────────────────────────────────────────
const CCTV_BASE = 'https://hls.bote.gov.taipei';
const CCTV_LIVE_BASE = `${CCTV_BASE}/live`;
const CCTV_STREAM_BASE = `${CCTV_BASE}/stream`;

const FETCH_HEADERS = {
    'Referer': `${CCTV_LIVE_BASE}/index.html`,
    'Origin': CCTV_BASE,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// Cache resolved stream URLs (5 minute TTL)
const streamCache = new Map();

async function resolveStreamUrl(camId) {
    const cached = streamCache.get(camId);
    if (cached && cached.expiry > Date.now()) return cached.m3u8Url;

    const apiUrl = `${CCTV_LIVE_BASE}/_api/camera/by-ccd/${camId}`;
    const resp = await axios.get(apiUrl, { headers: FETCH_HEADERS });
    const data = resp.data;

    if (!data || data.state !== 'Responding') {
        throw new Error(`Camera ${camId} not responding (state: ${data?.state})`);
    }

    const m3u8Url = `${CCTV_STREAM_BASE}/${camId}/index.m3u8`;
    streamCache.set(camId, { m3u8Url, expiry: Date.now() + 300_000 });
    return m3u8Url;
}

app.get('/api/hls-proxy', async (req, res) => {
    const action = req.query.action;
    const camId = req.query.id;
    if (!camId || !/^\d{2,5}$/.test(camId)) {
        return res.status(400).json({ error: 'Invalid camera ID' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        if (action === 'init') {
            try {
                await resolveStreamUrl(camId);
                return res.json({
                    ok: true,
                    proxyPlaylist: `/api/hls-proxy?action=playlist&id=${camId}`
                });
            } catch (err) {
                return res.json({ ok: false, reason: err.message });
            }
        }

        if (action === 'playlist') {
            const subParam = req.query.sub;
            let targetUrl;
            if (subParam) {
                const decoded = decodeURIComponent(subParam);
                targetUrl = decoded.startsWith('http') ? decoded : `${CCTV_STREAM_BASE}/${camId}/${decoded}`;
            } else {
                targetUrl = await resolveStreamUrl(camId);
            }

            const resp = await axios.get(targetUrl, { headers: FETCH_HEADERS });
            let body = resp.data;
            body = body.replace(/^(?!#)(.+\.ts\S*)/gm, (match) =>
                `/api/hls-proxy?action=segment&id=${camId}&file=${encodeURIComponent(match.trim())}`);
            body = body.replace(/^(?!#)(.+\.m3u8\S*)/gm, (match) =>
                `/api/hls-proxy?action=playlist&id=${camId}&sub=${encodeURIComponent(match.trim())}`);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-store');
            return res.send(body);
        }

        if (action === 'segment') {
            const decoded = decodeURIComponent(req.query.file || '');
            const targetUrl = decoded.startsWith('http') ? decoded : `${CCTV_STREAM_BASE}/${camId}/${decoded}`;
            const resp = await axios.get(targetUrl, { responseType: 'arraybuffer', headers: FETCH_HEADERS });
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Cache-Control', 'no-store');
            return res.send(resp.data);
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (e) {
        console.error(`[hls-proxy] cam=${camId} action=${action}:`, e.message);
        return res.status(502).json({ error: e.message });
    }
});

// ── Flood Recording Endpoints ───────────────────────────────────
const RECORDINGS_DIR = path.join(__dirname, 'recordings');

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Serve recordings statically
app.use('/recordings', express.static(RECORDINGS_DIR));

// Upload a recording chunk/blob
app.post('/api/recording/save', express.raw({ type: 'video/webm', limit: '200mb' }), (req, res) => {
    const filename = req.query.filename;
    if (!filename || !/^[\w\-\.]+$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    const filepath = path.join(RECORDINGS_DIR, filename);
    fs.writeFileSync(filepath, req.body);
    const sizeMB = (req.body.length / (1024 * 1024)).toFixed(2);
    console.log(`[recording] Saved: ${filename} (${sizeMB} MB)`);
    res.json({ ok: true, filename, sizeMB, path: `/recordings/${filename}` });
});

// List all recordings
app.get('/api/recordings', (req, res) => {
    try {
        const files = fs.readdirSync(RECORDINGS_DIR)
            .filter(f => f.endsWith('.webm'))
            .map(f => {
                const stats = fs.statSync(path.join(RECORDINGS_DIR, f));
                return {
                    filename: f,
                    sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
                    created: stats.birthtime,
                    url: `/recordings/${f}`
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));
        res.json(files);
    } catch (err) {
        res.json([]);
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    if (!CLIENT_ID) {
        console.warn("WARNING: TDX_CLIENT_ID and TDX_CLIENT_SECRET not set in .env. Proxy will return fallback simulated data.");
    }
});

