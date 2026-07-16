const NEIHU_ZONES = [
    { name: "Xihu (Neihu Rd Sec 1)", roadMatch: "內湖路一段", status: "clear", speed: 40 },
    { name: "Xihu (Jihu Rd)", roadMatch: "基湖路", status: "heavy", speed: 25 },
    { name: "Zhouzi St", roadMatch: "洲子街", status: "clear", speed: 35 },
    { name: "Ruiguang Rd Ln 478", roadMatch: "瑞光路478巷", status: "jam", speed: 15 },
    { name: "Tiding Blvd", roadMatch: "堤頂大道", status: "heavy", speed: 30 }
];

// Elements
const speedEl = document.getElementById("avg-speed");
const congestionEl = document.getElementById("congestion-index");
const incidentsEl = document.getElementById("active-incidents");
const eventListEl = document.getElementById("event-list");
const timestampEl = document.getElementById("timestamp");

let currentZones = [...NEIHU_ZONES];
let vdMapping = {};
let cctvMapping = {};

// Initialize UI
async function init() {
    updateClock();
    setInterval(updateClock, 1000);

    try {
        const vdInfoRes = await fetch('http://localhost:8080/api/vd-info');
        if (vdInfoRes.ok) {
            const vdData = await vdInfoRes.json();
            if (vdData.VDs) {
                vdData.VDs.forEach(vd => { vdMapping[vd.VDID] = vd.RoadName; });
            }
        }

        const cctvInfoRes = await fetch('http://localhost:8080/api/cctv');
        if (cctvInfoRes.ok) {
            const cctvData = await cctvInfoRes.json();
            if (cctvData.CCTVs) {
                cctvData.CCTVs.forEach(c => {
                    if (c.RoadName) cctvMapping[c.RoadName] = c.VideoStreamURL;
                });
            }
        }
    } catch (e) { console.error("Failed mapping VDs/CCTVs:", e); }

    // Initial render
    updateDashboardData();
    renderEventList();

    // Fetch live feed data every 30 seconds
    fetchLiveFeed();
    setInterval(fetchLiveFeed, 30000);
}

function updateClock() {
    const now = new Date();
    timestampEl.innerText = now.toLocaleTimeString('en-US', { hour12: false });
}

async function fetchLiveFeed() {
    try {
        const response = await fetch('http://localhost:8080/api/traffic');
        if (!response.ok) throw new Error("Network response was not ok");

        const data = await response.json();

        if (data.simulation) {
            // Fallback simulation mode (no API keys provided yet)
            simulateLiveFeeds();
            return;
        }

        // Parse real Live VD data
        processVDData(data.VDLives || []);
    } catch (err) {
        console.error("Failed to fetch live feed:", err);
        // Fallback or show error
        simulateLiveFeeds();
    }
}

function processVDData(vdLives) {
    if (!vdLives || vdLives.length === 0) return;

    // A simplified map of link speeds based on real data
    // VD data usually has LinkFlows => [ { LaneFlows => [], Vehicles => [], TravelTime, TravelSpeed } ]

    // For demonstration, map random real VDLives to the zones to simulate real-time variation
    // In a full production app, we would map exact VD IDs to specific Neihu zones

    currentZones.forEach((zone, idx) => {
        // Find valid samples that have speed >= 0 AND match this zone's actual RoadName in Taipei!
        let validSamples = vdLives.filter(s => {
            const isSpeedValid = s.LinkFlows && s.LinkFlows[0] && s.LinkFlows[0].Lanes && s.LinkFlows[0].Lanes[0] && s.LinkFlows[0].Lanes[0].Speed >= 0;
            const roadName = vdMapping[s.VDID] || "";
            return isSpeedValid && roadName.includes(zone.roadMatch);
        });

        let newSpeed = zone.speed;

        if (validSamples.length > 0) {
            // Average the speeds of all functioning sensors on this specific road
            let sum = 0;
            validSamples.forEach(s => sum += s.LinkFlows[0].Lanes[0].Speed);
            newSpeed = Math.round(sum / validSamples.length);
        }

        zone.speed = newSpeed;

        // Define status
        if (newSpeed < 20) zone.status = "jam";
        else if (newSpeed < 40) zone.status = "heavy";
        else zone.status = "clear";
    });

    renderEventList();
    updateDashboardData();
}

