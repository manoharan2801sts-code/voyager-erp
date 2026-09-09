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

  function navigateTo(url) {
    if (url && url !== "#") {
      window.location.href = url;
    }
  }

  function renderShellImmediate(activeKey) {
    if (!Store.getToken()) {
      Store.setToken("demo-token");
      Store.setRefresh("demo-refresh");
      Store.setUser(window.VoyagerMock ? window.VoyagerMock.USER : { full_name: "Ananya Krishnan" });
      Store.setMockMode(true);
    }
    const user = Store.getUser() || { full_name: "Ananya Krishnan" };
    const userName = (user && user.full_name && typeof user.full_name === "string") ? user.full_name : "Ananya Krishnan";
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";

    // 1. Build Topnav Immediately
    const topnav = document.getElementById("shell-topnav");
    if (topnav && !topnav.innerHTML.trim()) {
      topnav.innerHTML = `
        <button class="sidebar-toggle-btn" id="sidebar-toggle" aria-label="Toggle sidebar">
          ${icon("M3 6h18M3 12h18M3 18h18")}
        </button>
        <a class="app-logo" href="dashboard.html" title="Voyager ERP Home">
          <span class="mark">${icon("M2 16l20-8-8 20-2-8-8-2z").replace("currentColor", "#fff")}</span>
          Voyager <span style="font-weight:500; color:var(--color-text-muted);">ERP</span>
        </a>
        <select class="form-control-custom company-selector" id="company-selector"></select>
        <div class="global-search">
          <span class="icon">${icon("M11 11m-7 0a7 7 0 1014 0 7 7 0 10-14 0")}</span>
          <input type="text" placeholder="Search PNR, invoice, customer, supplier…" />
        </div>
        <div class="topnav-actions">
          <!-- 1. Profile Pill First -->
          <div class="user-chip" id="user-profile-chip" title="Logged in as ${userName}">
            <span class="user-avatar">${initials(userName)}</span>
            <span style="font-size:0.85rem; font-weight:600;">${userName.split(" (")[0]}</span>
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
    }

    if (topnav) {
      // Refresh user chip details if already rendered
      const chip = document.getElementById("user-profile-chip");
      if (chip) {
        chip.title = `Logged in as ${userName}`;
        const avatar = chip.querySelector(".user-avatar");
        if (avatar) avatar.textContent = initials(userName);
        const nameText = chip.querySelector("span:last-child");
        if (nameText) nameText.textContent = userName.split(" (")[0];
      }

      // Theme Toggle Handler
      const themeBtn = document.getElementById("theme-toggle-btn");
      if (themeBtn && !themeBtn.dataset.bound) {
        themeBtn.dataset.bound = "1";
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
      if (toggleBtn && !toggleBtn.dataset.bound) {
        toggleBtn.dataset.bound = "1";
        toggleBtn.addEventListener("click", () => {
          document.getElementById("shell-sidebar").classList.toggle("collapsed");
        });
      }
    }


    // 2. Build Sidebar Immediately
    const sidebar = document.getElementById("shell-sidebar");
    if (sidebar && !sidebar.innerHTML.trim()) {
      sidebar.innerHTML = renderNav(activeKey);
    } else {
      updateActiveNav(activeKey, window.location.pathname);
    }

    // 3. Bind Logout link immediately
    const logoutLink = document.getElementById("logout-link");
    if (logoutLink && !logoutLink.dataset.bound) {
      logoutLink.dataset.bound = "1";
      logoutLink.addEventListener("click", (e) => {
        e.preventDefault();
        try { window.VoyagerAPI.post("/auth/logout"); } catch (_) {}
        Store.clear();
        window.location.replace("index.html");
      });
    }

    const staleMenubar = document.getElementById("shell-menubar");
    if (staleMenubar) staleMenubar.remove();
  }

  // Pre-render immediately on script execution to ensure the logo is visible with zero latency
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => renderShellImmediate(null));
  } else {
    renderShellImmediate(null);
  }

  async function init({ activeKey, onCompanyChange }) {
    currentOnCompanyChange = onCompanyChange;

    // Ensure shell & logo are rendered
    renderShellImmediate(activeKey);

    document.querySelectorAll("[data-phase2]").forEach((el) => {
      if (!el.dataset.bound) {
        el.dataset.bound = "1";
        el.addEventListener("click", (e) => {
          e.preventDefault();
          alert("This module is part of the Phase 2 build.");
        });
      }
    });

    // Company Selector Setup
    const select = document.getElementById("company-selector");
    if (select) {
      if (!select.dataset.loaded) {
        try {
          let companies = null;
          try {
            const cached = sessionStorage.getItem("voyager_companies");
            if (cached) companies = JSON.parse(cached);
          } catch (_) {}
          if (!Array.isArray(companies) || companies.length === 0) {
            companies = await get("/companies");
            if (Array.isArray(companies) && companies.length > 0) {
              try { sessionStorage.setItem("voyager_companies", JSON.stringify(companies)); } catch (_) {}
            }
          }
          if (Array.isArray(companies) && companies.length > 0) {
            select.innerHTML = companies.map((c) =>
              `<option value="${c.id}" data-country="${c.country_code}">${c.name} (${c.country_code})</option>`).join("");
            const savedId = Store.getCompanyId();
            if (savedId && companies.some((c) => String(c.id) === savedId)) select.value = savedId;
            else Store.setCompanyId(select.value);
            select.dataset.loaded = "1";
          }
        } catch (e) {
          console.warn("Could not load company list:", e);
        }

        if (!select.dataset.listenerBound) {
          select.dataset.listenerBound = "1";
          select.addEventListener("change", () => {
            Store.setCompanyId(select.value);
            const activeOpt = select.selectedOptions[0];
            if (currentOnCompanyChange) {
              currentOnCompanyChange(select.value, activeOpt ? activeOpt.dataset.country : "IN");
            }
          });
        }
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