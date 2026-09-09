(async function () {
  const { get } = window.VoyagerAPI;
  const { fmtMoney, fmtDate, statusPill, currencyFor } = window.VoyagerUtil;
  const { zoomInUrl } = window.VoyagerEntry;
  let dt, activeCompanyId;

  // ============================================================
  // List load + row click (navigates directly to ticket-entry in view mode)
  // ============================================================
  async function load(companyId, country) {
    activeCompanyId = companyId;
    let rows = [];
    try {
      const data = await get(`/tickets/?company_id=${companyId}`);
      rows = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn("Could not load tickets:", err);
      rows = [];
    }
    const ccy = currencyFor(country);
    document.getElementById("row-count").textContent = `${rows.length} tickets`;
    if (dt) dt.destroy();
    $("#data-table tbody").html(rows.map((t) => `
      <tr class="drillable" data-id="${t.id}" title="Click to view this ticket">
        <td><span class="tabular-nums" style="font-family:var(--font-mono);">${t.pnr}</span></td>
        <td>${t.ticket_no}</td>
        <td>${t.airline_name}</td>
        <td>${t.passenger_name}</td>
        <td>${t.sector}</td>
        <td>${fmtDate(t.issue_date)}</td>
        <td class="tabular-nums">${fmtMoney(t.basic_fare, ccy)}</td>
        <td class="tabular-nums">${fmtMoney(t.markup, ccy)}</td>
        <td class="tabular-nums" style="font-weight:700;">${fmtMoney(t.total_billed, ccy)}</td>
        <td>${statusPill(t.status)}</td>
      </tr>`).join(""));
    if (typeof $.fn.DataTable === "function") {
      dt = $("#data-table").DataTable({ pageLength: 10, order: [[5, "desc"]], language: { info: "Showing <b>_START_</b> to <b>_END_</b> of <b>_TOTAL_</b> entries", infoEmpty: "No entries to show", infoFiltered: "(filtered from <b>_MAX_</b> total entries)", search: "", searchPlaceholder: "Search…", paginate: { first: "«", previous: "‹", next: "›", last: "»" } } });
    } else {
      console.warn("DataTables library didn't load (CDN blocked or failed) — showing a plain table, no pagination/search.");
    }
    $("#data-table tbody").off("click", "tr").on("click", "tr", function () {
      const ticketId = $(this).data("id");
      if (!ticketId) return;
      window.location.href = `ticket-entry.html?id=${ticketId}&mode=view&returnTo=tickets.html`;
    });
  }

  const active = await VoyagerShell.init({ activeKey: "tickets", onCompanyChange: load });
  if (active) load(active.id, active.country);
})();