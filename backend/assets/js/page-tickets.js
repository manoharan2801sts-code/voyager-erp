(async function () {
  const { get } = window.VoyagerAPI;
  const { fmtMoney, fmtDate, statusPill, currencyFor } = window.VoyagerUtil;
  const { zoomInUrl } = window.VoyagerEntry;
  let dt, activeCompanyId;

  // ============================================================
  // Ticket details modal — built directly in this file (not a separate
  // script) so there's nothing extra to remember to add to the page.
  // Reuses the same .dd-overlay/.dd-panel styling used by drill-downs
  // elsewhere in the app.
  // ============================================================
  function ensureDetailsModal() {
    let modal = document.getElementById("ticket-details-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "ticket-details-modal";
    modal.className = "dd-overlay";
    modal.innerHTML = `
      <div class="dd-panel" style="width:min(820px, 94vw);">
        <div class="dd-header">
          <div>
            <div class="dd-title" id="td-title"></div>
            <div class="dd-subtitle" id="td-subtitle"></div>
          </div>
          <button type="button" class="dd-close" id="td-close" aria-label="Close">&times;</button>
        </div>
        <div class="dd-body" id="td-body" style="padding:20px;"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
    document.getElementById("td-close").addEventListener("click", () => modal.classList.remove("open"));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.remove("open"); });
    return modal;
  }

  function dval(v) {
    return (v === null || v === undefined || v === "") ? '<span class="text-muted-custom">—</span>' : v;
  }
  function frow(label, value) {
    return `<div><div class="field-label" style="margin-bottom:0.15rem;">${label}</div><div style="font-size:14px;">${dval(value)}</div></div>`;
  }
  function fsection(title, fieldsHtml, first) {
    return `<div class="entry-section-title" style="font-size:0.72rem; margin:${first ? "0" : "16px"} 0 10px;">${title}</div>
      <div class="entry-grid">${fieldsHtml}</div>`;
  }

  function showTicketDetails(ticket, ccy, editUrl) {
    const modal = ensureDetailsModal();
    document.getElementById("td-title").textContent = `${ticket.ticket_no} — ${ticket.passenger_name}`;
    document.getElementById("td-subtitle").textContent = `${ticket.pnr} · ${ticket.sector} · ${ticket.airline_name}`;

    const header = fsection("Invoice & booking header", [
      frow("Invoice Number", ticket.invoice_number),
      frow("Invoice Date", ticket.invoice_date && fmtDate(ticket.invoice_date)),
      frow("Invoice Type", ticket.invoice_type),
      frow("Booking Mode", ticket.booking_mode),
      frow("Booking Type", ticket.booking_type),
      frow("Booking Status", ticket.booking_status),
      frow("Customer Name", ticket.customer_name),
      frow("Travel Type", ticket.travel_type),
      frow("User Name", ticket.user_name),
      frow("Currency", ticket.currency || ccy),
      frow("ROE", ticket.roe),
      frow("Booking Given By", ticket.booking_given_by),
      frow("Payment Mode", ticket.payment_mode),
      frow("Airline Category", ticket.airline_category),
    ].join(""), true);

    const booking = fsection("Booking reference", [
      frow("Booking Reference", ticket.booking_reference),
      frow("Booking Ref Date", ticket.booking_ref_date && fmtDate(ticket.booking_ref_date)),
      frow("Airline PNR", ticket.airline_pnr),
      frow("GDS PNR", ticket.gds_pnr),
      frow("Supplier", ticket.supplier_name),
      frow("Office ID", ticket.office_id),
    ].join(""));

    const line = fsection("Ticket line", [
      frow("Pax Name", ticket.passenger_name),
      frow("Pax Type", ticket.pax_type),
      frow("Sector", ticket.sector),
      frow("Flight No", ticket.flight_no),
      frow("Travel Date", fmtDate(ticket.travel_date)),
      frow("Basic Fare", fmtMoney(ticket.basic_fare, ccy)),
      frow("YQ", ticket.yq !== undefined ? fmtMoney(ticket.yq, ccy) : null),
      frow("YR", ticket.yr !== undefined ? fmtMoney(ticket.yr, ccy) : null),
      frow("K3 Tax", ticket.k3_tax !== undefined ? fmtMoney(ticket.k3_tax, ccy) : null),
      frow("Tax and Others", ticket.tax_others !== undefined ? fmtMoney(ticket.tax_others, ccy) : null),
      frow("Seat", ticket.seat !== undefined ? fmtMoney(ticket.seat, ccy) : null),
      frow("Meal", ticket.meal !== undefined ? fmtMoney(ticket.meal, ccy) : null),
      frow("Baggage", ticket.baggage !== undefined ? fmtMoney(ticket.baggage, ccy) : null),
      frow("Other SSR", ticket.other_ssr !== undefined ? fmtMoney(ticket.other_ssr, ccy) : null),
      frow("Cust Discount On", ticket.disc_on),
      frow("Cust Discount Type", ticket.disc_type),
      frow("Discount Value", ticket.disc_value),
      frow("TDS %", ticket.tds_per),
      frow("Markup", fmtMoney(ticket.markup, ccy)),
      frow("Addl Markup", ticket.addl_markup !== undefined ? fmtMoney(ticket.addl_markup, ccy) : null),
      frow("Service Fee", fmtMoney(ticket.service_fee, ccy)),
      frow("Addl Service Fee", ticket.addl_service_fee !== undefined ? fmtMoney(ticket.addl_service_fee, ccy) : null),
      frow("GST %", ticket.gst_pct),
      frow("Total Billed", `<b style="color:var(--color-teal);">${fmtMoney(ticket.total_billed, ccy)}</b>`),
      frow("Status", statusPill(ticket.status)),
    ].join(""));

    document.getElementById("td-body").innerHTML = header + booking + line +
      `<div class="entry-actions" style="margin-top:20px;"><a href="${editUrl}" class="btn-brand">Edit This Ticket</a></div>`;

    modal.classList.add("open");
  }

  // ============================================================
  // List load + row click
  // ============================================================
  const TICKETS_API = (window.VoyagerAPI && window.VoyagerAPI.BASE_URL)
    ? `${window.VoyagerAPI.BASE_URL}/tickets/`
    : "/api/tickets/";

  async function load(companyId, country) {
    activeCompanyId = companyId;
    let rows = [];
    try {
      const res = await fetch(`${TICKETS_API}?company_id=${companyId}`);
      if (!res.ok) throw new Error(`Tickets API returned ${res.status}`);
      rows = await res.json();
    } catch (err) {
      console.error("Could not load tickets from the Django API — is it running on localhost:8000?", err);
    }
    const ccy = currencyFor(country);
    document.getElementById("row-count").textContent = `${rows.length} tickets`;
    if (dt) dt.destroy();
    $("#data-table tbody").html(rows.map((t) => `
      <tr class="drillable" data-id="${t.id}" title="Click to view / correct this ticket">
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
      const ticket = rows.find((r) => String(r.id) === String($(this).data("id")));
      if (!ticket) return;
      const editUrl = zoomInUrl("ticket-entry.html", ticket.id, "tickets.html");
      showTicketDetails(ticket, ccy, editUrl);
    });
  }

  const active = await VoyagerShell.init({ activeKey: "tickets", onCompanyChange: load });
  if (active) load(active.id, active.country);
})();