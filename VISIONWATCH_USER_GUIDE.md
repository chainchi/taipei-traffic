# VisionWatch AI — User Guide

VisionWatch AI is a live-video monitoring app that runs entirely in your browser. Point it at a camera feed and it can watch for floods, occupied parking spots, objects, people, falls, or a specific license plate — and email you the moment something happens.

**App:** https://taipei-traffic-flood.pages.dev/

No installation, no account required. Everything (video analysis, OCR, AI models) runs on your own device — nothing is uploaded except the optional email alert snapshot.

---

## 1. Quick Start

1. **Pick a detection mode** from the row of icons above the video (🌊 Flood, 🚗 Parking, 🔍 Object, 👤 People, 🚑 Fall, 🔢 License Plate).
2. **Load a video source** — enter a camera ID or URL under "Custom Source" and press **LOAD**, or tap **📷 Use Local Webcam**.
3. **Draw a monitoring zone** on the video — click/tap 3+ points, then double-click (or click the first point again) to close the shape. This is the only area the app analyzes.

That's it — the app starts watching immediately. Everything else below is optional fine-tuning.

---

## 2. Loading a Video Source

The **Custom Source** box accepts several kinds of input:

| You enter... | What happens |
|---|---|
| A 3-digit number (e.g. `145`) | Loads that Taipei public traffic camera by ID |
| A `tw.live` camera page URL | Loads that camera directly |
| A direct `.m3u8` or `.mp4` URL | Plays that stream/video |
| A **VideoLinks** watch link (`...watch.html?stream=...`) | Connects to a live phone broadcast from the companion VideoLinks app |
| *(nothing typed)* — tap **📷 Use Local Webcam** | Uses your device's camera |

On phones, once the webcam is active you can tap the **🔄 flip camera** button (top-right of the video) to switch between front and rear cameras.

---

## 3. Detection Modes

| Mode | What it watches for | Needs a target set? |
|---|---|---|
| 🌊 **Flood Detection** | Standing water / flooding in the zone, using color + reflectivity analysis | No |
| 🚗 **Parking Watch** | A vehicle parked in the zone for a sustained period | No |
| 🔍 **Object Detection** | Any of ~80 general object types (cars, bikes, animals, bags, etc.) in the zone | No |
| 👤 **People Detection** | A person entering the zone | No |
| 🚑 **Fall Detection** | Someone appearing to be lying down / collapsed in the zone | No |
| 🔢 **License Plate** | A specific license plate passing through the zone | **Yes** — set it under "Target License Plate" |

Switching modes automatically loads whatever AI model that mode needs (you'll see it in the Alert Log). The gauge, status pill, and sidebar labels all relabel themselves to match the active mode.

**License Plate mode notes:**
- Type the plate you're watching for into **Target License Plate** and press SAVE. Without a target set, the app still shows every plate it reads on-screen — it just won't send match alerts.
- OCR accuracy depends heavily on camera angle, distance, and lighting. A close, front-facing view of the plate works best; wide intersection shots of small/distant plates will read less reliably.

---

## 4. The Monitoring Zone

The dashed cyan shape on the video is your monitoring zone — only what's inside it gets analyzed.

- **Add points** (while drawing): tap/click on the video to place each corner (3–8 points).
- **Close the shape**: tap the first point again, or double-click/double-tap anywhere.
- **Resize a corner**: drag one of the corner dots.
- **Move the whole zone**: drag anywhere *inside* the shape, or along one of its edges — the whole polygon slides together without changing its shape.
- **Redraw from scratch**: "Show Advanced Settings" → **✏️ Reset & Redraw Polygon**.
- **Turn zone monitoring off**: toggle "Road Surface ROI" off under Monitoring Zone (Advanced Settings) — the AI models still run, but nothing gets flagged since there's no zone to check against.

Corner handles and touch targets are sized for phone use, so this works with a finger, not just a mouse.

---

## 5. Full-Screen Video View

**Double-tap (or double-click) the video** to make it fill the entire screen — sidebar, header, and mode buttons all hide out of the way. **Double-tap again** to return to the normal layout.

(If you're in the middle of drawing a new zone, double-tapping closes the polygon instead — the full-screen toggle only kicks in when you're not actively drawing.)

---

## 6. Email Alerts

Enter your email under **Email Alerts Subscription** and press SAVE to get notified when something is detected (Flood, Parking, People, Fall, and License Plate modes all send alerts — Object Detection does not, since "some object appeared" isn't usually alert-worthy on its own).

- Alerts include a snapshot of what triggered them.
- Check your spam folder for the first email — it comes from `onboarding@resend.dev`.
- There's a cooldown between repeat alerts for the same ongoing event, so you won't get spammed while a flood/vehicle/person stays in frame.

---

## 7. Advanced Settings

Tap **⚙️ Show Advanced Settings** to reveal:

- **Telemetry & Colors** — live numeric readouts behind the current mode's risk score (relabeled per mode — e.g. "Water Pixels" for Flood, "Last Read" for License Plate).
- **Monitoring Zone** — the zone on/off toggle and redraw button described above.
- **Baseline Frame** (Flood & Parking only) — tap **📸 Capture Dry Baseline** on a clear, empty frame so the app knows what "normal" looks like. This reduces false positives from road markings, shadows, or reflections. Not needed — the app auto-learns over time — but it helps if you want to hit the ground running.

Other controls (Sensitivity, Color Analysis) only appear in the modes they actually affect, so you won't see irrelevant settings cluttering the sidebar.

---

## 8. Recording

Tap the **● REC** button (top-right of the video) to start recording exactly what you see — the live video plus all the overlays (zone outline, detection boxes, labels). Tap it again to stop; the recording downloads automatically as a `.webm` file to your device.

---

## 9. Tips for iPhone / Mobile Use

- The mode selector collapses to icon-only chips you can scroll sideways through — tap one to switch, the active mode's name shows just below it.
- Pinch to zoom in on the video for a closer look at small details (e.g. a distant license plate).
- Zone corners and the double-tap fullscreen gesture are both tuned for real finger use, not just mouse pointers.
- The sidebar only shows controls relevant to your current mode, so switching to something like Object Detection gives you a much shorter, simpler panel than License Plate mode.

---

## 10. Feedback

Tap the **💬** button (bottom-right, floating) any time to send feedback or report an issue directly from the app.

---

*VisionWatch AI runs all detection client-side in your browser — no video is uploaded to any server except the small snapshot attached to an email alert, if you've subscribed to one.*
