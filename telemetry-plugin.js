//Telemetry Class 
// Event Driven

class TelemetryPlugin {
    constructor(hls, videoElement, viewerId = "unknown-viewer", config = {}) {
        this.hls = hls;
        this.video = videoElement;
        this.viewerId = viewerId;

        this.sessionId =  crypto.randomUUID() + "-" + Date.now();

        // Store the last known quality (ALWAYS sent in every event through params)
        this.currentQuality = {
            bitrateKbps: null,
            width: null,
            height: null,
            resolution: null
        };
        this._fpsState = {
        lastFrames: 0,
        lastTime: performance.now(),
         fps: null
        };


        // Buffer tracking
        this.bufferStartTime = null;

        // Engagement tracking
        this.lastPlayTimestamp = null;
        this.totalWatchTime = 0;
        this.totalPauseTime = 0;
        this.lastPauseTimestamp = null;
        this.interactionCount = 0;

        // Config defaults
        this.config = {
            endpoint: config.endpoint || "http://localhost:3000/telemetry",
            flushIntervalMs: config.flushIntervalMs || 5000,
            maxBatchSize: config.maxBatchSize || 20,
            maxQueueSize: config.maxQueueSize || 1500,
            maxRetries: config.maxRetries || 3,
            backoffBaseMs: config.backoffBaseMs || 1000
        };

        this.eventQueue = [];
        this.isSending = false;
        this.retryTimer = null;

        console.log(" TelemetryPlugin initialized:", { viewerId, session: this.sessionId });

        this.initListeners();
        this.startFlushTimer();
        window.addEventListener("online", () => this.flushQueue());
    }

   


    //base always run after event listner 
    base(eventType) {
        return {
            eventId:  crypto.randomUUID(),
            viewerId: this.viewerId,
            sessionId: this.sessionId,
            eventType,
            timestamp: Date.now(),
            playbackPositionSec: this.video.currentTime ?? null,

            // quality  ALWAYS even quality not drop 
            quality: this.currentQuality,

            engagement: {
                totalWatchTime: this.totalWatchTime,
                totalPauseTime: this.totalPauseTime,
                interactionCount: this.interactionCount
            },

            network: this.getNetworkInfo(),
            device: this.getDeviceInfo(),
            player: this.getPlayerMetrics()
        };
    }


    // NETWORK INFORMATION
    //Comes from the Network Information API which is built into modern browsers
    
    getNetworkInfo() {
        const n = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
        return n ? {
            downlinkMbps: n.downlink || null,
            rttMs: n.rtt || null,
            effectiveType: n.effectiveType || null
        } : {};
    }

    
    // DEVICE INFORMATION
    //  Comes from Navigator 

    getDeviceInfo() {

        const ua = navigator.userAgent;

        let browser = "Unknown";
        if (ua.includes("Chrome") && !ua.includes("Edg") && !ua.includes("OPR")) browser = "Chrome";
        else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
        else if (ua.includes("Firefox")) browser = "Firefox";
        else if (ua.includes("Edg")) browser = "Edge";
        else if (ua.includes("OPR") || ua.includes("Opera")) browser = "Opera";

        return {
            browser,
            os: navigator.platform || null,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height
        };
    }

    
    // PLAYER METRICS

    getPlayerMetrics() {
    const stats = this.video.getVideoPlaybackQuality?.();
    const buffered = this.video.buffered;

    // -------- Buffer length --------
    let bufferLength = 0;
    if (buffered && buffered.length > 0) {
        const end = buffered.end(buffered.length - 1);
        bufferLength = Math.max(0, end - this.video.currentTime);
    }

    // -------- FPS calculation --------
    const now = performance.now();
    const elapsedMs = now - this._fpsState.lastTime;

    if (stats?.totalVideoFrames != null && elapsedMs >= 1000) {
        const deltaFrames = stats.totalVideoFrames - this._fpsState.lastFrames;
        const deltaTimeSec = elapsedMs / 1000;

        this._fpsState.fps = deltaFrames / deltaTimeSec;

        this._fpsState.lastFrames = stats.totalVideoFrames;
        this._fpsState.lastTime = now;
    }

    return {
        droppedFrames: stats?.droppedVideoFrames || 0,
        decodedFrames: stats?.totalVideoFrames || 0,
        fps: this._fpsState.fps,     // stable FPS
        bufferLengthSec: bufferLength
    };
}


//calling queue to make a queue and store value there 
    log(payload) {
        console.log(" Telemetry Event Generated:", payload);
        this.enqueue(payload);
    }

