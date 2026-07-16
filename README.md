# 🗺️ NeihuNexus — Taipei Smart Traffic & Flood Watch

A real-time urban intelligence platform for **Neihu District, Taipei**, combining live traffic monitoring, CCTV-based AI pedestrian detection, and computer vision flood risk analysis — all in a dark-mode, glassmorphic web dashboard.

**Author:** Lawrence Chen

---

## ✨ Features at a Glance

| Feature | Description |
|---|---|
| 🗺️ **Live Traffic Map** | Google Maps traffic layer centered on Xihu Market, Neihu |
| 📡 **Real-time VD Data** | Pulls sensor data from Taiwan's TDX API every 30 seconds |
| 📹 **CCTV Live Feed** | Opens HLS-proxied CCTV streams from Taipei City cameras |
| 🧠 **AI Pedestrian Detection** | TensorFlow.js COCO-SSD detects & tracks people on live video |
| 🦓 **Zebra Crossing Zone** | Draw a custom ROI — counts every unique pedestrian who crosses |
| 🌊 **FloodWatch AI** | Frame-by-frame color analysis to detect flood water in CCTV feeds |
| 🎥 **Recording** | Record flood events to `.webm` files, stored and playable on-demand |
| ☁️ **Cloudflare Pages** | Frontend deployed via Cloudflare Pages + Wrangler |

---

## 📁 Project Structure

```
taipei-traffic/
├── index.html            # Main traffic dashboard (NeihuNexus)
├── styles.css            # Shared glassmorphic CSS design system
├── script.js             # Dashboard logic: TDX polling, CCTV modal, AI pedestrian tracker
├── server.js             # Express proxy server (TDX API, HLS proxy, recording API)
├── ai-detector.html      # Standalone Xihu AI Pedestrian Detection page
├── flood-detector.html   # FloodWatch AI — CCTV flood risk analysis
├── cctv_cache.json       # Cached CCTV metadata (fallback when no API key)
├── cloudflare-deploy/    # Cloudflare Pages deployment
│   ├── public/           # Static files served by Cloudflare Pages
│   └── functions/        # Cloudflare Worker functions (HLS proxy, etc.)
├── recordings/           # Saved flood event recordings (.webm)
├── deploy.sh             # Cloudflare Pages deployment script
├── package.json          # Node.js dependencies
└── .env                  # TDX API credentials (not committed)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ and **npm**
- A free [TDX API account](https://tdx.transportdata.tw/) (optional — falls back to simulation)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
TDX_CLIENT_ID=your_tdx_client_id
TDX_CLIENT_SECRET=your_tdx_client_secret
PORT=8080
```

> **Note:** If you skip this step, the server will fall back to **simulation mode** for traffic data and use the bundled `cctv_cache.json` for camera listings. All other features still work.

### 3. Start the Backend Server

```bash
node server.js
```

The server starts at **http://localhost:8080**.

### 4. Open the Dashboard

Open any of the following HTML files directly in your browser (they connect to `localhost:8080`):

| Page | URL |
|---|---|
| Traffic Dashboard | `http://localhost:8080/index.html` |
| Flood Detector | `http://localhost:8080/flood-detector.html` |
| AI Pedestrian Detector | `http://localhost:8080/ai-detector.html` |

---

## 🧩 Application Pages

### 🗺️ `index.html` — NeihuNexus Traffic Dashboard

The main command center for Neihu District traffic.

**Key features:**
- Embedded Google Maps with live traffic layer (dark mode)
- Glassmorphic sidebar with real-time widgets:
  - **Avg Speed** — animated km/h counter derived from VD sensor averages
  - **Congestion Index** — computed from jam/heavy zone counts
  - **Active Incidents** — flashes red when new incidents appear
- **Active Zones panel** — sorted by severity (Gridlock → Heavy → Clear)
- **📹 Watch button** — opens a CCTV modal for any zone that has a camera
- **AI Canvas overlay** — TensorFlow.js COCO-SSD runs on the live CCTV stream, detecting and tracking people with persistent IDs
- **✏️ Draw Zone** — click to draw a custom zebra crossing ROI; pedestrian crossing count resets automatically