function simulateLiveFeeds() {
    // Randomly fluctuate global metrics slightly
    const currentSpeed = parseInt(speedEl.innerText);
    const speedChange = Math.floor(Math.random() * 5) - 2; // -2 to +2
    const newSpeed = Math.max(15, Math.min(60, currentSpeed + speedChange));

    // Animate change
    animateNumberChange(speedEl, currentSpeed, newSpeed, 500);

    // Randomize one zone occasionally
    if (Math.random() > 0.6) {
        const idx = Math.floor(Math.random() * currentZones.length);
        const chance = Math.random();

        if (chance > 0.7) {
            currentZones[idx].status = "jam";
            currentZones[idx].speed = 10 + Math.floor(Math.random() * 10);
        } else if (chance > 0.3) {
            currentZones[idx].status = "heavy";
            currentZones[idx].speed = 20 + Math.floor(Math.random() * 15);
        } else {
            currentZones[idx].status = "clear";
            currentZones[idx].speed = 40 + Math.floor(Math.random() * 20);
        }

        renderEventList();
        updateDashboardData();
    }
}

function updateDashboardData() {
    // Calculate new metrics based on zones
    let totalSpeed = 0;
    let jamCount = 0;
    let heavyCount = 0;

    currentZones.forEach(zone => {
        totalSpeed += zone.speed;
        if (zone.status === "jam") jamCount++;
        if (zone.status === "heavy") heavyCount++;
    });

    const avgSpeed = Math.floor(totalSpeed / currentZones.length);
    const index = (1.0 + (jamCount * 0.4) + (heavyCount * 0.15)).toFixed(1);

    // Update DOM directly for small things
    congestionEl.innerHTML = `${index} <span class="unit">${index >= 2.0 ? 'high' : index > 1.3 ? 'med' : 'low'}</span>`;

    // Update incidents with a flash effect if it changed
    const incidentsCount = jamCount + (heavyCount > 2 ? 1 : 0);
    if (incidentsEl.innerText != incidentsCount) {
        incidentsEl.parentElement.parentElement.style.borderColor = "var(--status-danger)";
        setTimeout(() => {
            incidentsEl.parentElement.parentElement.style.borderColor = "var(--border-color)";
        }, 500);
    }
    incidentsEl.innerText = incidentsCount;
}

function renderEventList() {
    eventListEl.innerHTML = '';

    // Sort by severity
    const sortedZones = [...currentZones].sort((a, b) => {
        const severity = { "jam": 3, "heavy": 2, "clear": 1 };
        return severity[b.status] - severity[a.status];
    });

    sortedZones.forEach(zone => {
        const li = document.createElement("li");
        li.className = "event-item";

        let statusClass = "status-clear";
        let statusText = "Clear Flow";

        if (zone.status === "jam") {
            statusClass = "status-jam";
            statusText = "Gridlock";
        } else if (zone.status === "heavy") {
            statusClass = "status-heavy";
            statusText = "Heavy Traffic";
        }

        let cctvUrl = null;
        for (let roadName in cctvMapping) {
            if (roadName.includes(zone.roadMatch)) {
                cctvUrl = cctvMapping[roadName];
                break;
            }
        }
        let cctvButton = cctvUrl ? `<button class="cctv-btn" onclick="openCCTV('${cctvUrl}', '${zone.name}')">📹 Watch</button>` : '';

        li.innerHTML = `
            <span class="event-name">${zone.name}</span>
            <div style="display:flex; gap: 0.5rem; align-items:center;">
                ${cctvButton}
                <span class="event-status ${statusClass}">${statusText}</span>
            </div>
        `;
        eventListEl.appendChild(li);
    });
}

function animateNumberChange(element, start, end, duration) {
    if (start === end) return;

    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / range));

    const timer = setInterval(function () {
        current += increment;

        // Retain the unit span
        const unit = element.querySelector('.unit');
        const unitHtml = unit ? unit.outerHTML : '';
        element.innerHTML = `${current} ${unitHtml}`;

        if (current == end) {
            clearInterval(timer);
        }
    }, stepTime);
}