    // Queue logic
    
    enqueue(payload) {
        if (this.eventQueue.length >= this.config.maxQueueSize) {
            this.eventQueue.shift();
            console.warn(" Queue full — dropped oldest event");
        }
        payload._retryCount = payload._retryCount || 0;
        this.eventQueue.push(payload);
    }
   //once this function is set  and ruuning it keep running  and evey 5 sec difference  it runs  
    startFlushTimer() {
        setInterval(() => this.flushQueue(), this.config.flushIntervalMs);
    }

    async flushQueue() {
        if (this.isSending || this.eventQueue.length === 0) return;
        if (!navigator.onLine) return;

        this.isSending = true;
        const batch = this.eventQueue.splice(0, this.config.maxBatchSize);

        console.log(` Sending batch of ${batch.length} events…`);

        try {
            const response = await fetch(this.config.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batch)
            });

            if (!response.ok) {
                console.error(" Server responded with error:", response.status);
                this.handleFailedBatch(batch);
            } else {
                console.log(" Batch sent succesfully");
            }
        } catch (err) {
            console.error(" Network send failed:", err);
            this.handleFailedBatch(batch);
        }

        this.isSending = false;
    }

    handleFailedBatch(batch) {
        batch.forEach(event => {
            event._retryCount++;
            if (event._retryCount <= this.config.maxRetries) {
                this.eventQueue.unshift(event);
            } else {
                console.warn(" Telemetry dropped:", event);
            }
        });

        const retry = batch[0]._retryCount;
        const delay = this.config.backoffBaseMs * Math.pow(2, retry - 1);

        console.warn(` Retrying in ${delay}ms`);

        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.flushQueue(), delay);
    }

  

 
    // ENGAGEMENT TRACKING
   
    onPlay() {
        console.log(" PLAY");
        this.lastPlayTimestamp = Date.now();

        if (this.lastPauseTimestamp) {
            this.totalPauseTime += (Date.now() - this.lastPauseTimestamp);
            this.lastPauseTimestamp = null;
        }
        this.interactionCount++;
        this.log(this.base("PLAY"));
    }

    onPause() {
        console.log(" PAUSE");
        this.lastPauseTimestamp = Date.now();

        if (this.lastPlayTimestamp) {
            this.totalWatchTime += (Date.now() - this.lastPlayTimestamp);
        }
        this.interactionCount++;
        this.log(this.base("PAUSE"));
    }

   
    // LISTENERS those function listen Hls event and browser 

    initListeners() {
        console.log(" Initializing listeners…");

        // UPDATE QUALITY + LOG EVENT
        this.hls.on(Hls.Events.LEVEL_SWITCHED, (evt, data) => {
            const level = this.hls.levels[data.level];
            if (!level) return;

            this.currentQuality = {
                bitrateKbps: Math.round(level.bitrate / 1000),
                width: level.width,
                height: level.height,
                resolution: `${level.height}p`
            };

            console.log(" QUALITY UPDATED:", this.currentQuality);

            const payload = this.base("QUALITY_CHANGE");
            payload.quality = this.currentQuality;
            this.log(payload);
        });

        // BUFFER START
        this.video.addEventListener("waiting", () => {
            this.bufferStartTime = Date.now();
            const evt = this.base("BUFFER_START");
            evt.buffering = { startedAt: this.bufferStartTime };
            this.log(evt);
        });

        // BUFFER END
        this.video.addEventListener("playing", () => {
            if (!this.bufferStartTime) return;

            const end = Date.now();
            const evt = this.base("BUFFER_END");
            evt.buffering = {
                startedAt: this.bufferStartTime,
                endedAt: end,
                durationMs: end - this.bufferStartTime
            };

            this.bufferStartTime = null;
            this.log(evt);
        });

        // PLAY / PAUSE
        this.video.addEventListener("play", () => this.onPlay());
        this.video.addEventListener("pause", () => this.onPause());

        // PLAYER ERRORS
        this.hls.on(Hls.Events.ERROR, (evt, data) => {
            const error = this.base("PLAYER_ERROR");
            error.error = {
                type: data.type,
                details: data.details,
                fatal: data.fatal
            };
            this.log(error);
        });

        console.log(" Listeners initialized");
    }
}