**Traffic data flow:**
1. On load, fetches VD static info (`/api/vd-info`) to build a `VDID → RoadName` map
2. Fetches CCTV metadata (`/api/cctv`) to build a `RoadName → StreamURL` map
3. Every 30 s, polls `/api/traffic` for live VD speed readings
4. Matches readings to the 5 predefined Neihu zones by road name; falls back to animated simulation if no API keys are set

---

### 🌊 `flood-detector.html` — FloodWatch AI

Real-time flood risk analysis using pure client-side computer vision — **no ML model required**.

**Key features:**
- Select a CCTV camera from a built-in list of Neihu flood-prone locations
- Or paste any HLS (`.m3u8`) or MP4 stream URL
- Or use your **webcam**
- **Frame color analysis** — samples a configurable sensor zone and measures the proportion of blue/gray/brown water-colored pixels vs. normal asphalt/ground
- **Flood Risk Gauge** — animated circular gauge (0–100%), color-coded Safe → Low → Medium → High → Critical
- **Live metric cards** — Water %, Blue ratio, Frame brightness, Motion delta
- **Alert log** — timestamped event log with severity tagging
- **Baseline calibration** — capture a "dry" reference frame to tune false positive resistance
- **Zone drawing** — drag to define exactly which part of the frame to analyze
- **🔴 Recording** — record the live stream to `.webm` via the MediaRecorder API; uploads are saved to `/recordings/` on the backend

---

### 🧠 `ai-detector.html` — Xihu AI Pedestrian Tracking

A focused, standalone pedestrian analytics tool for the Xihu Market zebra crossing.

**Key features:**
- **TensorFlow.js COCO-SSD** (`lite_mobilenet_v2`) — runs entirely in the browser, no server needed
- Video sources: Webcam, video URL (MP4 / M3U8), or a sample demo video
- **Pedestrian count** — cumulative session counter of unique people who entered the zone
- **Live frame stats** — In Frame / In Zone / Peak counts
- **Zone drawing** — drag directly on the canvas to reposition the ROI
- FPS display
- Detection log with enter/exit events

---

## 🖥️ Backend API Reference (`server.js`)

The Express server runs on port `8080` and provides:

| Endpoint | Method | Description |
|---|---|---|
| `/api/traffic` | GET | Live VD speed readings from TDX; returns `{ simulation: true }` if no API keys |
| `/api/vd-info` | GET | Static VD metadata (VDID → road name mappings) |
| `/api/cctv` | GET | CCTV list with stream URLs; falls back to `cctv_cache.json` |
| `/api/hls-proxy` | GET | Proxies HLS segments from `hls.bote.gov.taipei` to bypass CORS |
| `/api/recording/save` | POST | Saves a `.webm` recording blob to the `recordings/` directory |
| `/api/recordings` | GET | Lists all saved recordings with metadata |
| `/recordings/:file` | GET | Static file serving for saved recordings |

### HLS Proxy Actions

The HLS proxy (`/api/hls-proxy`) accepts a query param `action`:

| `action` | What it does |
|---|---|
| `init` | Validates the camera is responding; returns a `proxyPlaylist` URL |
| `playlist` | Fetches and rewrites `.m3u8` manifests so all segment URLs route through the proxy |
| `segment` | Fetches and pipes raw `.ts` video segments |

> **Why?** Taipei City's CCTV streams (`hls.bote.gov.taipei`) block direct browser access due to `Referer`/`Origin` restrictions. The proxy adds the correct headers server-side.

---

## 🛰️ Data Sources