// ──────────── AI Pedestrian Detection ────────────────────────────────────────
let aiModel = null;
let aiAnimFrame = null;
let hlsInstance = null;
let pedCount = 0;

// Zebra crossing zone (normalized 0-1 coordinates, updated by draw interaction)
let zebraZone = { x: 0.20, y: 0.58, w: 0.60, h: 0.32 };
let isDrawingZone = false;
let drawStart = null;  // { x, y } in normalized coords

// Pre-load COCO-SSD model in the background
async function loadAIModel() {
    try {
        aiModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        const statusEl = document.getElementById('ai-status');
        if (statusEl) { statusEl.textContent = '✓ AI READY'; statusEl.style.color = '#00ff88'; }
    } catch (e) { console.warn('COCO-SSD failed to load:', e); }
}
loadAIModel();

window.openCCTV = async function (url, name) {
    document.getElementById('modal-title').innerText = `${name} · Live`;
    document.getElementById('video-modal').classList.remove('hidden');
    document.getElementById('ped-counter').textContent = '0';
    pedCount = 0;

    const iframe = document.getElementById('cctv-iframe');
    const video = document.getElementById('cctv-video');
    const canvas = document.getElementById('ai-canvas');
    const statusEl = document.getElementById('ai-status');

    // Reset previous session
    stopAI();
    iframe.src = '';
    video.src = '';
    video.style.display = 'none';
    iframe.style.display = 'block';

    // Extract camera id from URL  e.g. ...?id=109 → "109"
    const idMatch = url.match(/[?&]id=(\d+)/);
    const camId = idMatch ? idMatch[1].padStart(3, '0') : null;

    if (camId && aiModel) {
        if (statusEl) { statusEl.textContent = '⏳ CONNECTING…'; statusEl.style.color = '#ffaa00'; }
        try {
            const initRes = await fetch(`http://localhost:8080/api/stream-init/${camId}`);
            const initData = await initRes.json();

            if (initData.ok && initData.proxyUrl) {
                // Got a proxied HLS stream — use native video + AI canvas
                iframe.style.display = 'none';
                video.style.display = 'block';

                if (Hls.isSupported()) {
                    // Ensure video is not tainted for TF.js canvas reads
                    video.crossOrigin = 'anonymous';

                    hlsInstance = new Hls({ maxBufferLength: 6, lowLatencyMode: false, enableWorker: true });
                    hlsInstance.loadSource('http://localhost:8080' + initData.proxyUrl + '?t=' + Date.now());
                    hlsInstance.attachMedia(video);
                    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                        video.play();
                    });

                    // Wait for first actual frame decode (readyState >= 2)
                    video.addEventListener('loadeddata', () => {
                        console.log(`[HLS] First frame decoded: ${video.videoWidth}x${video.videoHeight}`);
                        alignCanvasToVideo(video, canvas);
                        if (statusEl) { statusEl.textContent = '🧠 AI ACTIVE'; statusEl.style.color = '#00ff88'; }
                        startAILoop(video, canvas);
                    }, { once: true });

                    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                        console.warn('[HLS] Error:', data.type, data.details);
                    });
                }
            } else {
                // Proxy couldn't get stream — fall back to iframe player + AI overlay note
                iframe.src = url;
                if (statusEl) { statusEl.textContent = '📺 STREAM ONLY'; statusEl.style.color = '#8a9fc2'; }
            }
        } catch (e) {
            // Network error — simply show the iframe
            iframe.src = url;
            if (statusEl) { statusEl.textContent = '📺 STREAM ONLY'; statusEl.style.color = '#8a9fc2'; }
        }
    } else {
        // No camera ID or model not ready — iframe mode
        iframe.src = url;
    }
};

