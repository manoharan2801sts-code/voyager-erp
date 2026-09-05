(async function () {
  const { fillSelect, todayISO, saveRecord, getEditId, getReturnTo } = window.VoyagerEntry;
  const OPT = window.VoyagerHardcode.TICKET_FORM_OPTIONS;
  let activeCompanyId, activeCountry, allCustomers = [], existingTickets = [];
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
  // Part 1/2 reference data + customer verify button
  // ============================================================
  let allSuppliers = [];
  const API_BASE = (window.VoyagerAPI && window.VoyagerAPI.BASE_URL) || "/api";
  const CUSTOMERS_API = `${API_BASE}/customers/`;
  const SUPPLIERS_API = `${API_BASE}/suppliers/`;

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

  function validateCustomerField() {
    const val = document.getElementById("customer").value.trim();
    const c = allCustomers.find((c) => c.name === val);
    setHint("customer_hint", val ? (c ? "" : "Not found — pick a customer from the list.") : "", !!c);
    return !val || !!c;
  }
  function validateSupplierField() {
    const val = document.getElementById("supplier").value.trim();
    const s = allSuppliers.find((s) => s.name === val);
    setHint("supplier_hint", val ? (s ? "" : "Not found — pick a supplier from the list.") : "", !!s);
    return !val || !!s;
  }

  document.getElementById("customer").addEventListener("input", (e) => {
    const c = allCustomers.find((c) => c.name === e.target.value);
    document.getElementById("customer_code").textContent = c ? c.code : "—";
    document.getElementById("customer_address").textContent = c && c.address ? c.address : "—";
    document.getElementById("customer_gst").textContent = c && c.gst_no ? c.gst_no : "—";
  });
  document.getElementById("customer").addEventListener("blur", validateCustomerField);
  document.getElementById("supplier").addEventListener("input", (e) => {
    const s = allSuppliers.find((s) => s.name === e.target.value);
    document.getElementById("office_id").value = s && s.office_id ? s.office_id : "";
  });
  document.getElementById("supplier").addEventListener("blur", validateSupplierField);

  // ============================================================
  // Part 3 — repeatable ticket line grid
  // ============================================================
  const linesContainer = document.getElementById("ticket-lines");
  const lineTemplate = document.getElementById("ticket-line-template");

  function addLine(prefill) {
    lineCount += 1;
    const node = lineTemplate.content.cloneNode(true);
    const wrap = node.querySelector(".ticket-line");
    wrap.dataset.lineId = lineCount;
    fillPlain2(wrap, ".line-pax-type", OPT.paxTypes, "Select…");
    fillPlain2(wrap, ".line-disc-on", OPT.custDiscountOn, "Select…");
    fillPlain2(wrap, ".line-disc-type", OPT.custDiscountTypes, "Select…");
    wrap.querySelector(".line-disc-type").addEventListener("change", () => updateDiscountLabel(wrap));
    updateDiscountLabel(wrap);

    wrap.querySelectorAll(".line-calc, .line-disc-on, .line-disc-type").forEach((el) => {
      el.addEventListener("input", () => recalcLine(wrap));
      el.addEventListener("change", () => recalcLine(wrap));
    });
    wrap.querySelector(".remove-line-btn").addEventListener("click", () => {
      wrap.remove();
      recalcInvoiceTotal();
    });
    wrap.querySelector(".line-ticket-no").addEventListener("blur", () => validateTicketNoUnique(wrap));
    wireDateGroup(wrap.querySelector(".line-travel-date"));

    if (prefill) {
      Object.entries(prefill).forEach(([cls, val]) => {
        const el = wrap.querySelector("." + cls);
        if (el) el.value = val;
      });
    }
    linesContainer.appendChild(node);
    const addedWrap = linesContainer.lastElementChild;
    recalcLine(addedWrap);
  }

  function updateDiscountLabel(wrap) {
    const type = wrap.querySelector(".line-disc-type").value;
    const label = wrap.querySelector(".disc-value-label");
    const input = wrap.querySelector(".line-disc-value");
    if (type === "Percentage") {
      label.textContent = "Discount %";
      input.max = "100";
    } else if (type === "Flat") {
      label.textContent = "Discount Amount (Flat)";
      input.removeAttribute("max");
    } else {
      label.textContent = "Discount";
      input.removeAttribute("max");
    }
    recalcLine(wrap);
  }

  function fillPlain2(root, selector, values, placeholder) {
    const el = root.querySelector(selector);
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : "") +
      values.map((v) => `<option value="${v}">${v}</option>`).join("");
  }

  function num(root, selector) {
    const el = root.querySelector(selector);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  // Cust Discount + TDS + GST + Total, per the spec's exact formulas
  function recalcLine(wrap) {
    const basic = num(wrap, ".line-basic-fare"), yq = num(wrap, ".line-yq"), yr = num(wrap, ".line-yr");
    const k3 = num(wrap, ".line-k3"), taxOthers = num(wrap, ".line-tax-others");
    const seat = num(wrap, ".line-seat"), meal = num(wrap, ".line-meal");
    const baggage = num(wrap, ".line-baggage"), otherSsr = num(wrap, ".line-other-ssr");
    const discOn = wrap.querySelector(".line-disc-on").value;
    const discType = wrap.querySelector(".line-disc-type").value;
    const discValue = num(wrap, ".line-disc-value");
    const tdsPer = num(wrap, ".line-tds-per");
    const markup = num(wrap, ".line-markup"), addlMarkup = num(wrap, ".line-addl-markup");
    const serviceFee = num(wrap, ".line-service-fee"), addlServiceFee = num(wrap, ".line-addl-service-fee");
    const gstPct = num(wrap, ".line-gst-pct");

    // "Cust Discount On" base amount
    const baseMap = { "Basic": basic, "Basic + YQ": basic + yq, "Basic + YR": basic + yr,
      "Basic + YQ + YR": basic + yq + yr, "Gross": basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr };
    const discBase = baseMap[discOn] || 0;
    const custDiscount = discType === "Percentage" ? discBase * (discValue / 100) : (discType === "Flat" ? discValue : 0);
    const tdsAmount = custDiscount * (tdsPer / 100);
    const gstAmount = (serviceFee + addlServiceFee) * (gstPct / 100);

    const total = basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr
      - custDiscount + tdsAmount + markup + addlMarkup + serviceFee + addlServiceFee + gstAmount;

    wrap.querySelector(".line-disc-computed").textContent = custDiscount.toFixed(2);
    wrap.querySelector(".line-tds-computed").textContent = tdsAmount.toFixed(2);
    wrap.querySelector(".line-gst-computed").textContent = gstAmount.toFixed(2);
    wrap.querySelector(".line-total-computed").textContent = total.toFixed(2);
    wrap.dataset.total = total;
    recalcInvoiceTotal();
  }

  function recalcInvoiceTotal() {
    let sum = 0;
    document.querySelectorAll(".ticket-line").forEach((w) => { sum += parseFloat(w.dataset.total) || 0; });
    const ccy = document.getElementById("currency").textContent || (activeCountry === "AE" ? "AED" : "INR");
    document.getElementById("invoice_total").textContent =
      `${ccy} ${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  document.getElementById("add-line-btn").addEventListener("click", () => addLine());

  // ============================================================
  // 2-step wizard: Step 1 (booking details) -> Step 2 (ticket lines)
  // ============================================================
  function goToStep(n) {
    document.getElementById("wizard-step-1").style.display = n === 1 ? "" : "none";
    document.getElementById("wizard-step-2").style.display = n === 2 ? "" : "none";
    document.querySelectorAll(".wc-step").forEach((el) => {
      const step = Number(el.dataset.step);
      el.classList.toggle("active", step === n);
      el.classList.toggle("done", step < n);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function validateStep1() {
    const required = [
      ["invoice_number", "Invoice Number"], ["customer", "Customer Name"],
      ["booking_reference", "Booking Reference"], ["supplier", "Supplier"],
    ];
    for (const [id, label] of required) {
      if (!document.getElementById(id).value.trim()) { alert(`${label} is required before continuing.`); return false; }
    }
    if (!validateDates()) return false;
    if (!validateCustomerField() || !document.getElementById("customer").value.trim()) { alert("Pick a valid Customer from the list."); return false; }
    if (!validateSupplierField() || !document.getElementById("supplier").value.trim()) { alert("Pick a valid Supplier from the list."); return false; }
    if (!validateInvoiceNumber()) { alert("Fix the duplicate Invoice Number before continuing."); return false; }
    if (!validateBookingReference()) { alert("Fix the duplicate Booking Reference before continuing."); return false; }
    return true;
  }
  document.getElementById("next-step-btn").addEventListener("click", () => { if (validateStep1()) goToStep(2); });
  document.getElementById("back-step-btn").addEventListener("click", () => goToStep(1));
  document.querySelectorAll(".wc-step").forEach((el) => {
    el.addEventListener("click", () => {
      const step = Number(el.dataset.step);
      if (step === 1) goToStep(1);
      else if (validateStep1()) goToStep(2);
    });
    el.style.cursor = "pointer";
  });

  // ============================================================
  // dd-mm-yyyy date handling — three INDEPENDENT boxes (day/month/year),
  // not one masked string. Editing/backspacing in one box can never shift
  // or corrupt the digits in another — that was the bug with a single
  // concatenated-digit mask (deleting a month digit shifted the year).
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
          // Let the user keep backspacing straight into the previous box's last digit.
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
    if (d.getFullYear() != yyyy || d.getMonth() != mm - 1 || d.getDate() != dd) return null; // rejects 31/02/2026 etc.
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

  // Hard block (not a confirm dialog) — returns an error string, or null if fine.
  function checkNotFutureAndInFY(str, label) {
    const d = parseDDMMYYYY(str);
    if (!str) return `${label} is required.`;
    if (!d) return `${label} must be a valid date in dd/mm/yyyy format.`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d > today) return `${label} cannot be later than today.`;
    const fyYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const fyStart = new Date(fyYear, 3, 1), fyEnd = new Date(fyYear + 1, 2, 31);
    if (d < fyStart || d > fyEnd) return `${label} must be within the current financial year (Apr–Mar).`;
    return null;
  }
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
    setHint("invoice_number_hint", dup ? "This invoice number already exists." : "Looks unique.", !dup);
    return !dup;
  }
  function validateBookingReference() {
    const val = document.getElementById("booking_reference").value.trim();
    if (!val) return true;
    const dup = existingTickets.some((t) => t.booking_reference === val && String(t.id) !== String(editId));
    setHint("booking_reference_hint", dup ? "This booking reference already exists." : "Looks unique.", !dup);
    return !dup;
  }
  function validateTicketNoUnique(wrap) {
    const input = wrap.querySelector(".line-ticket-no");
    const hint = wrap.querySelector(".line-ticket-no-hint");
    const val = input.value.trim();
    if (!val) { hint.textContent = ""; return true; }
    const dupInGrid = Array.from(document.querySelectorAll(".line-ticket-no"))
      .filter((el) => el !== input).some((el) => el.value.trim() === val);
    const dupExisting = existingTickets.some((t) => t.ticket_no === val && String(t.id) !== String(editId));
    const dup = dupInGrid || dupExisting;
    hint.className = "field-hint" + (dup ? " error" : (val ? " ok" : ""));
    hint.textContent = dup ? "Duplicate ticket number." : (val ? "Looks unique." : "");
    return !dup;
  }

  function validateDates() {
    const invErr = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("invoice_date")), "Invoice Date");
    setHint("invoice_date_hint", invErr || "Looks valid.", !invErr);
    const refErr = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("booking_ref_date")), "Booking Ref Date");
    setHint("booking_ref_date_hint", refErr || "Looks valid.", !refErr);
    if (invErr) { alert(invErr); return false; }
    if (refErr) { alert(refErr); return false; }
    return true;
  }
  document.querySelector("#invoice_date .dg-yyyy").addEventListener("blur", () => {
    const err = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("invoice_date")), "Invoice Date");
    setHint("invoice_date_hint", err || "Looks valid.", !err);
  });
  document.querySelector("#booking_ref_date .dg-yyyy").addEventListener("blur", () => {
    const err = checkNotFutureAndInFY(getDateGroupValue(document.getElementById("booking_ref_date")), "Booking Ref Date");
    setHint("booking_ref_date_hint", err || "Looks valid.", !err);
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
    const lines = document.querySelectorAll(".ticket-line");
    for (const wrap of lines) {
      if (wrap.querySelector(".line-airline-code").value.length > 3) { alert("Airline Code must be 3 characters or fewer."); return false; }
      if (wrap.querySelector(".line-pax-name").value.length > 30) { alert("Pax Name must be 30 characters or fewer."); return false; }
    }
    return true;
  }

  document.getElementById("invoice_number").addEventListener("blur", validateInvoiceNumber);
  document.getElementById("booking_reference").addEventListener("blur", validateBookingReference);

  // ============================================================
  // Submit — one ticket record per line, sharing the invoice header.
  // (Data model stores one ticket per record; this maps the spec's
  // "grid of multiple ticket details" onto that without changing
  // mock-data.js's schema or CRUD logic.)
  // ============================================================
  document.getElementById("ticket-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateDates()) return;
    if (!validateMaxLengths()) return;
    if (!validateCustomerField() || !document.getElementById("customer").value.trim()) {
      alert("Pick a valid Customer from the list."); return;
    }
    if (!validateSupplierField() || !document.getElementById("supplier").value.trim()) {
      alert("Pick a valid Supplier from the list."); return;
    }
    if (!validateInvoiceNumber()) { alert("Fix the duplicate Invoice Number before saving."); return; }
    if (!validateBookingReference()) { alert("Fix the duplicate Booking Reference before saving."); return; }

    const lineEls = document.querySelectorAll(".ticket-line");
    if (lineEls.length === 0) { alert("Add at least one ticket line."); return; }
    let allTicketNosOk = true;
    lineEls.forEach((wrap) => { if (!validateTicketNoUnique(wrap)) allTicketNosOk = false; });
    if (!allTicketNosOk) { alert("Fix duplicate Ticket Number(s) in the grid before saving."); return; }
    for (const wrap of lineEls) {
      if (!wrap.querySelector(".line-ticket-no").value.trim() || !wrap.querySelector(".line-pax-name").value.trim()) {
        alert("Every ticket line needs a Ticket Number and Pax Name.");
        return;
      }
    }

    const lines = [];
    for (const wrap of lineEls) {
      lines.push({
        airline_code: wrap.querySelector(".line-airline-code").value,
        airline_name: wrap.querySelector(".line-airline-name").value || wrap.querySelector(".line-airline-code").value || "—",
        flight_no: wrap.querySelector(".line-flight-no").value,
        ticket_no: wrap.querySelector(".line-ticket-no").value.trim(),
        passenger_name: wrap.querySelector(".line-pax-name").value.trim(),
        pax_type: wrap.querySelector(".line-pax-type").value || "Adult",
        sector: wrap.querySelector(".line-sector").value,
        travel_date: toISOFromDDMMYYYY(getDateGroupValue(wrap.querySelector(".line-travel-date"))),
        basic_fare: num(wrap, ".line-basic-fare"), yq: num(wrap, ".line-yq"), yr: num(wrap, ".line-yr"),
        k3_tax: num(wrap, ".line-k3"), tax_others: num(wrap, ".line-tax-others"),
        seat: num(wrap, ".line-seat"), meal: num(wrap, ".line-meal"), baggage: num(wrap, ".line-baggage"),
        other_ssr: num(wrap, ".line-other-ssr"),
        disc_on: wrap.querySelector(".line-disc-on").value || null,
        disc_type: wrap.querySelector(".line-disc-type").value || null,
        disc_value: num(wrap, ".line-disc-value"), tds_per: num(wrap, ".line-tds-per"),
        markup: num(wrap, ".line-markup"), addl_markup: num(wrap, ".line-addl-markup"),
        service_fee: num(wrap, ".line-service-fee"), addl_service_fee: num(wrap, ".line-addl-service-fee"),
        gst_pct: num(wrap, ".line-gst-pct"), status: "ISSUED",
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
      const res = await fetch(`${API_BASE}/tickets/create/`, {
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
    populateRefs(activeCompanyId);
    existingTickets = await window.VoyagerAPI.get("/travel/tickets");
    if (!editId) addLine();
  }
})();