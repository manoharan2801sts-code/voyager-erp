/**
 * Voyager ERP — shared shell & SPA Navigation Engine
 * Renders the top nav + sidebar into #shell-topnav / #shell-sidebar,
 * wires common behaviors (sidebar collapse, logout, company selector, light/dark theme toggle),
 * and provides seamless Single-Page-Application (SPA) client-side routing.
 *
 * Clicking any navigation link or internal page link dynamically loads
 * the view and data without a full page reload!
 */
(function (window) {
  // Apply saved theme immediately on load to prevent flicker
  const savedTheme = localStorage.getItem("voyager-theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  const { Store, get } = window.VoyagerAPI;
  const NAV_SECTIONS = window.VoyagerHardcode.NAV_SECTIONS;

  let currentOnCompanyChange = null;
  let isNavigating = false;
  let isShellInitialized = false;

  function icon(path) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  }

  function initials(name) {
    return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }

  function renderNav(activeKey) {
    return NAV_SECTIONS.map((section) => `
      <div class="nav-section-label">${section.label}</div>
      ${section.items.map((item) => `
        <a class="nav-item ${item.key === activeKey ? "active" : ""}" href="${item.href}" data-key="${item.key}" ${item.phase2 ? 'data-phase2="1"' : ""}>
          <span class="nav-icon">${icon(item.icon)}</span>
          <span class="nav-label-text">${item.label}</span>
          ${item.phase2 ? '<span class="nav-badge">Phase 2</span>' : ""}
        </a>`).join("")}
    `).join("") + `
      <div class="nav-section-label">&nbsp;</div>
      <a class="nav-item" href="#" id="logout-link">
        <span class="nav-icon">${icon("M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9")}</span>
        <span class="nav-label-text">Sign out</span>
      </a>`;
  }

  function updateActiveNav(activeKey, url) {
    const baseName = url ? url.split("?")[0].replace(/^.*[\\/]/, "") : "";
    document.querySelectorAll(".nav-item[href]").forEach((item) => {
      const itemHref = item.getAttribute("href") || "";
      const itemKey = item.getAttribute("data-key");
      if ((activeKey && itemKey === activeKey) || (baseName && itemHref.split("?")[0] === baseName)) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  async function navigateTo(url, push = true) {
    if (!url || url === "#" || url.startsWith("javascript:") || isNavigating) return;
    if (url === "index.html" || url.endsWith("/index.html")) {
      window.location.href = "index.html";
      return;
    }

    isNavigating = true;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        window.location.href = url;
        return;
      }
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // 1. Update Document Title
      if (doc.title) {
        document.title = doc.title;
      }

      // 2. Swap Main View
      const newMain = doc.querySelector(".app-main");
      const currentMain = document.querySelector(".app-main");
      if (newMain && currentMain) {
        currentMain.innerHTML = newMain.innerHTML;
        if (newMain.getAttribute("style")) {
          currentMain.setAttribute("style", newMain.getAttribute("style"));
        } else {
          currentMain.removeAttribute("style");
        }
        currentMain.classList.remove("spa-fade-in");
        void currentMain.offsetWidth; // trigger reflow for animation
        currentMain.classList.add("spa-fade-in");
      }

      // 3. Update Page Styles
      const existingPageStyles = document.querySelectorAll("style[data-page-style]");
      existingPageStyles.forEach((s) => s.remove());
      const newPageStyles = doc.querySelectorAll("head style");
      newPageStyles.forEach((s) => {
        const cloned = document.createElement("style");
        cloned.setAttribute("data-page-style", "1");
        cloned.textContent = s.textContent;
        document.head.appendChild(cloned);
      });

      // 4. Update Sidebar Active State
      updateActiveNav(null, url);

      // 5. Update Browser History
      if (push) {
        window.history.pushState({ url }, "", url);
      }

      window.scrollTo({ top: 0, behavior: "instant" });

      // 6. Execute scripts from the new page in order
      const scripts = Array.from(doc.querySelectorAll("script"));
      for (const s of scripts) {
        const src = s.getAttribute("src");
        if (src) {
          // Skip shared base libraries that are already loaded in memory
          if (
            src.includes("hardcode.js") ||
            src.includes("mock-data.js") ||
            src.includes("api.js") ||
            src.includes("util.js") ||
            src.includes("entry-common.js") ||
            src.includes("drilldown.js") ||
            src.includes("shell.js") ||
            src.includes("auth.js")
          ) {
            continue;
          }

          // Check if external CDN library is already loaded
          if (src.includes("chart.umd") && window.Chart) continue;
          if (src.includes("jquery") && window.jQuery) continue;
          if (src.includes("dataTables") && window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable) continue;

          // Dynamically load page-specific script
          await new Promise((resolve) => {
            const scriptEl = document.createElement("script");
            scriptEl.src = src.split("?")[0] + "?t=" + Date.now();
            scriptEl.onload = resolve;
            scriptEl.onerror = resolve;
            document.body.appendChild(scriptEl);
          });
        } else if (s.textContent.trim()) {
          try {
            const inlineScript = document.createElement("script");
            inlineScript.textContent = s.textContent;
            document.body.appendChild(inlineScript);
            inlineScript.remove();
          } catch (e) {
            console.error("Inline script execution error:", e);
          }
        }
      }
    } catch (err) {
      console.error("SPA routing error:", err);
      window.location.href = url;
    } finally {
      isNavigating = false;
    }
  }

  // Intercept all clicks globally for instant SPA navigation without full page reload
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (
      !href ||
      href === "#" ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      link.hasAttribute("data-phase2") ||
      link.id === "logout-link"
    ) {
      return;
    }

    // Allow opening in new tab / window with Ctrl/Cmd/Shift
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Check if link is internal
    if (link.hostname && link.hostname !== window.location.hostname) return;

    // Only route to html pages
    const isHtmlTarget = href.includes(".html") || !href.includes(".");
    if (!isHtmlTarget) return;

    e.preventDefault();
    navigateTo(href, true);
  });

  // Handle Browser Back and Forward buttons seamlessly
  window.addEventListener("popstate", (e) => {
    if (e.state && e.state.url) {
      navigateTo(e.state.url, false);
    } else {
      navigateTo(window.location.pathname + window.location.search, false);
    }
  });

  async function init({ activeKey, onCompanyChange }) {
    currentOnCompanyChange = onCompanyChange;

    if (!Store.getToken()) {
      Store.setToken("demo-token");
      Store.setRefresh("demo-refresh");
      Store.setUser(window.VoyagerMock ? window.VoyagerMock.USER : { full_name: "Ananya Krishnan" });
      Store.setMockMode(true);
    }
    const user = Store.getUser() || { full_name: "Ananya Krishnan" };
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";

    // Build Topnav & Sidebar only once if not already rendered
    const topnav = document.getElementById("shell-topnav");
    if (topnav && (!isShellInitialized || !topnav.innerHTML.trim())) {
      topnav.innerHTML = `
        <button class="sidebar-toggle-btn" id="sidebar-toggle" aria-label="Toggle sidebar">
          ${icon("M3 6h18M3 12h18M3 18h18")}
        </button>
        <div class="app-logo">
          <span class="mark">${icon("M2 16l20-8-8 20-2-8-8-2z").replace("currentColor", "#fff")}</span>
          Voyager <span style="font-weight:500; color:var(--color-text-muted);">ERP</span>
        </div>
        <select class="form-control-custom company-selector" id="company-selector"></select>
        <div class="global-search">
          <span class="icon">${icon("M11 11m-7 0a7 7 0 1014 0 7 7 0 10-14 0")}</span>
          <input type="text" placeholder="Search PNR, invoice, customer, supplier…" />
        </div>
        <div class="topnav-actions">
          <!-- 1. Profile Pill First -->
          <div class="user-chip" id="user-profile-chip" title="Logged in as ${user ? user.full_name : ''}">
            <span class="user-avatar">${user ? initials(user.full_name) : "--"}</span>
            <span style="font-size:0.85rem; font-weight:600;">${user ? user.full_name.split(" (")[0] : "…"}</span>
          </div>

          <!-- 2. Notification Bell Next -->
          <button class="icon-btn" id="notif-btn" aria-label="Notifications" title="Notifications">
            ${icon("M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9")}
            <span class="dot"></span>
          </button>

          <!-- 3. Theme Toggle Button Next (Light/Dark Mode) -->
          <button class="icon-btn theme-toggle-btn" id="theme-toggle-btn" aria-label="Toggle Theme" title="Toggle Light / Dark Mode">
            <span class="theme-icon-sun" style="display:${currentTheme === 'dark' ? 'inline-flex' : 'none'};">${icon("M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z")}</span>
            <span class="theme-icon-moon" style="display:${currentTheme === 'dark' ? 'none' : 'inline-flex'};">${icon("M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z")}</span>
          </button>
        </div>`;

      // Theme Toggle Handler
      const themeBtn = document.getElementById("theme-toggle-btn");
      if (themeBtn) {
        themeBtn.addEventListener("click", () => {
          const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
          const newTheme = activeTheme === "dark" ? "light" : "dark";
          document.documentElement.setAttribute("data-theme", newTheme);
          localStorage.setItem("voyager-theme", newTheme);

          const sun = themeBtn.querySelector(".theme-icon-sun");
          const moon = themeBtn.querySelector(".theme-icon-moon");
          if (sun && moon) {
            sun.style.display = newTheme === "dark" ? "inline-flex" : "none";
            moon.style.display = newTheme === "dark" ? "none" : "inline-flex";
          }
        });
      }

      const toggleBtn = document.getElementById("sidebar-toggle");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          document.getElementById("shell-sidebar").classList.toggle("collapsed");
        });
      }
    }

    const sidebar = document.getElementById("shell-sidebar");
    if (sidebar && (!isShellInitialized || !sidebar.innerHTML.trim())) {
      sidebar.innerHTML = renderNav(activeKey);
    } else {
      updateActiveNav(activeKey, window.location.pathname);
    }

    const staleMenubar = document.getElementById("shell-menubar");
    if (staleMenubar) staleMenubar.remove();

    document.querySelectorAll("[data-phase2]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        alert("This module is part of the Phase 2 build.");
      });
    });

    const logoutLink = document.getElementById("logout-link");
    if (logoutLink && !logoutLink.dataset.bound) {
      logoutLink.dataset.bound = "1";
      logoutLink.addEventListener("click", async (e) => {
        e.preventDefault();
        try { await window.VoyagerAPI.post("/auth/logout"); } catch (_) {}
        Store.clear();
        window.location.href = "index.html";
      });
    }

    // Company Selector Setup
    const select = document.getElementById("company-selector");
    if (select) {
      if (!select.dataset.loaded) {
        const companies = await get("/companies");
        select.innerHTML = companies.map((c) =>
          `<option value="${c.id}" data-country="${c.country_code}">${c.name} (${c.country_code})</option>`).join("");
        const savedId = Store.getCompanyId();
        if (savedId && companies.some((c) => String(c.id) === savedId)) select.value = savedId;
        else Store.setCompanyId(select.value);
        select.dataset.loaded = "1";

        select.addEventListener("change", () => {
          Store.setCompanyId(select.value);
          const activeOpt = select.selectedOptions[0];
          if (currentOnCompanyChange) {
            currentOnCompanyChange(select.value, activeOpt ? activeOpt.dataset.country : "IN");
          }
        });
      }
    }

    isShellInitialized = true;
    const active = select && select.selectedOptions[0];
    return {
      id: select ? select.value : "1",
      country: active ? active.dataset.country : "IN"
    };
  }

  window.VoyagerShell = { init, navigateTo };
})(window);