# 📘 Backend and Front End Video Streaming Telemetry Service

A telemetry backend service for a video‑streaming application. This project collects detailed playback metrics from a frontend video player, processes them in batches, and stores them in a PostgreSQL database for analytics and monitoring.

---

## 🧠 Project Overview

This project is designed to track **video playback behavior and performance** in real time.

It consists of:

* **Frontend Telemetry Plugin (JavaScript)**

  * Hooks into an HLS/video player
  * Captures playback, buffering, quality, network, device, and engagement metrics
  * Sends telemetry events in batches with retry logic

* **Backend Service (Node.js + Express)**

  * Receives telemetry events via HTTP
  * Supports single events or batched events
  * Inserts each event into PostgreSQL

---

## 🚀 Key Features

* Accepts **single or batched telemetry events**
* Stores structured telemetry data in PostgreSQL
* Event‑driven telemetry model
* Frontend batching with retry + exponential backoff
* Extensible event schema

---

## 📂 Repository Structure

```
backend_video_stremming/
├── backend/
│   ├── index.js        # Express server (telemetry API)
│   ├── db.js           # PostgreSQL connection pool
├── telemetry-plugin.js # Frontend telemetry plugin
├── index.html          # Example frontend usage
├── test.js             # Test / experiments
```

---

## 🔁 Telemetry Flow (High Level)

```
Video Player
   ↓
TelemetryPlugin (frontend)
   ↓  (batched JSON events)
POST /telemetry
   ↓
Express Backend
   ↓
PostgreSQL (telemetry_events table)
```

---

## 📡 Backend API

### POST `/telemetry`

Receives telemetry events from the frontend.

#### Request Body

* Single event (JSON object), **or**
* Batch of events (array of JSON objects)

Example:

```json
[
  {
    "eventId": "uuid",
    "viewerId": "user123",
    "sessionId": "session-abc",
    "eventType": "PLAY",
    "timestamp": 1765837003411,
    "playbackPositionSec": 12.5,
    "quality": { "bitrateKbps": 3000, "resolution": "720p" },
    "network": { "downlinkMbps": 10, "rttMs": 50 },
    "device": { "browser": "Chrome", "os": "Mac" },
    "player": { "decodedFrames": 1200, "droppedFrames": 2, "fps": 30 },
    "engagement": { "totalWatchTime": 5000, "interactionCount": 3 }
  }
]
```

#### Response

```json
{ "ok": true }
```

---

## 🗄 Database Design

Telemetry is stored **one event per row**.

Example table structure:

```sql
telemetry_events (
  event_id TEXT,
  viewer_id TEXT,
  session_id TEXT,
  event_type TEXT,
  event_timestamp BIGINT,
  playback_position_sec DOUBLE PRECISION,

  bitrate_kbps INT,
  resolution TEXT,
  video_width INT,
  video_height INT,

  buffer_start BIGINT,
  buffer_end BIGINT,
  buffer_duration_ms INT,

  network_downlink_mbps DOUBLE PRECISION,
  network_rtt_ms INT,
  network_effective_type TEXT,

  device_browser TEXT,
  device_os TEXT,
  screen_width INT,
  screen_height INT,

  total_watch_time_ms BIGINT,
  total_pause_time_ms BIGINT,
  interaction_count INT,

  dropped_frames INT,
  decoded_frames INT,
  fps DOUBLE PRECISION,
  buffer_length_sec DOUBLE PRECISION,

  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🎯 Frontend Telemetry Plugin

The frontend plugin:

* Generates a **sessionId** per playback session
* Generates a **unique eventId** per event
* Listens to player events:

  * PLAY / PAUSE
  * BUFFER_START / BUFFER_END
  * QUALITY_CHANGE
  * PLAYER_ERROR
* Collects metrics:

  * Network info (Network Information API)
  * Device info (Navigator)
  * Player metrics (decoded frames, dropped frames, buffer length)

### FPS Calculation

FPS is **not provided directly by the browser**.

It is calculated using frame deltas:

```
FPS = (frames_now − frames_before) ÷ (time_now − time_before)
```

---

## 🔄 Batching & Retry Logic (Frontend)

* Events are queued locally
* Sent in batches at a fixed interval
* Failed batches are retried with **exponential backoff**
* Events are dropped after `maxRetries`

This prevents data loss while avoiding infinite retry loops.

---

## ⚙️ Setup Instructions

### Backend

```bash
cd backend
npm install
node index.js
```

Backend runs on:

```
http://localhost:3000
```

### Frontend

Include `telemetry-plugin.js` and initialize:

```js
const telemetry = new TelemetryPlugin(hls, videoElement, "viewer123");
```

---

## 🧪 Debugging Tips

* Log incoming payloads using:

```js
console.dir(req.body, { depth: null });
```

* Use `RETURNING *` in SQL to confirm inserts
* Validate payload structure before inserting

---

## 🔮 Future Improvements

* Batch SQL inserts for higher throughput
* Authentication / API keys
* Analytics queries (QoE, buffering ratio, watch time)
* Dashboard integration

---

## 📜 License

Add a license of your choice (MIT / Apache / GPL).

---

## ✍️ Author

Bhupesh