function startAILoop(videoEl, canvasEl) {
    const ctx = canvasEl.getContext('2d');
    let frameIdx = 0;

    // Color scheme
    const PERSON_COLOR = '#00f3ff';
    const VEHICLE_CLASSES = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
    const VEHICLE_COLOR = '#ffcc00';
    const OTHER_COLOR = 'rgba(150,160,180,0.5)';

    // ─── Simple Centroid Tracker ─────────────────────────────────
    // Assigns persistent IDs to detections across frames.
    // Survives up to MAX_MISSING frames of non-detection.
    // Smooths bbox with exponential moving average.
    const MAX_MISSING = 15;       // frames before a track is dropped
    const MATCH_DIST = 80;        // max centroid distance (pixels) to match
    const SMOOTH = 0.35;          // EMA factor (0=fully smooth, 1=no smooth)
    let nextTrackId = 1;
    let tracks = [];              // { id, cx, cy, bbox:[x,y,w,h], score, missing, smoothBbox }
    const enteredZoneIds = new Set();  // IDs that have already been counted

    function centroid(bbox) {
        return { cx: bbox[0] + bbox[2] / 2, cy: bbox[1] + bbox[3] / 2 };
    }

    function updateTracks(rawPersons) {
        // Mark all tracks as unmatched
        const matched = new Set();
        const usedDets = new Set();

        // Greedy nearest-neighbor matching
        const pairs = [];
        for (let ti = 0; ti < tracks.length; ti++) {
            for (let di = 0; di < rawPersons.length; di++) {
                const t = tracks[ti];
                const d = rawPersons[di];
                const dc = centroid(d.bbox);
                const dist = Math.hypot(t.cx - dc.cx, t.cy - dc.cy);
                if (dist < MATCH_DIST) {
                    pairs.push({ ti, di, dist });
                }
            }
        }
        pairs.sort((a, b) => a.dist - b.dist);

        for (const { ti, di } of pairs) {
            if (matched.has(ti) || usedDets.has(di)) continue;
            matched.add(ti);
            usedDets.add(di);

            const t = tracks[ti];
            const d = rawPersons[di];
            const dc = centroid(d.bbox);

            // Update centroid
            t.cx = dc.cx;
            t.cy = dc.cy;
            t.score = d.score;
            t.missing = 0;

            // Smooth bbox with EMA
            t.smoothBbox = [
                t.smoothBbox[0] * (1 - SMOOTH) + d.bbox[0] * SMOOTH,
                t.smoothBbox[1] * (1 - SMOOTH) + d.bbox[1] * SMOOTH,
                t.smoothBbox[2] * (1 - SMOOTH) + d.bbox[2] * SMOOTH,
                t.smoothBbox[3] * (1 - SMOOTH) + d.bbox[3] * SMOOTH,
            ];
        }

        // Increment missing counter for unmatched tracks
        for (let ti = 0; ti < tracks.length; ti++) {
            if (!matched.has(ti)) {
                tracks[ti].missing++;
            }
        }

        // Create new tracks for unmatched detections
        for (let di = 0; di < rawPersons.length; di++) {
            if (usedDets.has(di)) continue;
            const d = rawPersons[di];
            const dc = centroid(d.bbox);
            tracks.push({
                id: nextTrackId++,
                cx: dc.cx, cy: dc.cy,
                bbox: [...d.bbox],
                score: d.score,
                missing: 0,
                smoothBbox: [...d.bbox]
            });
        }

        // Remove tracks missing too long
        tracks = tracks.filter(t => t.missing <= MAX_MISSING);
    }
    // ─────────────────────────────────────────────────────────────

    console.log('[AI] Detection loop started (with tracker)');

    async function frame() {
        if (!videoEl || videoEl.paused || videoEl.ended || !aiModel) {
            aiAnimFrame = requestAnimationFrame(frame);
            return;
        }
        if (videoEl.readyState < 2) {
            aiAnimFrame = requestAnimationFrame(frame);
            return;
        }

        try {
            const predictions = await aiModel.detect(videoEl);
            const W = canvasEl.width;
            const H = canvasEl.height;

            if (W === 0 || H === 0) {
                if (videoEl.videoWidth && videoEl.videoHeight) {
                    canvasEl.width = videoEl.videoWidth;
                    canvasEl.height = videoEl.videoHeight;
                }
                aiAnimFrame = requestAnimationFrame(frame);
                return;
            }

            ctx.clearRect(0, 0, W, H);
            frameIdx++;

            // ─── Draw Zebra Crossing Zone ──────────────────────────────
            const zx = zebraZone.x * W, zy = zebraZone.y * H, zw = zebraZone.w * W, zh = zebraZone.h * H;

            ctx.save();
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = '#00f3ff';
            ctx.fillRect(zx, zy, zw, zh);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = 0.22;
            const stripeW = Math.max(8, zw / 20);
            const gap = stripeW * 0.8;
            for (let sx = zx; sx < zx + zw; sx += stripeW + gap) {
                const sw = Math.min(stripeW, zx + zw - sx);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(sx, zy, sw, zh);
            }
            ctx.restore();

            const dashOffset = (frameIdx * 0.8) % 20;
            ctx.save();
            ctx.setLineDash([10, 5]);
            ctx.lineDashOffset = -dashOffset;
            ctx.strokeStyle = '#00f3ff';
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#00f3ff';
            ctx.strokeRect(zx, zy, zw, zh);
            ctx.globalAlpha = 0.4;
            ctx.shadowBlur = 28;
            ctx.strokeRect(zx, zy, zw, zh);
            ctx.restore();

            const cornerLen = Math.min(20, zw * 0.06, zh * 0.15);
            ctx.save();
            ctx.strokeStyle = '#00f3ff'; ctx.lineWidth = 3;
            ctx.shadowBlur = 8; ctx.shadowColor = '#00f3ff'; ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(zx, zy + cornerLen); ctx.lineTo(zx, zy); ctx.lineTo(zx + cornerLen, zy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(zx + zw - cornerLen, zy); ctx.lineTo(zx + zw, zy); ctx.lineTo(zx + zw, zy + cornerLen); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(zx, zy + zh - cornerLen); ctx.lineTo(zx, zy + zh); ctx.lineTo(zx + cornerLen, zy + zh); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(zx + zw - cornerLen, zy + zh); ctx.lineTo(zx + zw, zy + zh); ctx.lineTo(zx + zw, zy + zh - cornerLen); ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.font = 'bold 12px monospace';
            const labelText = '⛔ ZEBRA CROSSING';
            const labelW = ctx.measureText(labelText).width + 16;
            const labelH = 22;
            const labelX = zx + (zw - labelW) / 2;
            const labelY = zy - labelH - 4;
            ctx.fillStyle = 'rgba(0, 20, 40, 0.85)';
            ctx.beginPath(); ctx.roundRect(labelX, labelY, labelW, labelH, 6); ctx.fill();
            ctx.strokeStyle = '#00f3ff'; ctx.lineWidth = 1;
            ctx.shadowBlur = 6; ctx.shadowColor = '#00f3ff'; ctx.stroke();
            ctx.fillStyle = '#00f3ff'; ctx.shadowBlur = 0;
            ctx.fillText(labelText, labelX + 8, labelY + 15);
            ctx.restore();

            // ─── Separate persons from other objects ─────────────────
            const rawPersons = predictions.filter(p => p.class === 'person' && p.score > 0.15);
            const vehicles = predictions.filter(p => VEHICLE_CLASSES.includes(p.class) && p.score > 0.25);
            const others = predictions.filter(p => p.class !== 'person' && !VEHICLE_CLASSES.includes(p.class) && p.score > 0.35);

            // ─── Update tracker with this frame's person detections ──
            updateTracks(rawPersons);

            // ─── Draw vehicles (raw, no tracking needed) ─────────────
            vehicles.forEach(p => {
                const [x, y, w, h] = p.bbox;
                ctx.strokeStyle = VEHICLE_COLOR; ctx.lineWidth = 1.5;
                ctx.shadowBlur = 6; ctx.shadowColor = VEHICLE_COLOR;
                ctx.strokeRect(x, y, w, h);
                const label = `🚗 ${p.class} ${(p.score * 100).toFixed(0)}%`;
                ctx.font = '12px Inter, sans-serif';
                const tw = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(255,204,0,0.80)'; ctx.shadowBlur = 0;
                ctx.fillRect(x, y - 20, tw + 10, 20);
                ctx.fillStyle = '#000';
                ctx.fillText(label, x + 5, y - 5);
            });

            // ─── Draw other objects ──────────────────────────────────
            others.forEach(p => {
                const [x, y, w, h] = p.bbox;
                ctx.strokeStyle = OTHER_COLOR; ctx.lineWidth = 1; ctx.shadowBlur = 0;
                ctx.strokeRect(x, y, w, h);
            });

            // ─── Draw tracked persons (smoothed, stable) ────────────
            let inZoneNow = 0;
            const activeTracks = tracks.filter(t => t.missing <= 3); // only draw recent tracks

            activeTracks.forEach(t => {
                const [x, y, w, h] = t.smoothBbox;
                const foot_x = x + w / 2, foot_y = y + h;
                const inside = foot_x > zx && foot_x < zx + zw && foot_y > zy && foot_y < zy + zh;

                if (inside) {
                    inZoneNow++;
                    // Count this person only ONCE ever
                    if (!enteredZoneIds.has(t.id)) {
                        enteredZoneIds.add(t.id);
                        pedCount++;
                        console.log(`[Tracker] Person #${t.id} entered zone — total: ${pedCount}`);
                    }
                }

                // Fade out tracks that are missing (ghost effect)
                const alpha = t.missing === 0 ? 1.0 : Math.max(0.3, 1 - t.missing * 0.2);
                ctx.save();
                ctx.globalAlpha = alpha;

                ctx.strokeStyle = inside ? '#00ff88' : PERSON_COLOR;
                ctx.lineWidth = inside ? 3 : 2;
                ctx.shadowBlur = inside ? 14 : 8;
                ctx.shadowColor = inside ? '#00ff88' : PERSON_COLOR;
                ctx.strokeRect(x, y, w, h);

                // Label with track ID and confidence
                const label = `🧍 #${t.id} ${(t.score * 100).toFixed(0)}%`;
                ctx.font = '12px Inter, sans-serif';
                const tw = ctx.measureText(label).width;
                ctx.fillStyle = inside ? 'rgba(0,255,136,0.85)' : 'rgba(0,243,255,0.85)';
                ctx.shadowBlur = 0;
                ctx.fillRect(x, y - 20, tw + 10, 20);
                ctx.fillStyle = '#000';
                ctx.fillText(label, x + 5, y - 5);
                ctx.restore();
            });

            document.getElementById('ped-counter').textContent = pedCount;

            // ─── HUD status bar ──────────────────────────────────────
            ctx.save();
            ctx.fillStyle = 'rgba(0,255,136,0.9)';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`● AI ACTIVE  |  ${activeTracks.length} tracked  |  ${inZoneNow} in zone  |  ${pedCount} crossed`, 8, 16);
            ctx.restore();

            // Periodic debug log
            if (frameIdx % 90 === 1) {
                console.log(`[AI] Frame #${frameIdx} — ${rawPersons.length} raw persons → ${tracks.length} tracks (${activeTracks.length} active)`);
            }

        } catch (err) {
            if (!frame._lastErr || frame._lastErr !== err.message) {
                console.error('[AI] Detection error:', err.message);
                frame._lastErr = err.message;
            }
        }

        aiAnimFrame = requestAnimationFrame(frame);
    }
    aiAnimFrame = requestAnimationFrame(frame);
}

