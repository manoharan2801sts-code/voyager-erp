(async function () {
  const { fillSelect, getEditId, getReturnTo } = window.VoyagerEntry;
  const OPT = window.VoyagerHardcode.TICKET_FORM_OPTIONS;
  let activeCompanyId, activeCountry, allCustomers = [], allSuppliers = [], existingTickets = [];
  let lineCount = 0;
  const editId = getEditId();
  const returnTo = getReturnTo("tickets.html");
  document.getElementById("cancel-link").href = returnTo;

  // ---- plain option-list dropdowns (hardcoded values from the spec) ----
  function fillPlain(id, values, placeholder) {
    const el = document.getElementById(id);
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : "") +
      values.map((v) => `<option value="${v}">${v}</option>`).join("");
  }
  fillPlain("invoice_type", OPT.invoiceTypes, "Select…");
  fillPlain("booking_type", OPT.bookingTypes, "Select…");
  fillPlain("booking_status", OPT.bookingStatuses, "Select…");
  fillPlain("travel_type", OPT.travelTypes, "Select…");
  fillPlain("user_name", OPT.userNames, "Select…");
  fillPlain("payment_mode", OPT.paymentModes, "Select…");
  fillPlain("airline_category", OPT.airlineCategories, "Select…");
  document.getElementById("booking_mode").textContent = OPT.defaultBookingMode;

  // ============================================================
  // Part 1/2 reference data (real backend for customers/suppliers)
  // ============================================================
  const CUSTOMERS_API = "http://localhost:8000/api/customers/";
  const SUPPLIERS_API = "http://localhost:8000/api/suppliers/";

  async function populateRefs(companyId) {
    const ref = window.VoyagerMock.getReferenceData(companyId);
    document.getElementById("currency").textContent = ref.currency;

    try {
      const [custRes, suppRes] = await Promise.all([
        fetch(`${CUSTOMERS_API}?company_id=${companyId}`),
        fetch(`${SUPPLIERS_API}?company_id=${companyId}`),
      ]);
      if (!custRes.ok) throw new Error(`Customers API returned ${custRes.status}`);
      if (!suppRes.ok) throw new Error(`Suppliers API returned ${suppRes.status}`);
      allCustomers = await custRes.json();
      allSuppliers = await suppRes.json();
    } catch (err) {
      console.error("Could not load customers/suppliers from the Django API — is it running on localhost:8000?", err);
      alert("Could not load customers/suppliers from the database. Is the Django backend running? Create ledgers under Sundry Debtors/Sundry Creditors first.");
      allCustomers = []; allSuppliers = [];
    }
    document.getElementById("customer-options").innerHTML = allCustomers.map((c) => `<option value="${c.name}">`).join("");
    document.getElementById("supplier-options").innerHTML = allSuppliers.map((s) => `<option value="${s.name}">`).join("");
    recalcInvoiceTotal();
  }

  document.getElementById("customer").addEventListener("input", (e) => {
    const c = allCustomers.find((c) => c.name === e.target.value);
    document.getElementById("customer_code").textContent = c ? c.code : "—";
    document.getElementById("customer_address").textContent = c && c.address ? c.address : "—";
    document.getElementById("customer_gst").textContent = c && c.gst_no ? c.gst_no : "—";
  });
  document.getElementById("supplier").addEventListener("input", (e) => {
    const s = allSuppliers.find((s) => s.name === e.target.value);
    document.getElementById("office_id").value = s && s.office_id ? s.office_id : "";
  });

  // ============================================================
  // Passenger table — one <tr class="pax-row"> + one sibling
  // <tr class="pax-detail-row"> (expandable) per passenger.
  // ============================================================
  const linesBody = document.getElementById("ticket-lines");

  function buildPaxRowHTML() {
    return `
<tr class="pax-row">
  <td class="pax-num-col" data-label="#"></td>
  <td data-label="Airline Code"><input class="line-airline-code" maxlength="3" /></td>
  <td data-label="Airline Name"><input class="line-airline-name" /></td>
  <td data-label="Flight No"><input class="line-flight-no" /></td>
  <td data-label="Ticket No *"><input class="line-ticket-no" required /></td>
  <td data-label="Pax Name *"><input class="line-pax-name" maxlength="30" required /></td>
  <td data-label="Pax Type"><select class="line-pax-type"></select></td>
  <td data-label="Sector"><input class="line-sector" /></td>
  <td data-label="Travel Date">
    <div class="date-group line-travel-date" style="gap:2px;">
      <input class="dg-dd" inputmode="numeric" maxlength="2" placeholder="dd" style="width:28px; height:32px; font-size:12px;" />
      <span class="dg-sep">-</span>
      <input class="dg-mm" inputmode="numeric" maxlength="2" placeholder="mm" style="width:28px; height:32px; font-size:12px;" />
      <span class="dg-sep">-</span>
      <input class="dg-yyyy" inputmode="numeric" maxlength="4" placeholder="yyyy" style="width:44px; height:32px; font-size:12px;" />
    </div>
  </td>
  <td data-label="Basic Fare"><input class="line-calc line-basic-fare" type="number" value="0" min="0" step="0.01" /></td>
  <td data-label="Markup"><input class="line-calc line-markup" type="number" value="0" min="0" step="0.01" /></td>
  <td data-label="Service Fee"><input class="line-calc line-service-fee" type="number" value="0" min="0" step="0.01" /></td>
  <td data-label="GST %"><input class="line-calc line-gst-pct" type="number" value="0" min="0" step="0.01" /></td>
  <td class="pax-total-cell line-total-computed" data-label="Total">0.00</td>
  <td data-label=""><button type="button" class="pax-expand-btn" title="More fare details">⋯ More</button></td>
  <td data-label=""><button type="button" class="pax-remove-btn remove-line-btn" title="Remove passenger">✕ Remove</button></td>
</tr>
<tr class="pax-detail-row collapsed">
  <td colspan="16">
    <div class="pax-detail-grid">
      <div><label>YQ</label><input class="line-calc line-yq" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>YR</label><input class="line-calc line-yr" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>K3 Tax</label><input class="line-calc line-k3" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Tax and Others</label><input class="line-calc line-tax-others" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Seat</label><input class="line-calc line-seat" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Meal</label><input class="line-calc line-meal" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Baggage</label><input class="line-calc line-baggage" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Other SSR</label><input class="line-calc line-other-ssr" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Cust Discount On</label><select class="line-disc-on"></select></div>
      <div><label>Cust Discount Type</label><select class="line-disc-type"></select></div>
      <div><label class="disc-value-label">Discount</label><input class="line-calc line-disc-value" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Cust Discount (computed)</label><input class="line-disc-computed" value="0.00" disabled /></div>
      <div><label>TDS %</label><input class="line-calc line-tds-per" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>TDS Amount (computed)</label><input class="line-tds-computed" value="0.00" disabled /></div>
      <div><label>Addl Markup</label><input class="line-calc line-addl-markup" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>Addl Service Fee</label><input class="line-calc line-addl-service-fee" type="number" value="0" min="0" step="0.01" /></div>
      <div><label>GST Amount (computed)</label><input class="line-gst-computed" value="0.00" disabled /></div>
    </div>
  </td>
</tr>`;
  }

  function renumberRows() {
    const rows = linesBody.querySelectorAll(".pax-row");
    rows.forEach((row, i) => {
      row.querySelector(".pax-num-col").textContent = i + 1;
    });
    document.getElementById("pax-count").textContent = `${rows.length} Passenger${rows.length === 1 ? "" : "s"}`;
  }

  function fillPlain2(root, selector, values, placeholder) {
    const el = root.querySelector(selector);
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : "") +
      values.map((v) => `<option value="${v}">${v}</option>`).join("");
  }

  function addLine() {
    lineCount += 1;
    const beforeCount = linesBody.children.length;
    linesBody.insertAdjacentHTML("beforeend", buildPaxRowHTML());
    const row = linesBody.children[beforeCount];
    const detailRow = linesBody.children[beforeCount + 1];
    row.dataset.lineId = lineCount;

    fillPlain2(row, ".line-pax-type", OPT.paxTypes, "Select…");
    fillPlain2(detailRow, ".line-disc-on", OPT.custDiscountOn, "Select…");
    fillPlain2(detailRow, ".line-disc-type", OPT.custDiscountTypes, "Select…");
    detailRow.querySelector(".line-disc-type").addEventListener("change", () => updateDiscountLabel(row, detailRow));
    updateDiscountLabel(row, detailRow);

    [row, detailRow].forEach((r) => {
      r.querySelectorAll(".line-calc, .line-disc-on, .line-disc-type").forEach((el) => {
        el.addEventListener("input", () => recalcLine(row, detailRow));
        el.addEventListener("change", () => recalcLine(row, detailRow));
      });
    });
    row.querySelector(".remove-line-btn").addEventListener("click", () => {
      row.remove(); detailRow.remove(); renumberRows(); recalcInvoiceTotal();
    });
    row.querySelector(".pax-expand-btn").addEventListener("click", () => {
      detailRow.classList.toggle("collapsed");
    });
    row.querySelector(".line-ticket-no").addEventListener("blur", () => validateTicketNoUnique(row));
    wireDateGroup(row.querySelector(".line-travel-date"));

    renumberRows();
    recalcLine(row, detailRow);
  }

  function num(root, selector) {
    const el = root.querySelector(selector);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  function updateDiscountLabel(row, detailRow) {
    const type = detailRow.querySelector(".line-disc-type").value;
    const label = detailRow.querySelector(".disc-value-label");
    const input = detailRow.querySelector(".line-disc-value");
    if (type === "Percentage") { label.textContent = "Discount %"; input.max = "100"; }
    else if (type === "Flat") { label.textContent = "Discount Amount (Flat)"; input.removeAttribute("max"); }
    else { label.textContent = "Discount"; input.removeAttribute("max"); }
    recalcLine(row, detailRow);
  }

  // Cust Discount + TDS + GST + Total, per the spec's exact formulas
  function recalcLine(row, detailRow) {
    const basic = num(row, ".line-basic-fare");
    const yq = num(detailRow, ".line-yq"), yr = num(detailRow, ".line-yr");
    const k3 = num(detailRow, ".line-k3"), taxOthers = num(detailRow, ".line-tax-others");
    const seat = num(detailRow, ".line-seat"), meal = num(detailRow, ".line-meal");
    const baggage = num(detailRow, ".line-baggage"), otherSsr = num(detailRow, ".line-other-ssr");
    const discOn = detailRow.querySelector(".line-disc-on").value;
    const discType = detailRow.querySelector(".line-disc-type").value;
    const discValue = num(detailRow, ".line-disc-value");
    const tdsPer = num(detailRow, ".line-tds-per");
    const markup = num(row, ".line-markup"), addlMarkup = num(detailRow, ".line-addl-markup");
    const serviceFee = num(row, ".line-service-fee"), addlServiceFee = num(detailRow, ".line-addl-service-fee");
    const gstPct = num(row, ".line-gst-pct");

    const baseMap = { "Basic": basic, "Basic + YQ": basic + yq, "Basic + YR": basic + yr,
      "Basic + YQ + YR": basic + yq + yr, "Gross": basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr };
    const discBase = baseMap[discOn] || 0;
    const custDiscount = discType === "Percentage" ? discBase * (discValue / 100) : (discType === "Flat" ? discValue : 0);
    const tdsAmount = custDiscount * (tdsPer / 100);
    const gstAmount = (serviceFee + addlServiceFee) * (gstPct / 100);

    const total = basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr
      - custDiscount + tdsAmount + markup + addlMarkup + serviceFee + addlServiceFee + gstAmount;

    detailRow.querySelector(".line-disc-computed").value = custDiscount.toFixed(2);
    detailRow.querySelector(".line-tds-computed").value = tdsAmount.toFixed(2);
    detailRow.querySelector(".line-gst-computed").value = gstAmount.toFixed(2);
    row.querySelector(".line-total-computed").textContent = total.toFixed(2);
    row.dataset.total = total;
    recalcInvoiceTotal();
  }

  function recalcInvoiceTotal() {
    let sum = 0;
    linesBody.querySelectorAll(".pax-row").forEach((r) => { sum += parseFloat(r.dataset.total) || 0; });
    const ccy = document.getElementById("currency").textContent || (activeCountry === "AE" ? "AED" : "INR");
    document.getElementById("invoice_total").textContent =
      `${ccy} ${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  document.getElementById("add-line-btn").addEventListener("click", () => addLine());

  // ============================================================
  // dd-mm-yyyy date handling — three INDEPENDENT boxes (day/month/year).
  // ============================================================
  function wireDateGroup(container) {
    const dd = container.querySelector(".dg-dd"), mm = container.querySelector(".dg-mm"), yyyy = container.querySelector(".dg-yyyy");
    const segments = [dd, mm, yyyy];
    segments.forEach((el, i) => {
      el.addEventListener("input", () => {
        el.value = el.value.replace(/\D/g, "").slice(0, el.maxLength);
        if (el.value.length === el.maxLength && segments[i + 1]) segments[i + 1].focus();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && el.value === "" && segments[i - 1]) {
          segments[i - 1].focus();
          const prev = segments[i - 1];
          setTimeout(() => prev.setSelectionRange(prev.value.length, prev.value.length), 0);
        }
      });
    });
  }
  function getDateGroupValue(container) {
    const dd = container.querySelector(".dg-dd").value, mm = container.querySelector(".dg-mm").value, yyyy = container.querySelector(".dg-yyyy").value;
    if (!dd && !mm && !yyyy) return "";
    return `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
  }
  function setDateGroupValue(container, ddmmyyyy) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy || "");
    container.querySelector(".dg-dd").value = m ? m[1] : "";
    container.querySelector(".dg-mm").value = m ? m[2] : "";
    container.querySelector(".dg-yyyy").value = m ? m[3] : "";
  }
  function parseDDMMYYYY(str) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((str || "").trim());
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (d.getFullYear() != yyyy || d.getMonth() != mm - 1 || d.getDate() != dd) return null;
    return d;
  }
  function todayDDMMYYYY() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  function toISOFromDDMMYYYY(str) {
    const d = parseDDMMYYYY(str);
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  document.querySelectorAll(".date-group").forEach(wireDateGroup);

  function checkNotFutureAndInFY(str, label) {
    const d = parseDDMMYYYY(str);
    if (!str) return `${label} is required.`;
    if (!d) return `${label} must be a valid date.`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d > today) return `${label} cannot be later than today.`;
    const fyYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const fyStart = new Date(fyYear, 3, 1), fyEnd = new Date(fyYear + 1, 2, 31);
    if (d < fyStart || d > fyEnd) return `${label} must be within the current financial year (Apr–Mar).`;
    return null;
  }

  // ============================================================
  // Validation
  // ============================================================
  function setHint(id, msg, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || "";
    el.className = "field-hint" + (msg ? (ok ? " ok" : " error") : "");
  }

  function validateInvoiceNumber() {
    const val = document.getElementById("invoice_number").value.trim();
    if (!val) return true;
    const dup = existingTickets.some((t) => t.invoice_number === val && String(t.id) !== String(editId));
    setHint("invoice_number_hint", dup ? "Already exists." : "", !dup);
    return !dup;
  }
  function validateBookingReference() {
    const val = document.getElementById("booking_reference").value.trim();
    if (!val) return true;
    const dup = existingTickets.some((t) => t.booking_reference === val && String(t.id) !== String(editId));
    setHint("booking_reference_hint", dup ? "Already exists." : "", !dup);
    return !dup;
  }
  function validateTicketNoUnique(row) {
    const input = row.querySelector(".line-ticket-no");
    const val = input.value.trim();
    if (!val) { input.style.borderColor = ""; input.title = ""; return true; }
    const dupInGrid = Array.from(linesBody.querySelectorAll(".line-ticket-no"))
      .filter((el) => el !== input).some((el) => el.value.trim() === val);
    const dupExisting = existingTickets.some((t) => t.ticket_no === val && String(t.id) !== String(editId));
    const dup = dupInGrid || dupExisting;
    input.style.borderColor = dup ? "var(--color-danger)" : "";
    input.title = dup ? "Duplicate ticket number." : "";
    return !dup;
  }
  function validateCustomerField() {
    const val = document.getElementById("customer").value.trim();
    const c = allCustomers.find((c) => c.name === val);
    setHint("customer_hint", val ? (c ? "" : "Not found — pick from the list.") : "", !!c);
    return !val || !!c;
  }
  function validateSupplierField() {
    const val = document.getElementById("supplier").value.trim();
    const s = allSuppliers.find((s) => s.name === val);
    setHint("supplier_hint", val ? (s ? "" : "Not found — pick from the list.") : "", !!s);
    return !val || !!s;
  }
  document.getElementById("customer").addEventListener("blur", validateCustomerField);
  document.getElementById("supplier").addEventListener("blur", validateSupplierField);
  document.getElementById("invoice_number").addEventListener("blur", validateInvoiceNumber);
  document.getElementById("booking_reference").addEventListener("blur", validateBookingReference);

  function validateDates() {
    const invErr = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("invoice_date")), "Invoice Date");
    setHint("invoice_date_hint", invErr || "", !invErr);
    const refErr = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("booking_ref_date")), "Booking Ref Date");
    setHint("booking_ref_date_hint", refErr || "", !refErr);
    if (invErr) { alert(invErr); return false; }
    if (refErr) { alert(refErr); return false; }
    return true;
  }
  document.querySelector("#invoice_date .dg-yyyy").addEventListener("blur", () => {
    const err = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("invoice_date")), "Invoice Date");
    setHint("invoice_date_hint", err || "", !err);
  });
  document.querySelector("#booking_ref_date .dg-yyyy").addEventListener("blur", () => {
    const err = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("booking_ref_date")), "Booking Ref Date");
    setHint("booking_ref_date_hint", err || "", !err);
  });

  function validateMaxLengths() {
    const checks = [
      ["booking_given_by", 25, "Booking Given By"],
      ["airline_pnr_header", 13, "Airline PNR"],
      ["gds_pnr_header", 13, "GDS PNR"],
    ];
    for (const [id, max, label] of checks) {
      const el = document.getElementById(id);
      if (el.value.length > max) { alert(`${label} must be ${max} characters or fewer.`); return false; }
    }
    for (const row of linesBody.querySelectorAll(".pax-row")) {
      if (row.querySelector(".line-airline-code").value.length > 3) { alert("Airline Code must be 3 characters or fewer."); return false; }
      if (row.querySelector(".line-pax-name").value.length > 30) { alert("Pax Name must be 30 characters or fewer."); return false; }
    }
    return true;
  }

  // ============================================================
  // Submit — POST once to the real Django API (header + all lines)
  // ============================================================
  document.getElementById("ticket-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateDates()) return;
    if (!validateMaxLengths()) return;
    if (!validateCustomerField() || !document.getElementById("customer").value.trim()) { alert("Pick a valid Customer from the list."); return; }
    if (!validateSupplierField() || !document.getElementById("supplier").value.trim()) { alert("Pick a valid Supplier from the list."); return; }
    if (!validateInvoiceNumber()) { alert("Fix the duplicate Invoice Number before saving."); return; }
    if (!validateBookingReference()) { alert("Fix the duplicate Booking Reference before saving."); return; }

    const rows = linesBody.querySelectorAll(".pax-row");
    if (rows.length === 0) { alert("Add at least one passenger."); return; }
    let allTicketNosOk = true;
    rows.forEach((row) => { if (!validateTicketNoUnique(row)) allTicketNosOk = false; });
    if (!allTicketNosOk) { alert("Fix duplicate Ticket Number(s) before saving."); return; }
    for (const row of rows) {
      if (!row.querySelector(".line-ticket-no").value.trim() || !row.querySelector(".line-pax-name").value.trim()) {
        alert("Every passenger needs a Ticket Number and Pax Name.");
        return;
      }
    }

    const lines = [];
    for (const row of rows) {
      const detailRow = row.nextElementSibling;
      lines.push({
        airline_code: row.querySelector(".line-airline-code").value,
        airline_name: row.querySelector(".line-airline-name").value || row.querySelector(".line-airline-code").value || "—",
        flight_no: row.querySelector(".line-flight-no").value,
        ticket_no: row.querySelector(".line-ticket-no").value.trim(),
        passenger_name: row.querySelector(".line-pax-name").value.trim(),
        pax_type: row.querySelector(".line-pax-type").value || "Adult",
        sector: row.querySelector(".line-sector").value,
        travel_date: toISOFromDDMMYYYY(getDateGroupValue(row.querySelector(".line-travel-date"))),
        basic_fare: num(row, ".line-basic-fare"),
        yq: num(detailRow, ".line-yq"), yr: num(detailRow, ".line-yr"),
        k3_tax: num(detailRow, ".line-k3"), tax_others: num(detailRow, ".line-tax-others"),
        seat: num(detailRow, ".line-seat"), meal: num(detailRow, ".line-meal"), baggage: num(detailRow, ".line-baggage"),
        other_ssr: num(detailRow, ".line-other-ssr"),
        disc_on: detailRow.querySelector(".line-disc-on").value || null,
        disc_type: detailRow.querySelector(".line-disc-type").value || null,
        disc_value: num(detailRow, ".line-disc-value"), tds_per: num(detailRow, ".line-tds-per"),
        markup: num(row, ".line-markup"), addl_markup: num(detailRow, ".line-addl-markup"),
        service_fee: num(row, ".line-service-fee"), addl_service_fee: num(detailRow, ".line-addl-service-fee"),
        gst_pct: num(row, ".line-gst-pct"), status: "ISSUED",
      });
    }

    const payload = {
      company_id: activeCompanyId,
      invoice_number: document.getElementById("invoice_number").value.trim(),
      invoice_date: toISOFromDDMMYYYY(getDateGroupValue(document.getElementById("invoice_date"))),
      invoice_type: document.getElementById("invoice_type").value,
      booking_mode: document.getElementById("booking_mode").textContent,
      booking_type: document.getElementById("booking_type").value,
      booking_status: document.getElementById("booking_status").value,
      customer_name: document.getElementById("customer").value,
      travel_type: document.getElementById("travel_type").value,
      user_name: document.getElementById("user_name").value,
      currency: document.getElementById("currency").textContent,
      roe: parseFloat(document.getElementById("roe").value) || 1,
      booking_given_by: document.getElementById("booking_given_by").value,
      booking_reference: document.getElementById("booking_reference").value.trim(),
      booking_ref_date: toISOFromDDMMYYYY(getDateGroupValue(document.getElementById("booking_ref_date"))),
      airline_pnr: document.getElementById("airline_pnr_header").value,
      gds_pnr: document.getElementById("gds_pnr_header").value,
      supplier_name: document.getElementById("supplier").value,
      office_id: document.getElementById("office_id").value,
      payment_mode: document.getElementById("payment_mode").value,
      airline_category: document.getElementById("airline_category").value,
      branch_name: (window.VoyagerMock.getReferenceData(activeCompanyId).branches[0] || {}).name,
      lines,
    };

    try {
      const res = await fetch("http://localhost:8000/api/tickets/create/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save this ticket.");
      window.VoyagerEntry.showToast(`${lines.length} ticket(s) saved to the database.`, returnTo);
    } catch (err) {
      alert(err.message || "Could not save this ticket. Is the Django backend running on localhost:8000?");
    }
  });

  if (!editId) {
    setDateGroupValue(document.getElementById("invoice_date"), todayDDMMYYYY());
    setDateGroupValue(document.getElementById("booking_ref_date"), todayDDMMYYYY());
  }

  const active = await VoyagerShell.init({
    activeKey: "tickets",
    onCompanyChange: (id, country) => { activeCompanyId = Number(id); activeCountry = country; populateRefs(activeCompanyId); },
  });
  if (active) {
    activeCompanyId = Number(active.id); activeCountry = active.country;
    await populateRefs(activeCompanyId);
    try {
      const res = await fetch(`http://localhost:8000/api/tickets/?company_id=${activeCompanyId}`);
      existingTickets = res.ok ? await res.json() : [];
    } catch (_) { existingTickets = []; }
    if (!editId) addLine();
  }
})();