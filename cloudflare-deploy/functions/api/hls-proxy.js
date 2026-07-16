// Cloudflare Pages Function: /api/hls-proxy
// Proxies HLS streams from Taipei CCTV to bypass CORS
// Updated to use the /_api/camera/by-ccd/ endpoint to discover actual stream paths

const CCTV_BASE = 'https://hls.bote.gov.taipei';
const CCTV_LIVE_BASE = `${CCTV_BASE}/live`;
const CCTV_STREAM_BASE = `${CCTV_BASE}/stream`;

// Required headers that unlock stream access (hotlink protection)
const FETCH_HEADERS = {
    'Referer': `${CCTV_LIVE_BASE}/index.html`,
    'Origin': CCTV_BASE,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
};

// In-memory cache for camera stream paths (valid per worker instance lifecycle)
const streamCache = new Map();

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const params = url.searchParams;

    if (context.request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const action = params.get('action'); // 'init' | 'playlist' | 'segment'
    const camId = params.get('id');

    if (!camId || !/^\d{2,5}$/.test(camId)) {
        return jsonResponse({ error: 'Invalid camera ID' }, 400);
    }

    try {
        if (action === 'init') {
            return await handleInit(camId);
        } else if (action === 'playlist') {
            return await handlePlaylist(camId, params);
        } else if (action === 'segment') {
            const file = params.get('file');
            return await handleSegment(camId, file);
        } else {
            return jsonResponse({ error: 'Invalid action. Use init, playlist, or segment' }, 400);
        }
    } catch (err) {
        console.error(`[hls-proxy] Error for cam ${camId}, action ${action}:`, err.message);
        return jsonResponse({ error: err.message }, 500);
    }
}

// Step 1: Discover the stream path via the official camera info API
async function resolveStreamUrl(camId) {
    // Return from cache if still valid
    const cached = streamCache.get(camId);
    if (cached && cached.expiry > Date.now()) {
        return cached.m3u8Url;
    }

    // Call the Taipei CCTV camera info API
    const apiUrl = `${CCTV_LIVE_BASE}/_api/camera/by-ccd/${camId}`;
    const resp = await fetch(apiUrl, { headers: FETCH_HEADERS });

    if (!resp.ok) {
        throw new Error(`Camera API returned ${resp.status} for cam ${camId}`);
    }

    const data = await resp.json();

    if (!data || data.state !== 'Responding') {
        throw new Error(`Camera ${camId} not responding (state: ${data?.state})`);
    }

    let m3u8Url;

    if (data.isLongTerm && data.longTermPath) {
        // Convert relative path like "../stream/145/index.m3u8" to absolute
        m3u8Url = data.longTermPath.startsWith('http')
            ? data.longTermPath
            : `${CCTV_BASE}/stream/${camId}/index.m3u8`;
    } else {
        // Fallback for non-long-term streams
        m3u8Url = `${CCTV_STREAM_BASE}/${camId}/index.m3u8`;
    }

    // Cache for 5 minutes
    streamCache.set(camId, { m3u8Url, expiry: Date.now() + 300_000 });
    return m3u8Url;
}

async function handleInit(camId) {
    try {
        const m3u8Url = await resolveStreamUrl(camId);
        return jsonResponse({
            ok: true,
            proxyPlaylist: `/api/hls-proxy?action=playlist&id=${camId}`,
            resolvedUrl: m3u8Url,
        }, 200);
    } catch (err) {
        return jsonResponse({
            ok: false,
            reason: err.message,
        }, 200);
    }
}

async function handlePlaylist(camId, params) {
    // Support sub-playlist (variant) URLs
    const subParam = params.get('sub');
    let targetUrl;

    if (subParam) {
        // Sub-playlist: resolve relative to the base stream folder
        const decoded = decodeURIComponent(subParam);
        targetUrl = decoded.startsWith('http')
            ? decoded
            : `${CCTV_STREAM_BASE}/${camId}/${decoded}`;
    } else {
        try {
            targetUrl = await resolveStreamUrl(camId);
        } catch (err) {
            return new Response(`Playlist error: ${err.message}`, { status: 502, headers: CORS_HEADERS });
        }
    }

    const resp = await fetch(targetUrl, { headers: FETCH_HEADERS });

    if (!resp.ok) {
        return new Response(`Upstream playlist returned ${resp.status}`, { status: 502, headers: CORS_HEADERS });
    }

    let body = await resp.text();

    // For very short sliding windows (≤3 segments ~2s each ≈ 6s total),
    // serve ONLY the latest segment to prevent 410 Gone expiry race conditions.
    const segmentPairs = []; // Each entry: { extinf, filename }
    const rawLines = body.split('\n');
    for (let i = 0; i < rawLines.length; i++) {
        if (rawLines[i].startsWith('#EXTINF')) {
            // Find the next non-empty, non-comment line (the segment filename)
            for (let j = i + 1; j < rawLines.length; j++) {
                const seg = rawLines[j].trim();
                if (seg && !seg.startsWith('#')) {
                    segmentPairs.push({ extinf: rawLines[i], filename: seg });
                    break;
                }
            }
        }
    }

    if (segmentPairs.length > 0 && segmentPairs.length <= 3) {
        const last = segmentPairs[segmentPairs.length - 1];
        const baseSeq = parseInt(body.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1] || '0', 10);
        const lastSeq = baseSeq + segmentPairs.length - 1;
        const targetDuration = body.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1] || '3';
        const version = body.match(/#EXT-X-VERSION:(\d+)/)?.[1] || '3';
        body = [
            '#EXTM3U',
            `#EXT-X-VERSION:${version}`,
            `#EXT-X-TARGETDURATION:${targetDuration}`,
            `#EXT-X-MEDIA-SEQUENCE:${lastSeq}`,
            last.extinf,
            last.filename,
        ].join('\n') + '\n';
    }

    // Rewrite .ts segment URLs to go through our proxy
    body = body.replace(/^(?!#)(.+\.ts\S*)/gm, (match) => {
        const file = match.trim();
        return `/api/hls-proxy?action=segment&id=${camId}&file=${encodeURIComponent(file)}`;
    });

    // Rewrite sub-playlist .m3u8 URLs
    body = body.replace(/^(?!#)(.+\.m3u8\S*)/gm, (match) => {
        const sub = match.trim();
        return `/api/hls-proxy?action=playlist&id=${camId}&sub=${encodeURIComponent(sub)}`;
    });

    return new Response(body, {
        status: 200,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
    });
}

async function handleSegment(camId, filename) {
    if (!filename) {
        return new Response('Missing file parameter', { status: 400, headers: CORS_HEADERS });
    }

    const decoded = decodeURIComponent(filename);

    // Build absolute segment URL
    let targetUrl;
    if (decoded.startsWith('http')) {
        targetUrl = decoded;
    } else if (decoded.startsWith('/')) {
        targetUrl = `${CCTV_BASE}${decoded}`;
    } else {
        // Relative segment — resolve against the stream base folder
        targetUrl = `${CCTV_STREAM_BASE}/${camId}/${decoded}`;
    }

    const resp = await fetch(targetUrl, { headers: FETCH_HEADERS });

    if (!resp.ok) {
        return new Response(`Segment fetch failed: ${resp.status}`, { status: resp.status, headers: CORS_HEADERS });
    }

    return new Response(resp.body, {
        status: 200,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'video/mp2t',
            'Cache-Control': 'no-store',
        },
    });
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
        },
    });
}
