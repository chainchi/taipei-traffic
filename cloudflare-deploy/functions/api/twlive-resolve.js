// Cloudflare Pages Function: /api/twlive-resolve
// tw.live is a public aggregator of Taiwan government traffic cameras — its
// pages embed the camera's real .m3u8 URL, but the page itself isn't a
// playable media file. This resolves a tw.live camera page server-side and
// extracts the direct stream URL for the frontend to play.

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const ID_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;

export async function onRequest(context) {
    if (context.request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(context.request.url);
    const camId = url.searchParams.get('id');

    if (!camId || !ID_PATTERN.test(camId)) {
        return jsonResponse({ ok: false, error: 'Invalid or missing camera id' }, 400);
    }

    try {
        const pageUrl = `https://tw.live/cam/?id=${encodeURIComponent(camId)}`;
        const resp = await fetch(pageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
        });

        if (!resp.ok) {
            return jsonResponse({ ok: false, error: `tw.live returned ${resp.status}` }, 502);
        }

        const html = await resp.text();
        const match = html.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/);

        if (!match) {
            return jsonResponse({ ok: false, error: 'No stream URL found for this camera' }, 404);
        }

        return jsonResponse({ ok: true, streamUrl: match[0] }, 200);
    } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
    }
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