function stopAI() {
    if (aiAnimFrame) { cancelAnimationFrame(aiAnimFrame); aiAnimFrame = null; }
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
}

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('video-modal').classList.add('hidden');
    document.getElementById('cctv-iframe').src = '';
    document.getElementById('cctv-video').src = '';
    stopAI();
});

// Align canvas bounds to the actual letterboxed/pillarboxed video content box
function alignCanvasToVideo(video, canvas) {
    if (!video.videoWidth || !video.videoHeight) return;
    const videoRatio = video.videoWidth / video.videoHeight;
    const elementWidth = video.clientWidth;
    const elementHeight = video.clientHeight;
    const elementRatio = elementWidth / elementHeight;

    let width, height, top, left;

    if (elementRatio > videoRatio) {
        // Pillarboxed
        height = elementHeight;
        width = height * videoRatio;
        top = 0;
        left = (elementWidth - width) / 2;
    } else {
        // Letterboxed
        width = elementWidth;
        height = width / videoRatio;
        left = 0;
        top = (elementHeight - height) / 2;
    }

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.top = top + 'px';
    canvas.style.left = left + 'px';
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}

window.addEventListener('resize', () => {
    const video = document.getElementById('cctv-video');
    const canvas = document.getElementById('ai-canvas');
    if (video && canvas && video.style.display !== 'none') {
        alignCanvasToVideo(video, canvas);
    }
});

