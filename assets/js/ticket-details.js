/**
 * Voyager ERP — Ticket details modal
 * Click a row on the Ticket register -> shows every field the ticket-entry
 * form can capture (invoice header, booking reference, fare breakup).
 * Older seeded tickets don't have the newer fields, so those render as "—".
 */
(function (window) {
  function ensureModal() {
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

    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    document.getElementById("td-close").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return modal;
  }

  function close() {
    const modal = document.getElementById("ticket-details-modal");
    if (modal) modal.classList.remove("open");
  }

  function val(v) {
    if (v === null || v === undefined || v === "") return "<span class=\"text-muted-custom\">—</span>";
    return v;
  }

  function fieldRow(label, value) {
    return `<div><div class="field-label" style="margin-bottom:0.15rem;">${label}</div><div style="font-size:14px;">${val(value)}</div></div>`;
  }

  function section(title, fieldsHtml) {
    return `<div class="entry-section-title" style="font-size:0.72rem; margin:${title === "Invoice & booking header" ? "0" : "16px"} 0 10px;">${title}</div>
      <div class="entry-grid">${fieldsHtml}</div>`;
  }

  function show(ticket, ccy, editUrl) {
    const modal = ensureModal();
    const { fmtMoney, fmtDate } = window.VoyagerUtil;

    document.getElementById("td-title").textContent = `${ticket.ticket_no} — ${ticket.passenger_name}`;
    document.getElementById("td-subtitle").textContent = `${ticket.pnr} · ${ticket.sector} · ${ticket.airline_name}`;

    const header = section("Invoice & booking header", [
      fieldRow("Invoice Number", ticket.invoice_number),
      fieldRow("Invoice Date", ticket.invoice_date && fmtDate(ticket.invoice_date)),
      fieldRow("Invoice Type", ticket.invoice_type),
      fieldRow("Booking Mode", ticket.booking_mode),
      fieldRow("Booking Type", ticket.booking_type),
      fieldRow("Booking Status", ticket.booking_status),
      fieldRow("Customer Name", ticket.customer_name),
      fieldRow("Travel Type", ticket.travel_type),
      fieldRow("User Name", ticket.user_name),
      fieldRow("Currency", ticket.currency || ccy),
      fieldRow("ROE", ticket.roe),
      fieldRow("Booking Given By", ticket.booking_given_by),
    ].join(""));

    const booking = section("Booking reference", [
      fieldRow("Booking Reference", ticket.booking_reference),
      fieldRow("Booking Ref Date", ticket.booking_ref_date && fmtDate(ticket.booking_ref_date)),
      fieldRow("Airline PNR", ticket.airline_pnr),
      fieldRow("GDS PNR", ticket.gds_pnr),
      fieldRow("Supplier", ticket.supplier_name),
      fieldRow("Office ID", ticket.office_id),
    ].join(""));

    const line = section("Ticket line", [
      fieldRow("Pax Name", ticket.passenger_name),
      fieldRow("Pax Type", ticket.pax_type),
      fieldRow("Sector", ticket.sector),
      fieldRow("Travel Date", fmtDate(ticket.travel_date)),
      fieldRow("Basic Fare", fmtMoney(ticket.basic_fare, ccy)),
      fieldRow("YQ", ticket.yq !== undefined ? fmtMoney(ticket.yq, ccy) : null),
      fieldRow("YR", ticket.yr !== undefined ? fmtMoney(ticket.yr, ccy) : null),
      fieldRow("K3 Tax", ticket.k3_tax !== undefined ? fmtMoney(ticket.k3_tax, ccy) : null),
      fieldRow("Tax and Others", ticket.tax_others !== undefined ? fmtMoney(ticket.tax_others, ccy) : null),
      fieldRow("Seat", ticket.seat !== undefined ? fmtMoney(ticket.seat, ccy) : null),
      fieldRow("Meal", ticket.meal !== undefined ? fmtMoney(ticket.meal, ccy) : null),
      fieldRow("Baggage", ticket.baggage !== undefined ? fmtMoney(ticket.baggage, ccy) : null),
      fieldRow("Other SSR", ticket.other_ssr !== undefined ? fmtMoney(ticket.other_ssr, ccy) : null),
      fieldRow("Cust Discount On", ticket.disc_on),
      fieldRow("Cust Discount Type", ticket.disc_type),
      fieldRow("Discount Value", ticket.disc_value),
      fieldRow("TDS %", ticket.tds_per),
      fieldRow("Markup", fmtMoney(ticket.markup, ccy)),
      fieldRow("Addl Markup", ticket.addl_markup !== undefined ? fmtMoney(ticket.addl_markup, ccy) : null),
      fieldRow("Service Fee", fmtMoney(ticket.service_fee, ccy)),
      fieldRow("Addl Service Fee", ticket.addl_service_fee !== undefined ? fmtMoney(ticket.addl_service_fee, ccy) : null),
      fieldRow("GST %", ticket.gst_pct),
      fieldRow("Total Billed", `<b style="color:var(--color-teal);">${fmtMoney(ticket.total_billed, ccy)}</b>`),
      fieldRow("Status", window.VoyagerUtil.statusPill(ticket.status)),
    ].join(""));

    document.getElementById("td-body").innerHTML = header + booking + line +
      `<div class="entry-actions" style="margin-top:20px;"><a href="${editUrl}" class="btn-brand">Edit This Ticket</a></div>`;

    modal.classList.add("open");
  }

  window.VoyagerTicketDetails = { show, close };
})(window);