| Source | What | API Endpoint |
|---|---|---|
| [TDX (Transport Data eXchange)](https://tdx.transportdata.tw/) | Live VD sensor readings, road names, CCTV metadata | `tdx.transportdata.tw/api/basic/v2/Road/Traffic/…` |
| [Taipei City CCTV (BOTE)](https://hls.bote.gov.taipei) | Live HLS video streams from public traffic cameras | `hls.bote.gov.taipei/live/_api/camera/by-ccd/:id` |
| Google Maps Embed | Interactive traffic layer map | Embedded iframe |

---

## ☁️ Cloudflare Pages Deployment

The flood detector frontend can be deployed to **Cloudflare Pages** for public access.

### Deploy

```bash
./deploy.sh
```

This runs `npx wrangler pages deploy public` from the `cloudflare-deploy/` directory.

### Structure

```
cloudflare-deploy/
├── public/           # Static HTML, CSS, JS deployed to Cloudflare CDN
│   └── ads.txt       # Google AdSense publisher verification
└── functions/        # Cloudflare Worker functions (edge-side proxy logic)
```

> The deployed flood detector includes **Google AdSense** integration (`ca-pub-5738630038087798`) for monetization.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Styling** | Custom CSS — glassmorphism, dark mode, CSS variables |
| **AI / ML** | [TensorFlow.js](https://www.tensorflow.org/js) + [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) (runs in-browser) |
| **Video Streaming** | [HLS.js](https://github.com/video-dev/hls.js/) for M3U8 playback |
| **Backend** | [Express.js](https://expressjs.com/) v5 |
| **HTTP Client** | [Axios](https://axios-http.com/) |
| **Browser Automation** | [Puppeteer-core](https://pptr.dev/) (available for future snapshot features) |
| **Deployment** | [Cloudflare Pages](https://pages.cloudflare.com/) + [Wrangler](https://developers.cloudflare.com/workers/wrangler/) |
| **Fonts** | [Inter](https://fonts.google.com/specimen/Inter) + [Orbitron](https://fonts.google.com/specimen/Orbitron) (Google Fonts) |

---

## 🤖 AI Detection Details

### COCO-SSD Model
- Model: `lite_mobilenet_v2` — lightweight, fast, runs at interactive framerates in-browser
- Detects 80 COCO object classes; the dashboard filters for `person`, vehicles (`car`, `truck`, `bus`, `motorcycle`, `bicycle`), and others
- Confidence thresholds: persons > 15%, vehicles > 25%, others > 35%

### Centroid Tracker (`script.js`)
- Assigns **persistent track IDs** to detected persons across frames
- Greedy nearest-neighbor matching with a max centroid distance of 80px
- Tracks survive up to **15 frames** of non-detection (ghost effect with alpha fade)
- Bounding boxes smoothed with **exponential moving average** (α = 0.35) to reduce jitter
- Each unique track ID is counted **once** when its foot-point enters the zebra zone

### Flood Detection Algorithm (`flood-detector.html`)
- Canvas `getImageData()` samples every Nth pixel in the user-defined sensor zone
- Classifies pixels by HSL hue ranges into: Water (blue), Turbid (brown), Wet (gray), Normal
- Combines ratios with a weighted score → overall flood risk 0–100%
- Baseline frame calibration reduces false positives from road markings or shadows

---

## 🗺️ Monitored Neihu Zones

| Zone | Road | TDX Road Match |
|---|---|---|
| Xihu (Neihu Rd Sec 1) | 內湖路一段 | `內湖路一段` |
| Xihu (Jihu Rd) | 基湖路 | `基湖路` |
| Zhouzi St | 洲子街 | `洲子街` |
| Ruiguang Rd Ln 478 | 瑞光路478巷 | `瑞光路478巷` |
| Tiding Blvd | 堤頂大道 | `堤頂大道` |

Traffic status thresholds:
- 🟢 **Clear** — speed ≥ 40 km/h
- 🟡 **Heavy** — speed 20–39 km/h
- 🔴 **Gridlock** — speed < 20 km/h

---

## 🔒 Environment & Security Notes

- The `.env` file is **not committed** to version control; keep your TDX credentials private
- The HLS proxy does not cache video content — streams are piped in real time with `Cache-Control: no-store`
- Stream URL cache has a **5-minute TTL** to avoid stale camera state lookups
- Recording filenames are validated server-side with a strict `[\w\-\.]+` allowlist

---

## 📝 License

ISC