// ──────────── Draw Zone Interaction ──────────────────────────────────────────
(function setupDrawZone() {
    const btn = document.getElementById('draw-zone-btn');
    const canvas = document.getElementById('ai-canvas');
    if (!btn || !canvas) return;

    // Instruction overlay (shown during draw mode)
    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'draw-zone-instruction';
    instructionDiv.style.cssText = `
        position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        background:rgba(0,20,40,0.92); border:1px solid #00f3ff; border-radius:10px;
        padding:16px 28px; color:#00f3ff; font-family:'Orbitron',monospace;
        font-size:0.85rem; letter-spacing:1.5px; z-index:20; pointer-events:none;
        text-align:center; line-height:1.8; display:none;
        box-shadow: 0 0 30px rgba(0,243,255,0.3);
    `;
    instructionDiv.innerHTML = '🖱️ CLICK & DRAG to draw zebra crossing<br><span style="font-size:0.65rem; color:#8a9fc2;">Release to confirm · ESC to cancel</span>';
    canvas.parentElement.appendChild(instructionDiv);

    btn.addEventListener('click', () => {
        if (isDrawingZone) {
            // Cancel drawing mode
            exitDrawMode();
            return;
        }
        // Enter drawing mode
        isDrawingZone = true;
        drawStart = null;
        canvas.style.pointerEvents = 'auto';
        canvas.style.cursor = 'crosshair';
        btn.style.background = 'rgba(255,100,100,0.3)';
        btn.style.borderColor = '#ff6464';
        btn.style.color = '#ff6464';
        btn.textContent = '❌ CANCEL';
        instructionDiv.style.display = 'block';
    });

    function exitDrawMode() {
        isDrawingZone = false;
        drawStart = null;
        canvas.style.pointerEvents = 'none';
        canvas.style.cursor = 'default';
        btn.style.background = 'rgba(0,243,255,0.1)';
        btn.style.borderColor = '#00f3ff';
        btn.style.color = '#00f3ff';
        btn.textContent = '✏️ DRAW ZONE';
        instructionDiv.style.display = 'none';
    }

    // Convert mouse event to normalized 0-1 coordinates relative to canvas
    function mouseToNorm(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        if (!isDrawingZone) return;
        e.preventDefault();
        drawStart = mouseToNorm(e);
        instructionDiv.style.display = 'none';
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawingZone || !drawStart) return;
        e.preventDefault();
        const cur = mouseToNorm(e);
        // Update zebraZone as user drags (live preview via detection loop)
        zebraZone = {
            x: Math.min(drawStart.x, cur.x),
            y: Math.min(drawStart.y, cur.y),
            w: Math.abs(cur.x - drawStart.x),
            h: Math.abs(cur.y - drawStart.y)
        };
    });

    canvas.addEventListener('mouseup', (e) => {
        if (!isDrawingZone || !drawStart) return;
        e.preventDefault();
        const cur = mouseToNorm(e);
        zebraZone = {
            x: Math.min(drawStart.x, cur.x),
            y: Math.min(drawStart.y, cur.y),
            w: Math.abs(cur.x - drawStart.x),
            h: Math.abs(cur.y - drawStart.y)
        };
        // Reject tiny accidental clicks (less than 2% in any dimension)
        if (zebraZone.w < 0.02 || zebraZone.h < 0.02) {
            console.log('[Zone] Too small, ignoring');
            drawStart = null;
            return;
        }
        console.log(`[Zone] New zebra crossing zone: x=${zebraZone.x.toFixed(3)} y=${zebraZone.y.toFixed(3)} w=${zebraZone.w.toFixed(3)} h=${zebraZone.h.toFixed(3)}`);
        // Reset counter for the new zone
        pedCount = 0;
        document.getElementById('ped-counter').textContent = '0';
        exitDrawMode();
    });

    // ESC to cancel
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDrawingZone) {
            exitDrawMode();
        }
    });
})();

// Boot up
document.addEventListener("DOMContentLoaded", init);
