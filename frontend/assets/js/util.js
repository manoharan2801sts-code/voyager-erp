(function (window) {
  function fmtMoney(value, ccy) {
    const n = Number(value) || 0;
    return `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function statusPill(status) {
    const tone = window.VoyagerHardcode.STATUS_MAP[status] || "neutral";
    return `<span class="pill pill-${tone}">${status}</span>`;
  }
  function currencyFor(country) {
    return country === "AE" ? "AED" : "INR";
  }
  window.VoyagerUtil = { fmtMoney, fmtDate, statusPill, currencyFor };
})(window);
