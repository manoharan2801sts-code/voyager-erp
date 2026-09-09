/**
 * Voyager ERP — API client with High-Speed In-Memory Caching & Instant Mock Fallback
 * Provides ultra-fast (0ms) in-memory cached responses and instant fallback.
 */
(function (window) {
  const API_BASE =
    window.location.protocol === "file:" ||
    (window.location.hostname === "localhost" && window.location.port !== "8000") ||
    (window.location.hostname === "127.0.0.1" && window.location.port !== "8000")
      ? "http://localhost:8000/api"
      : ((window.location.hostname.endsWith(".github.io") || (window.location.hostname.includes("onrender.com") && window.location.hostname !== "voyager-erp.onrender.com"))
          ? "https://voyager-erp.onrender.com/api"
          : "/api");

  const TOKEN_KEY = "voyager_access_token";
  const REFRESH_KEY = "voyager_refresh_token";
  const USER_KEY = "voyager_user";
  const COMPANY_KEY = "voyager_active_company_id";
  const MOCK_KEY = "voyager_mock_mode";

  const Store = {
    getToken: () => localStorage.getItem(TOKEN_KEY),
    setToken: (t) => localStorage.setItem(TOKEN_KEY, t),
    getRefresh: () => localStorage.getItem(REFRESH_KEY),
    setRefresh: (t) => localStorage.setItem(REFRESH_KEY, t),
    getUser: () => JSON.parse(localStorage.getItem(USER_KEY) || "null"),
    setUser: (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
    getCompanyId: () => localStorage.getItem(COMPANY_KEY),
    setCompanyId: (id) => localStorage.setItem(COMPANY_KEY, id),
    isMockMode: () => {
      const token = localStorage.getItem(TOKEN_KEY);
      return (
        localStorage.getItem(MOCK_KEY) === "1" ||
        token === "demo-token" ||
        (token && token.startsWith("mock-")) ||
        !token
      );
    },
    setMockMode: (on) => (on ? localStorage.setItem(MOCK_KEY, "1") : localStorage.removeItem(MOCK_KEY)),
    clear: () => {
      [TOKEN_KEY, REFRESH_KEY, USER_KEY, MOCK_KEY].forEach((k) => localStorage.removeItem(k));
      apiCache.clear();
    },
  };

  // Ultra-fast in-memory cache for instant GET requests
  const apiCache = new Map();

  // Known Django endpoints implemented in backend
  const DJANGO_PREFIXES = [
    "/ledger-groups",
    "/ledgers",
    "/customers",
    "/suppliers",
    "/accounts",
    "/tickets"
  ];

  function isDjangoEndpoint(path) {
    const p = path.split("?")[0].replace(/^\/api/, "");
    return DJANGO_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
  }

  async function request(path, { method = "GET", body, auth = true, retry = true } = {}) {
    const cacheKey = `${method}:${path}:${body ? JSON.stringify(body) : ""}`;

    // Return instant cached data for GET requests (0ms)
    if (method === "GET" && apiCache.has(cacheKey)) {
      return apiCache.get(cacheKey);
    }

    // Instantly route non-Django paths (like /companies, /dashboard, etc.) with 0ms delay
    if (!isDjangoEndpoint(path) && window.VoyagerMock) {
      const result = window.VoyagerMock.handle(path, { method, body });
      if (method === "GET") apiCache.set(cacheKey, result);
      else apiCache.clear();
      return result;
    }

    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const token = Store.getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      // 1500ms timeout allows Django server to query database without hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 401 && auth && retry) {
        const refreshed = await tryRefresh();
        if (refreshed) return request(path, { method, body, auth, retry: false });
        Store.clear();
        window.location.href = "index.html";
        return Promise.reject(new Error("Session expired"));
      }

      if (!res.ok) {
        // If backend route not found or error, fallback to mock data if available
        if (window.VoyagerMock) {
          const mockResult = window.VoyagerMock.handle(path, { method, body });
          if (method === "GET") apiCache.set(cacheKey, mockResult);
          else apiCache.clear();
          return mockResult;
        }
        let detail = "Request failed";
        try {
          const data = await res.json();
          detail = data.detail || JSON.stringify(data);
        } catch (_) {}
        throw new Error(detail);
      }

      if (res.status === 204) return null;
      const data = await res.json();
      if (method === "GET") apiCache.set(cacheKey, data);
      else apiCache.clear();
      return data;
    } catch (err) {
      // Graceful instant fallback to mock data on network error or timeout
      if (window.VoyagerMock) {
        const mockResult = window.VoyagerMock.handle(path, { method, body });
        if (method === "GET") apiCache.set(cacheKey, mockResult);
        else apiCache.clear();
        return mockResult;
      }
      throw err;
    }
  }

  async function tryRefresh() {
    const refresh_token = Store.getRefresh();
    if (!refresh_token) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      Store.setToken(data.access_token);
      return true;
    } catch (_) {
      return false;
    }
  }

  window.VoyagerAPI = {
    API_BASE,
    Store,
    apiCache,
    get: (path) => request(path),
    post: (path, body, opts = {}) => request(path, { method: "POST", body, ...opts }),
    put: (path, body, opts = {}) => request(path, { method: "PUT", body, ...opts }),
    del: (path, opts = {}) => request(path, { method: "DELETE", ...opts }),
  };
})(window);
