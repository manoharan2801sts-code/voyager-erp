/**
 * Voyager ERP — Bar Chart Loader & Global Data Loading Indicator
 * Supports:
 *  - Top slim glowing progress bar (NProgress style)
 *  - Frosted glassmorphic modal overlay with rising bar chart
 *  - Intelligent debounce (prevents flickering on instant/cached calls)
 *  - Active request counter (stays visible while multiple parallel requests are active)
 *  - Automatic window.fetch interceptor for all data & API requests
 */
(function (window) {
  let overlayEl = null;
  let progressBarEl = null;
  let activeRequests = 0;
  let debounceTimer = null;
  let progressTimer = null;
  let progressVal = 0;

  function ensureProgressBar() {
    if (!progressBarEl) {
      progressBarEl = document.getElementById("vloader-bar");
      if (!progressBarEl) {
        progressBarEl = document.createElement("div");
        progressBarEl.id = "vloader-bar";
        progressBarEl.className = "vloader-bar";
        document.body.appendChild(progressBarEl);
      }
    }
    return progressBarEl;
  }

  function startProgress() {
    const bar = ensureProgressBar();
    if (!bar) return;
    bar.style.opacity = "1";
    progressVal = Math.max(progressVal, 20);
    bar.style.width = progressVal + "%";

    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (progressVal < 88) {
        progressVal += (88 - progressVal) * 0.12;
        bar.style.width = progressVal.toFixed(1) + "%";
      }
    }, 180);
  }

  function finishProgress() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    const bar = progressBarEl;
    if (!bar) return;
    bar.style.width = "100%";
    setTimeout(() => {
      bar.style.opacity = "0";
      setTimeout(() => {
        if (activeRequests <= 0) {
          bar.style.width = "0%";
          progressVal = 0;
        }
      }, 250);
    }, 160);
  }

  function buildOverlay(message) {
    const overlay = document.createElement("div");
    overlay.className = "vloader-overlay";
    overlay.id = "vloaderOverlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="vloader-box">
        <div class="vloader-logo-wrap">
          <div class="vloader-logo-pulse"></div>
          <div class="vloader-logo-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 16l20-8-8 20-2-8-8-2z" fill="#0F766E" />
            </svg>
          </div>
        </div>
        <div class="vloader-brand">
          Voyager <span style="font-weight:600; color:var(--color-teal, #0F766E);">ERP</span>
        </div>
        <div class="vloader-bars" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="vloader-label">
          <span class="vloader-dot"></span>
          <span id="vloaderLabel">${message || "Loading data…"}</span>
        </div>
      </div>
    `;
    return overlay;
  }

  let overlaySafetyTimer = null;

  const VoyagerLoader = {
    /**
     * Show loader with Voyager ERP animated logo and top progress bar.
     */
    show(message = "Loading data…", immediate = false, showModal = true) {
      activeRequests++;
      startProgress();

      if (!showModal) return;

      const display = () => {
        if (!overlayEl) {
          overlayEl = buildOverlay(message);
          document.body.appendChild(overlayEl);
        } else {
          this.setMessage(message);
          overlayEl.classList.remove("vloader-hidden");
        }
        // Safety: ensure modal overlay never hangs longer than 1200ms
        if (overlaySafetyTimer) clearTimeout(overlaySafetyTimer);
        overlaySafetyTimer = setTimeout(() => {
          this.forceHide();
        }, 1200);
      };

      if (immediate) {
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        display();
      } else {
        if (!overlayEl && !debounceTimer) {
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (activeRequests > 0) {
              display();
            }
          }, 60);
        } else if (overlayEl) {
          this.setMessage(message);
        }
      }
    },

    showModal(message = "Saving…", immediate = true) {
      this.show(message, immediate, true);
    },

    setMessage(message) {
      if (!message) return;
      const label = document.getElementById("vloaderLabel");
      if (label) label.textContent = message;
    },

    hide() {
      if (activeRequests > 0) activeRequests--;
      if (activeRequests <= 0) {
        activeRequests = 0;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        if (overlaySafetyTimer) {
          clearTimeout(overlaySafetyTimer);
          overlaySafetyTimer = null;
        }
        finishProgress();
        if (overlayEl) {
          overlayEl.classList.add("vloader-hidden");
          const el = overlayEl;
          overlayEl = null;
          setTimeout(() => {
            if (el && el.parentNode) el.remove();
          }, 200);
        }
      }
    },

    forceHide() {
      activeRequests = 0;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (overlaySafetyTimer) {
        clearTimeout(overlaySafetyTimer);
        overlaySafetyTimer = null;
      }
      finishProgress();
      if (overlayEl) {
        overlayEl.classList.add("vloader-hidden");
        const el = overlayEl;
        overlayEl = null;
        setTimeout(() => {
          if (el && el.parentNode) el.remove();
        }, 200);
      }
    },

    showFor(ms = 500, message = "Loading…") {
      this.show(message, true, true);
      setTimeout(() => this.hide(), ms);
    },

    startProgress,
    finishProgress,
  };

  window.VoyagerLoader = VoyagerLoader;

  // Initialize progress bar as soon as DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => ensureProgressBar());
  } else {
    ensureProgressBar();
  }

  // Intercept window.fetch globally to automatically track any API or data requests
  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch;
    window.fetch = async function (resource, config = {}) {
      let urlStr = "";
      if (typeof resource === "string") {
        urlStr = resource;
      } else if (resource && resource.url) {
        urlStr = resource.url;
      }

      // Check if this request is an API call or HTML page fetch
      const isApiOrPage =
        urlStr.includes("/api") ||
        urlStr.includes(".html") ||
        urlStr.includes(":8000") ||
        urlStr.includes("onrender.com");

      // Check for silent header
      let isSilent = false;
      if (config && config.headers) {
        if (typeof config.headers.get === "function") {
          isSilent = !!config.headers.get("X-Silent-Load");
        } else if (typeof config.headers === "object") {
          isSilent = !!config.headers["X-Silent-Load"];
        }
      }

      const shouldTrack = isApiOrPage && !isSilent;

      if (shouldTrack) {
        const method = ((config && config.method) || "GET").toUpperCase();
        const isMutation = method === "POST" || method === "PUT" || method === "DELETE";
        let message = "Loading data…";
        if (method === "POST" || method === "PUT") {
          message = "Saving changes…";
        } else if (method === "DELETE") {
          message = "Deleting record…";
        } else if (urlStr.includes("tickets")) {
          message = "Loading tickets…";
        } else if (urlStr.includes("accounts") || urlStr.includes("ledgers")) {
          message = "Loading chart of accounts…";
        } else if (urlStr.includes("dashboard")) {
          message = "Loading dashboard metrics…";
        } else if (urlStr.includes("groups")) {
          message = "Loading account groups…";
        } else if (urlStr.includes(".html")) {
          message = "Loading view…";
        }

        // Show sleek Voyager ERP logo animation with auto-dismiss
        VoyagerLoader.show(message, false, true);
      }

      try {
        const response = await originalFetch.apply(this, arguments);
        return response;
      } finally {
        if (shouldTrack) {
          VoyagerLoader.hide();
        }
      }
    };
  }
})(window);