(async function () {
  const { fillSelect, getEditId, getReturnTo } = window.VoyagerEntry;
  const OPT = window.VoyagerHardcode.TICKET_FORM_OPTIONS;
  let activeCompanyId, activeCountry, allCustomers = [], allSuppliers = [], existingTickets = [];
  let lineCount = 0;
  const editId = getEditId();
  const urlParams = new URLSearchParams(window.location.search);
  const isViewMode = urlParams.get("mode") === "view" || Boolean(editId);
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
  const API_BASE = (window.VoyagerAPI && window.VoyagerAPI.API_BASE) || "/api";
  const CUSTOMERS_API = `${API_BASE}/customers/`;
  const SUPPLIERS_API = `${API_BASE}/suppliers/`;

  async function populateRefs(companyId) {
    const ref = window.VoyagerMock.getReferenceData(companyId);
    document.getElementById("currency").textContent = ref.currency;

    // Fast sessionStorage check for instant response
    try {
      const cachedCust = sessionStorage.getItem(`voyager_cust_${companyId}`);
      const cachedSupp = sessionStorage.getItem(`voyager_supp_${companyId}`);
      if (cachedCust && cachedSupp) {
        allCustomers = JSON.parse(cachedCust);
        allSuppliers = JSON.parse(cachedSupp);
        document.getElementById("customer-options").innerHTML = allCustomers.map((c) => `<option value="${c.name}">`).join("");
        document.getElementById("supplier-options").innerHTML = allSuppliers.map((s) => `<option value="${s.name}">`).join("");
      }
    } catch (_) {}

    try {
      const [custRes, suppRes, tickRes] = await Promise.all([
        fetch(`${CUSTOMERS_API}?company_id=${companyId}`),
        fetch(`${SUPPLIERS_API}?company_id=${companyId}`),
        fetch(`${API_BASE}/tickets/?company_id=${companyId}`),
      ]);
      allCustomers = custRes.ok ? await custRes.json() : (allCustomers || []);
      allSuppliers = suppRes.ok ? await suppRes.json() : (allSuppliers || []);
      existingTickets = tickRes.ok ? await tickRes.json() : [];
      try {
        sessionStorage.setItem(`voyager_cust_${companyId}`, JSON.stringify(allCustomers));
        sessionStorage.setItem(`voyager_supp_${companyId}`, JSON.stringify(allSuppliers));
      } catch (_) {}
    } catch (err) {
      console.warn("Could not load references from the API:", err);
      if (!allCustomers.length) allCustomers = [];
      if (!allSuppliers.length) allSuppliers = [];
      existingTickets = [];
    }
    document.getElementById("customer-options").innerHTML = allCustomers.map((c) => `<option value="${c.name}">`).join("");
    document.getElementById("supplier-options").innerHTML = allSuppliers.map((s) => `<option value="${s.name}">`).join("");
    recalcInvoiceTotal();
  }

  document.getElementById("customer").addEventListener("input", (e) => {
    const c = allCustomers.find((c) => c.name === e.target.value);
    document.getElementById("customer_code").textContent = c ? c.code : "—";
    const addrEl = document.getElementById("customer_address");
    const addrText = c && c.address ? c.address.trim() : "";
    addrEl.textContent = addrText || "—";
    addrEl.title = addrText || "Customer Address";
    document.getElementById("customer_gst").textContent = c && c.gst_no ? c.gst_no : "—";
  });
  document.getElementById("supplier").addEventListener("input", (e) => {
    const s = allSuppliers.find((s) => s.name === e.target.value);
    document.getElementById("office_id").value = s && s.office_id ? s.office_id : "";
  });

  // ============================================================
  // Data-Driven Passenger Register (PNR, Ticket No, Airline, Passenger, Sector, Date, Basic, Markup, Total, Actions)
  // ============================================================
  const linesBody = document.getElementById("ticket-lines");
  const fareModal = document.getElementById("fare-breakdown-modal");
  const modalCloseX = document.getElementById("modal-close-x-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalSaveBtn = document.getElementById("modal-save-btn");
  const proceedBtn = document.getElementById("proceed-btn");
  const addLineBtn = document.getElementById("add-line-btn");
  const addLineBtnBot = document.getElementById("add-line-btn-bot");
  const refreshBtn = document.getElementById("refresh-total-btn");

  let paxList = [];
  let editingPaxId = null;
  let activePaxId = null;

  fillPlain("modal-pax-type", OPT.paxTypes, "Select…");
  fillPlain("modal-disc-on", OPT.custDiscountOn, "Select…");
  fillPlain("modal-disc-type", OPT.custDiscountTypes, "Select…");

  function updateAddButtonVisibility() {
    if (isViewMode) {
      if (addLineBtn) addLineBtn.style.display = "none";
      if (addLineBtnBot) addLineBtnBot.style.display = "none";
      return;
    }
    const hasPax = paxList.length >= 1;
    if (addLineBtn) addLineBtn.style.display = hasPax ? "inline-flex" : "none";
    if (addLineBtnBot) addLineBtnBot.style.display = hasPax ? "inline-flex" : "none";
  }

  function renderPaxTable() {
    if (paxList.length === 0) {
      linesBody.innerHTML = `
        <tr id="no-pax-row">
          <td colspan="11" style="text-align:center; padding:18px; color:#64748B; font-size:11.5px;">
            No passengers added yet. Fill booking details above and click <strong style="color:#0F766E;">Proceed &#10132;</strong> to enter passenger &amp; fare details.
          </td>
        </tr>`;
      document.getElementById("pax-count").textContent = "0 Passengers";
      updateAddButtonVisibility();
      recalcInvoiceTotal();
      return;
    }

    const pnrHeader = document.getElementById("airline_pnr_header")?.value?.trim() ||
                      document.getElementById("gds_pnr_header")?.value?.trim() ||
                      document.getElementById("booking_reference")?.value?.trim() || "—";

    linesBody.innerHTML = paxList.map((pax, idx) => {
      const isActive = pax.id === activePaxId;
      const airlineDisplay = (pax.airline_code || "") + (pax.airline_name ? ` — ${pax.airline_name}` : "");
      const actionHtml = isViewMode
        ? `<div class="dom-action-btn-group"><button type="button" class="dom-action-btn btn-view-fare" data-id="${pax.id}" style="color:#0F766E; border-color:#0F766E; font-weight:600;">View Breakdown</button></div>`
        : `<div class="dom-action-btn-group">
            <button type="button" class="dom-action-btn btn-edit" data-id="${pax.id}">Edit</button>
            <button type="button" class="dom-action-btn btn-delete" data-id="${pax.id}">Delete</button>
           </div>`;

      return `
        <tr class="pax-row ${isActive ? 'active-row' : ''}" data-pax-id="${pax.id}">
          <td style="text-align:center; font-weight:700;">${idx + 1}</td>
          <td>${pax.pnr || pnrHeader}</td>
          <td style="font-weight:700; font-family:var(--font-mono);">${pax.ticket_no}</td>
          <td>${airlineDisplay || "—"}</td>
          <td><strong>${pax.passenger_name}</strong> <span style="font-size:10px; color:#64748B;">(${pax.pax_type || 'Adult'})</span></td>
          <td>${pax.sector || "—"}</td>
          <td>${pax.travel_date_display || pax.travel_date || "—"}</td>
          <td class="num">${Number(pax.basic_fare || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="num">${Number(pax.markup || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="num" style="font-weight:800; color:#0F766E;">${Number(pax.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:center;">${actionHtml}</td>
        </tr>
      `;
    }).join("");

    document.getElementById("pax-count").textContent = `${paxList.length} Passenger${paxList.length === 1 ? "" : "s"}`;
    updateAddButtonVisibility();
    recalcInvoiceTotal();

    linesBody.querySelectorAll(".pax-row").forEach((row) => {
      const pid = row.dataset.paxId;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".dom-action-btn")) return;
        linesBody.querySelectorAll(".pax-row").forEach(r => r.classList.remove("active-row"));
        row.classList.add("active-row");
        activePaxId = pid;
      });
    });

    linesBody.querySelectorAll(".btn-view-fare").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openFareModal(btn.dataset.id);
      });
    });

    linesBody.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openFareModal(btn.dataset.id);
      });
    });

    linesBody.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deletePax(btn.dataset.id);
      });
    });
  }

  function deletePax(id) {
    paxList = paxList.filter(p => String(p.id) !== String(id));
    if (activePaxId === id) activePaxId = paxList[0] ? paxList[0].id : null;
    renderPaxTable();
  }

  function recalcInvoiceTotal() {
    let sumTotal = 0, sumBasic = 0, sumTaxes = 0, sumDisc = 0, sumMarkup = 0, sumService = 0, sumGst = 0;
    paxList.forEach((p) => {
      sumBasic += Number(p.basic_fare || 0);
      sumTaxes += Number(p.yq || 0) + Number(p.yr || 0) + Number(p.k3_tax || 0) + Number(p.tax_others || 0) +
                  Number(p.seat || 0) + Number(p.meal || 0) + Number(p.baggage || 0) + Number(p.other_ssr || 0);
      sumDisc += Number(p.cust_discount || 0);
      sumMarkup += Number(p.markup || 0) + Number(p.addl_markup || 0);
      sumService += Number(p.service_fee || 0) + Number(p.addl_service_fee || 0);
      sumGst += Number(p.gst_amount || 0);
      sumTotal += Number(p.total || 0);
    });

    const ccy = document.getElementById("currency")?.textContent || (activeCountry === "AE" ? "AED" : "INR");
    const balCcyEl = document.getElementById("bal-currency");
    if (balCcyEl) balCcyEl.textContent = ccy;

    const totalEl = document.getElementById("invoice_total");
    if (totalEl) totalEl.textContent = sumTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    setVal("breakdown-basic", sumBasic);
    setVal("breakdown-taxes", sumTaxes);
    setVal("breakdown-disc", sumDisc);
    setVal("breakdown-markup", sumMarkup);
    setVal("breakdown-service", sumService);
    setVal("breakdown-gst", sumGst);
    setVal("breakdown-net", sumTotal);
  }

  // ============================================================
  // Fare Breakdown Popup Modal (Proceed / + Add Passenger / Edit)
  // ============================================================
  function updateModalDiscountLabel() {
    const type = document.getElementById("modal-disc-type").value;
    const label = document.getElementById("modal-disc-val-label");
    const input = document.getElementById("modal-disc-value");
    if (type === "Percentage") { label.textContent = "Discount %"; input.max = "100"; }
    else if (type === "Flat") { label.textContent = "Discount Amount (Flat)"; input.removeAttribute("max"); }
    else { label.textContent = "Discount Value"; input.removeAttribute("max"); }
    recalcModal();
  }
  document.getElementById("modal-disc-type").addEventListener("change", updateModalDiscountLabel);

  function recalcModal() {
    const basic = parseFloat(document.getElementById("modal-basic-fare").value) || 0;
    const yq = parseFloat(document.getElementById("modal-yq").value) || 0;
    const yr = parseFloat(document.getElementById("modal-yr").value) || 0;
    const k3 = parseFloat(document.getElementById("modal-k3").value) || 0;
    const taxOthers = parseFloat(document.getElementById("modal-tax-others").value) || 0;
    const seat = parseFloat(document.getElementById("modal-seat").value) || 0;
    const meal = parseFloat(document.getElementById("modal-meal").value) || 0;
    const baggage = parseFloat(document.getElementById("modal-baggage").value) || 0;
    const otherSsr = parseFloat(document.getElementById("modal-other-ssr").value) || 0;

    const discOn = document.getElementById("modal-disc-on").value;
    const discType = document.getElementById("modal-disc-type").value;
    const discValue = parseFloat(document.getElementById("modal-disc-value").value) || 0;
    const tdsPer = parseFloat(document.getElementById("modal-tds-per").value) || 0;

    const markup = parseFloat(document.getElementById("modal-markup").value) || 0;
    const addlMarkup = parseFloat(document.getElementById("modal-addl-markup").value) || 0;
    const serviceFee = parseFloat(document.getElementById("modal-service-fee").value) || 0;
    const addlServiceFee = parseFloat(document.getElementById("modal-addl-service-fee").value) || 0;
    const gstPct = parseFloat(document.getElementById("modal-gst-pct").value) || 0;

    const baseMap = {
      "Basic": basic,
      "Basic + YQ": basic + yq,
      "Basic + YR": basic + yr,
      "Basic + YQ + YR": basic + yq + yr,
      "Gross": basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr
    };
    const discBase = baseMap[discOn] || 0;
    const custDiscount = discType === "Percentage" ? discBase * (discValue / 100) : (discType === "Flat" ? discValue : 0);
    const tdsAmount = custDiscount * (tdsPer / 100);
    const gstAmount = (serviceFee + addlServiceFee) * (gstPct / 100);

    const total = basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr
      - custDiscount + tdsAmount + markup + addlMarkup + serviceFee + addlServiceFee + gstAmount;

    document.getElementById("modal-disc-computed").textContent = custDiscount.toFixed(2);
    document.getElementById("modal-tds-computed").textContent = tdsAmount.toFixed(2);
    document.getElementById("modal-gst-computed").textContent = gstAmount.toFixed(2);
    document.getElementById("modal-total-computed").textContent = total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  document.querySelectorAll(".modal-calc").forEach((el) => {
    el.addEventListener("input", recalcModal);
    el.addEventListener("change", recalcModal);
  });

  function openFareModal(paxId) {
    const ccy = document.getElementById("currency")?.textContent || (activeCountry === "AE" ? "AED" : "INR");
    document.querySelectorAll(".modal-currency-label").forEach(el => { el.textContent = ccy; });

    if (paxId) {
      // Edit / View Mode
      const existing = paxList.find(p => String(p.id) === String(paxId));
      if (!existing) return;
      editingPaxId = existing.id;
      document.getElementById("modal-pax-display").textContent = isViewMode
        ? `Fare Breakdown — ${existing.passenger_name} (View Only)`
        : `Edit Passenger — ${existing.passenger_name}`;

      document.getElementById("modal-airline-code").value = existing.airline_code || "";
      document.getElementById("modal-airline-name").value = existing.airline_name || "";
      document.getElementById("modal-flight-no").value = existing.flight_no || "";
      document.getElementById("modal-ticket-no").value = existing.ticket_no || "";
      document.getElementById("modal-pax-name").value = existing.passenger_name || "";
      document.getElementById("modal-pax-type").value = existing.pax_type || "Adult";
      document.getElementById("modal-sector").value = existing.sector || "";
      setDateGroupValue(document.getElementById("modal-travel-date"), existing.travel_date_display || "");
      document.getElementById("modal-status").value = existing.status || "ISSUED";

      document.getElementById("modal-basic-fare").value = existing.basic_fare || 0;
      document.getElementById("modal-yq").value = existing.yq || 0;
      document.getElementById("modal-yr").value = existing.yr || 0;
      document.getElementById("modal-k3").value = existing.k3_tax || 0;
      document.getElementById("modal-tax-others").value = existing.tax_others || 0;
      document.getElementById("modal-seat").value = existing.seat || 0;
      document.getElementById("modal-meal").value = existing.meal || 0;
      document.getElementById("modal-baggage").value = existing.baggage || 0;
      document.getElementById("modal-other-ssr").value = existing.other_ssr || 0;

      document.getElementById("modal-disc-on").value = existing.disc_on || "";
      document.getElementById("modal-disc-type").value = existing.disc_type || "";
      document.getElementById("modal-disc-value").value = existing.disc_value || 0;
      document.getElementById("modal-tds-per").value = existing.tds_per || 0;

      document.getElementById("modal-markup").value = existing.markup || 0;
      document.getElementById("modal-addl-markup").value = existing.addl_markup || 0;
      document.getElementById("modal-service-fee").value = existing.service_fee || 0;
      document.getElementById("modal-addl-service-fee").value = existing.addl_service_fee || 0;
      document.getElementById("modal-gst-pct").value = existing.gst_pct || 0;
    } else {
      // New Passenger Mode
      editingPaxId = null;
      document.getElementById("modal-pax-display").textContent = `New Passenger #${paxList.length + 1}`;

      document.getElementById("modal-airline-code").value = "";
      document.getElementById("modal-airline-name").value = "";
      document.getElementById("modal-flight-no").value = "";
      document.getElementById("modal-ticket-no").value = "";
      document.getElementById("modal-pax-name").value = "";
      document.getElementById("modal-pax-type").value = "Adult";
      document.getElementById("modal-sector").value = "";
      setDateGroupValue(document.getElementById("modal-travel-date"), todayDDMMYYYY());
      document.getElementById("modal-status").value = "ISSUED";

      document.getElementById("modal-basic-fare").value = 0;
      document.getElementById("modal-yq").value = 0;
      document.getElementById("modal-yr").value = 0;
      document.getElementById("modal-k3").value = 0;
      document.getElementById("modal-tax-others").value = 0;
      document.getElementById("modal-seat").value = 0;
      document.getElementById("modal-meal").value = 0;
      document.getElementById("modal-baggage").value = 0;
      document.getElementById("modal-other-ssr").value = 0;

      document.getElementById("modal-disc-on").value = "";
      document.getElementById("modal-disc-type").value = "";
      document.getElementById("modal-disc-value").value = 0;
      document.getElementById("modal-tds-per").value = 0;

      document.getElementById("modal-markup").value = 0;
      document.getElementById("modal-addl-markup").value = 0;
      document.getElementById("modal-service-fee").value = 0;
      document.getElementById("modal-addl-service-fee").value = 0;
      document.getElementById("modal-gst-pct").value = 0;
    }

    updateModalDiscountLabel();
    recalcModal();

    if (isViewMode) {
      if (modalSaveBtn) modalSaveBtn.style.display = "none";
      fareModal.querySelectorAll("input, select").forEach((el) => {
        el.setAttribute("disabled", "true");
        el.style.backgroundColor = "#F1F5F9";
        el.style.cursor = "default";
      });
    } else {
      if (modalSaveBtn) modalSaveBtn.style.display = "inline-flex";
      fareModal.querySelectorAll("input, select").forEach((el) => {
        el.removeAttribute("disabled");
        el.style.backgroundColor = "";
        el.style.cursor = "";
      });
    }

    fareModal.classList.add("open");
  }

  function closeFareModal() {
    fareModal.classList.remove("open");
    editingPaxId = null;
  }

  function saveFareModal() {
    const ticketNo = document.getElementById("modal-ticket-no").value.trim();
    const paxName = document.getElementById("modal-pax-name").value.trim();

    if (!ticketNo || !paxName) {
      alert("Ticket Number and Passenger Name are required.");
      return;
    }

    // Uniqueness validation
    const dupInList = paxList.some(p => p.ticket_no === ticketNo && String(p.id) !== String(editingPaxId));
    const dupInExisting = existingTickets.some(t => t.ticket_no === ticketNo && String(t.id) !== String(editId));
    if (dupInList || dupInExisting) {
      alert(`Ticket Number "${ticketNo}" already exists. Each passenger must have a unique ticket number.`);
      return;
    }

    const basic = parseFloat(document.getElementById("modal-basic-fare").value) || 0;
    const yq = parseFloat(document.getElementById("modal-yq").value) || 0;
    const yr = parseFloat(document.getElementById("modal-yr").value) || 0;
    const k3 = parseFloat(document.getElementById("modal-k3").value) || 0;
    const taxOthers = parseFloat(document.getElementById("modal-tax-others").value) || 0;
    const seat = parseFloat(document.getElementById("modal-seat").value) || 0;
    const meal = parseFloat(document.getElementById("modal-meal").value) || 0;
    const baggage = parseFloat(document.getElementById("modal-baggage").value) || 0;
    const otherSsr = parseFloat(document.getElementById("modal-other-ssr").value) || 0;

    const discOn = document.getElementById("modal-disc-on").value;
    const discType = document.getElementById("modal-disc-type").value;
    const discValue = parseFloat(document.getElementById("modal-disc-value").value) || 0;
    const tdsPer = parseFloat(document.getElementById("modal-tds-per").value) || 0;

    const markup = parseFloat(document.getElementById("modal-markup").value) || 0;
    const addlMarkup = parseFloat(document.getElementById("modal-addl-markup").value) || 0;
    const serviceFee = parseFloat(document.getElementById("modal-service-fee").value) || 0;
    const addlServiceFee = parseFloat(document.getElementById("modal-addl-service-fee").value) || 0;
    const gstPct = parseFloat(document.getElementById("modal-gst-pct").value) || 0;

    const baseMap = {
      "Basic": basic, "Basic + YQ": basic + yq, "Basic + YR": basic + yr,
      "Basic + YQ + YR": basic + yq + yr, "Gross": basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr
    };
    const discBase = baseMap[discOn] || 0;
    const custDiscount = discType === "Percentage" ? discBase * (discValue / 100) : (discType === "Flat" ? discValue : 0);
    const tdsAmount = custDiscount * (tdsPer / 100);
    const gstAmount = (serviceFee + addlServiceFee) * (gstPct / 100);

    const total = basic + yq + yr + k3 + taxOthers + seat + meal + baggage + otherSsr
      - custDiscount + tdsAmount + markup + addlMarkup + serviceFee + addlServiceFee + gstAmount;

    const travelDateRaw = getDateGroupValue(document.getElementById("modal-travel-date"));
    const travelDateIso = toISOFromDDMMYYYY(travelDateRaw);

    const paxRecord = {
      id: editingPaxId || (String(Date.now()) + Math.random().toString().slice(2, 6)),
      pnr: document.getElementById("airline_pnr_header")?.value?.trim() ||
           document.getElementById("gds_pnr_header")?.value?.trim() ||
           document.getElementById("booking_reference")?.value?.trim() || "—",
      airline_code: document.getElementById("modal-airline-code").value.trim().toUpperCase(),
      airline_name: document.getElementById("modal-airline-name").value.trim(),
      flight_no: document.getElementById("modal-flight-no").value.trim(),
      ticket_no: ticketNo,
      passenger_name: paxName,
      pax_type: document.getElementById("modal-pax-type").value,
      sector: document.getElementById("modal-sector").value.trim().toUpperCase(),
      travel_date_display: travelDateRaw,
      travel_date_iso: travelDateIso,
      status: document.getElementById("modal-status").value,
      basic_fare: basic, yq, yr, k3_tax: k3, tax_others: taxOthers,
      seat, meal, baggage, other_ssr: otherSsr,
      disc_on: discOn, disc_type: discType, disc_value: discValue,
      cust_discount: custDiscount, tds_per: tdsPer, tds_amount: tdsAmount,
      markup, addl_markup: addlMarkup,
      service_fee: serviceFee, addl_service_fee: addlServiceFee,
      gst_pct: gstPct, gst_amount: gstAmount,
      total,
    };

    if (editingPaxId) {
      const idx = paxList.findIndex(p => String(p.id) === String(editingPaxId));
      if (idx !== -1) paxList[idx] = paxRecord;
    } else {
      paxList.push(paxRecord);
    }
    activePaxId = paxRecord.id;

    closeFareModal();
    renderPaxTable();
  }

  if (proceedBtn) proceedBtn.addEventListener("click", () => openFareModal(null));
  if (addLineBtn) addLineBtn.addEventListener("click", () => openFareModal(null));
  if (addLineBtnBot) addLineBtnBot.addEventListener("click", () => openFareModal(null));
  if (refreshBtn) refreshBtn.addEventListener("click", recalcInvoiceTotal);
  if (modalCloseX) modalCloseX.addEventListener("click", closeFareModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeFareModal);
  if (modalSaveBtn) modalSaveBtn.addEventListener("click", saveFareModal);

  // ============================================================
  // Journal Voucher (J.V) Modal
  // ============================================================
  const jvModal = document.getElementById("jv-modal");
  const jvBtn = document.getElementById("jv-btn");
  const jvCloseX = document.getElementById("jv-close-x-btn");
  const jvOkBtn = document.getElementById("jv-ok-btn");

  function closeJvModal() {
    if (jvModal) jvModal.classList.remove("open");
  }

  function openJvModal() {
    if (!jvModal) return;

    // Retrieve values from page
    const invNo = document.getElementById("invoice_number")?.value?.trim() ||
                  document.getElementById("booking_reference")?.value?.trim() ||
                  "TKT-" + Date.now().toString().slice(-6);
    const invDate = getDateGroupValue(document.getElementById("invoice_date")) || todayDDMMYYYY();
    const custEl = document.getElementById("customer_name");
    const custName = (custEl?.options ? custEl.options[custEl.selectedIndex]?.text : custEl?.value)?.trim() || "Customer (Sundry Debtors)";
    const suppEl = document.getElementById("supplier_name");
    const suppName = (suppEl?.options ? suppEl.options[suppEl.selectedIndex]?.text : suppEl?.value)?.trim() || "Airline BSP (Sundry Creditors)";
    const ccy = document.getElementById("currency")?.textContent || (activeCountry === "AE" ? "AED" : "INR");

    // Aggregate fare components across pax
    let sumBasic = 0, sumTaxes = 0, sumDisc = 0, sumMarkup = 0, sumService = 0, sumGst = 0, sumTotal = 0;
    paxList.forEach((p) => {
      sumBasic += Number(p.basic_fare || 0);
      sumTaxes += Number(p.yq || 0) + Number(p.yr || 0) + Number(p.k3_tax || 0) + Number(p.tax_others || 0) +
                  Number(p.seat || 0) + Number(p.meal || 0) + Number(p.baggage || 0) + Number(p.other_ssr || 0);
      sumDisc += Number(p.cust_discount || 0);
      sumMarkup += Number(p.markup || 0) + Number(p.addl_markup || 0);
      sumService += Number(p.service_fee || 0) + Number(p.addl_service_fee || 0);
      sumGst += Number(p.gst_amount || 0);
      sumTotal += Number(p.total || 0);
    });

    if (sumTotal === 0 && paxList.length === 0) {
      const invTotalEl = document.getElementById("invoice_total");
      const parsedTotal = invTotalEl ? parseFloat(invTotalEl.textContent.replace(/,/g, "")) : 0;
      if (parsedTotal > 0) {
        sumTotal = parsedTotal;
        sumBasic = parsedTotal;
      }
    }

    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Set meta headers
    const jvNo = "JV-" + invNo.replace(/^INV-/, "");
    const vnoEl = document.getElementById("jv-modal-vno");
    if (vnoEl) vnoEl.textContent = jvNo;
    const metaVno = document.getElementById("jv-meta-vno");
    if (metaVno) metaVno.textContent = jvNo;
    const metaDate = document.getElementById("jv-meta-date");
    if (metaDate) metaDate.textContent = invDate;
    const metaCcy = document.getElementById("jv-meta-currency");
    if (metaCcy) metaCcy.textContent = ccy;
    const metaCust = document.getElementById("jv-meta-customer");
    if (metaCust) metaCust.textContent = custName;
    const metaSupp = document.getElementById("jv-meta-supplier");
    if (metaSupp) metaSupp.textContent = suppName;

    jvModal.querySelectorAll(".jv-currency-label").forEach(el => el.textContent = ccy);

    // Build balanced double-entry GL lines
    const glLines = [];

    // Line 1: Debit Customer for Total Billed
    glLines.push({
      account: custName,
      category: "Sundry Debtors (Asset)",
      debit: sumTotal,
      credit: 0
    });

    // Line 2: Credit Supplier for Basic + Taxes - Cust Discount
    const supplierPayable = Math.max(0, sumBasic + sumTaxes - sumDisc);
    glLines.push({
      account: suppName,
      category: "Sundry Creditors (Liability)",
      debit: 0,
      credit: supplierPayable
    });

    // Line 3: Credit Airline Ticket Markup Income
    if (sumMarkup > 0) {
      glLines.push({
        account: "Airline Ticket Markup Income",
        category: "Direct Income",
        debit: 0,
        credit: sumMarkup
      });
    }

    // Line 4: Credit Management & Service Fee Income
    if (sumService > 0) {
      glLines.push({
        account: "Management & Service Fee Income",
        category: "Direct Income",
        debit: 0,
        credit: sumService
      });
    }

    // Line 5: Credit Output GST / VAT
    if (sumGst > 0) {
      glLines.push({
        account: activeCountry === "AE" ? "Output VAT Payable (5%)" : "Output GST Payable (Duties & Taxes)",
        category: "Duties & Taxes (Liability)",
        debit: 0,
        credit: sumGst
      });
    }

    // Calculate total debit and credit
    const totalDr = glLines.reduce((acc, row) => acc + row.debit, 0);
    const totalCr = glLines.reduce((acc, row) => acc + row.credit, 0);

    // Render table rows
    const tbody = document.getElementById("jv-table-body");
    if (tbody) {
      tbody.innerHTML = glLines.map((row, idx) => `
        <tr style="border-bottom: 1px solid #E2E8F0; height: 26px; ${idx % 2 === 1 ? 'background:#F8FAFC;' : ''}">
          <td style="text-align:center; color:#64748B;">${idx + 1}</td>
          <td style="font-weight:600; color:#1E293B;">${row.account}</td>
          <td style="color:#64748B; font-size:11px;">${row.category}</td>
          <td style="text-align:right; font-family:var(--font-mono); font-weight:${row.debit > 0 ? '700' : '400'}; color:${row.debit > 0 ? '#0F766E' : '#94A3B8'};">${row.debit > 0 ? fmt(row.debit) : '—'}</td>
          <td style="text-align:right; font-family:var(--font-mono); font-weight:${row.credit > 0 ? '700' : '400'}; color:${row.credit > 0 ? '#0F766E' : '#94A3B8'};">${row.credit > 0 ? fmt(row.credit) : '—'}</td>
        </tr>
      `).join("");
    }

    const drEl = document.getElementById("jv-total-debit");
    if (drEl) drEl.textContent = fmt(totalDr);
    const crEl = document.getElementById("jv-total-credit");
    if (crEl) crEl.textContent = fmt(totalCr);

    const narrEl = document.getElementById("jv-narration-text");
    if (narrEl) {
      const paxNames = paxList.map(p => p.passenger_name).filter(Boolean).join(", ");
      narrEl.textContent = `Being airline ticket sales invoice entry for ${paxNames || 'passenger'} on ${suppName} (Ref #${invNo}). Total Dr and Cr fully balanced.`;
    }

    jvModal.classList.add("open");
  }

  if (jvBtn) jvBtn.addEventListener("click", openJvModal);
  if (jvCloseX) jvCloseX.addEventListener("click", closeJvModal);
  if (jvOkBtn) jvOkBtn.addEventListener("click", closeJvModal);

  // ============================================================
  // Matching Adjustments Modal (Reference Image 4)
  // ============================================================
  const matchingModal = document.getElementById("matching-modal");
  const matchingBtn = document.getElementById("matching-btn");
  const matchingCloseX = document.getElementById("matching-close-x-btn");
  const matchingOkBtn = document.getElementById("matching-ok-btn");

  function closeMatchingModal() {
    if (matchingModal) matchingModal.classList.remove("open");
  }

  function openMatchingModal() {
    if (!matchingModal) return;
    const invNo = document.getElementById("invoice_number")?.value?.trim() ||
                  document.getElementById("booking_reference")?.value?.trim() || "IS11/ 3";
    const invDate = getDateGroupValue(document.getElementById("invoice_date")) || todayDDMMYYYY();
    const custEl = document.getElementById("customer");
    const custName = (custEl?.options ? custEl.options[custEl.selectedIndex]?.text : custEl?.value)?.trim() || "Customer Account";
    const ccy = document.getElementById("currency")?.textContent || (activeCountry === "AE" ? "AED" : "INR");

    let sumTotal = 0;
    paxList.forEach(p => sumTotal += Number(p.total || 0));
    if (sumTotal === 0) {
      const invTotalEl = document.getElementById("invoice_total");
      sumTotal = invTotalEl ? parseFloat(invTotalEl.textContent.replace(/,/g, "")) || 0 : 0;
    }

    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const titleEl = document.getElementById("matching-modal-title");
    if (titleEl) titleEl.textContent = invNo;
    const docNoEl = document.getElementById("matching-doc-no");
    if (docNoEl) docNoEl.textContent = invNo;
    const docDateEl = document.getElementById("matching-doc-date");
    if (docDateEl) docDateEl.textContent = invDate;
    const balEl = document.getElementById("matching-balance-amount");
    if (balEl) balEl.textContent = `${ccy} ${fmt(sumTotal)}`;

    const tbody = document.getElementById("matching-table-body");
    if (tbody) {
      const pnrHeader = document.getElementById("airline_pnr_header")?.value?.trim() || "—";
      const rowsHtml = paxList.map((p, idx) => `
        <tr style="border-bottom:1px solid #E2E8F0; height:26px; ${idx % 2 === 1 ? 'background:#F8FAFC;' : ''}">
          <td style="padding:4px 8px; color:#475569;">${p.travel_date_display || invDate}</td>
          <td style="padding:4px 8px; font-family:var(--font-mono); font-weight:600; color:#0F766E;">${invNo}</td>
          <td style="padding:4px 8px; font-weight:600;">
            ${p.passenger_name} (${p.pax_type || 'Adult'}) &bull; <span style="color:#64748B; font-size:10.5px;">Tkt: ${p.ticket_no} / ${p.sector || 'Sector'}</span>
          </td>
          <td style="padding:4px 8px; color:#475569; font-family:var(--font-mono);">${p.pnr || pnrHeader}</td>
          <td style="padding:4px 8px; text-align:center; font-weight:600;">${ccy}</td>
          <td style="padding:4px 8px; text-align:right; font-family:var(--font-mono); font-weight:700; color:#0F766E;">${fmt(p.total)}</td>
        </tr>
      `).join("");

      tbody.innerHTML = rowsHtml || `
        <tr>
          <td style="padding:4px 8px; color:#475569;">${invDate}</td>
          <td style="padding:4px 8px; font-family:var(--font-mono); font-weight:600; color:#0F766E;">${invNo}</td>
          <td style="padding:4px 8px; font-weight:600;">BOOKED BY ${custName} &bull; Ticket Sales Booking</td>
          <td style="padding:4px 8px; color:#475569; font-family:var(--font-mono);">REF-${invNo}</td>
          <td style="padding:4px 8px; text-align:center; font-weight:600;">${ccy}</td>
          <td style="padding:4px 8px; text-align:right; font-family:var(--font-mono); font-weight:700; color:#0F766E;">${fmt(sumTotal)}</td>
        </tr>
      `;
    }

    matchingModal.classList.add("open");
  }

  if (matchingBtn) matchingBtn.addEventListener("click", openMatchingModal);
  if (matchingCloseX) matchingCloseX.addEventListener("click", closeMatchingModal);
  if (matchingOkBtn) matchingOkBtn.addEventListener("click", closeMatchingModal);

  // Timestamp
  const tsEl = document.getElementById("erp-live-timestamp");
  if (tsEl) {
    const d = new Date();
    tsEl.textContent = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

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
    for (const p of paxList) {
      if ((p.airline_code || "").length > 3) { alert("Airline Code must be 3 characters or fewer."); return false; }
      if ((p.passenger_name || "").length > 30) { alert("Pax Name must be 30 characters or fewer."); return false; }
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

    if (paxList.length === 0) {
      alert("Please add at least one passenger before saving. Click Proceed \u2794 to enter passenger & fare details.");
      return;
    }

    const lines = paxList.map((p) => ({
      airline_code: p.airline_code || "",
      airline_name: p.airline_name || p.airline_code || "—",
      flight_no: p.flight_no || "",
      ticket_no: p.ticket_no.trim(),
      passenger_name: p.passenger_name.trim(),
      pax_type: p.pax_type || "Adult",
      sector: p.sector || "",
      travel_date: p.travel_date_iso || toISOFromDDMMYYYY(p.travel_date_display) || new Date().toISOString().slice(0, 10),
      basic_fare: Number(p.basic_fare || 0),
      yq: Number(p.yq || 0),
      yr: Number(p.yr || 0),
      k3_tax: Number(p.k3_tax || 0),
      tax_others: Number(p.tax_others || 0),
      seat: Number(p.seat || 0),
      meal: Number(p.meal || 0),
      baggage: Number(p.baggage || 0),
      other_ssr: Number(p.other_ssr || 0),
      disc_on: p.disc_on || null,
      disc_type: p.disc_type || null,
      disc_value: Number(p.disc_value || 0),
      tds_per: Number(p.tds_per || 0),
      markup: Number(p.markup || 0),
      addl_markup: Number(p.addl_markup || 0),
      service_fee: Number(p.service_fee || 0),
      addl_service_fee: Number(p.addl_service_fee || 0),
      gst_pct: Number(p.gst_pct || 0),
      status: p.status || "ISSUED",
    }));

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
      alert(err.message || "Could not save this ticket. Is the backend running?");
    }
  });


  function toDDMMYYYY(val) {
    if (!val) return "";
    const s = String(val).slice(0, 10);
    const parts = s.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return val;
  }

  function populateTicketData(t) {
    if (t.invoice_number) document.getElementById("invoice_number").value = t.invoice_number;
    if (t.invoice_date) setDateGroupValue(document.getElementById("invoice_date"), toDDMMYYYY(t.invoice_date));
    if (t.invoice_type) document.getElementById("invoice_type").value = t.invoice_type;

    if (t.customer_name) {
      document.getElementById("customer").value = t.customer_name;
      const c = allCustomers.find((cust) => cust.name === t.customer_name);
      document.getElementById("customer_code").textContent = c ? c.code : (t.customer_code || "—");
      const addrEl = document.getElementById("customer_address");
      const addrText = (c && c.address) ? c.address.trim() : (t.customer_address || "");
      addrEl.textContent = addrText || "—";
      addrEl.title = addrText || "Customer Address";
      document.getElementById("customer_gst").textContent = (c && c.gst_no) ? c.gst_no : (t.customer_gst || "—");
    }

    if (t.supplier_name) {
      document.getElementById("supplier").value = t.supplier_name;
      const s = allSuppliers.find((supp) => supp.name === t.supplier_name);
      document.getElementById("office_id").value = t.office_id || (s && s.office_id ? s.office_id : "");
    } else if (t.office_id) {
      document.getElementById("office_id").value = t.office_id;
    }

    if (t.booking_reference) document.getElementById("booking_reference").value = t.booking_reference;
    if (t.booking_ref_date) setDateGroupValue(document.getElementById("booking_ref_date"), toDDMMYYYY(t.booking_ref_date));
    if (t.booking_given_by) document.getElementById("booking_given_by").value = t.booking_given_by;

    if (t.booking_mode) document.getElementById("booking_mode").textContent = t.booking_mode;
    if (t.booking_type) document.getElementById("booking_type").value = t.booking_type;
    if (t.booking_status) document.getElementById("booking_status").value = t.booking_status;

    if (t.travel_type) document.getElementById("travel_type").value = t.travel_type;
    if (t.user_name) document.getElementById("user_name").value = t.user_name;
    if (t.payment_mode) document.getElementById("payment_mode").value = t.payment_mode;
    if (t.airline_category) document.getElementById("airline_category").value = t.airline_category;

    if (t.currency) {
      document.getElementById("currency").textContent = t.currency;
      const balCcy = document.getElementById("bal-currency");
      if (balCcy) balCcy.textContent = t.currency;
    }
    if (t.roe != null) document.getElementById("roe").value = t.roe;

    if (t.airline_pnr) document.getElementById("airline_pnr_header").value = t.airline_pnr;
    if (t.gds_pnr) document.getElementById("gds_pnr_header").value = t.gds_pnr;

    paxList = [{
      id: t.id,
      pnr: t.pnr || t.airline_pnr || t.gds_pnr || t.booking_reference || "—",
      airline_code: t.airline_code || "",
      airline_name: t.airline_name || "",
      flight_no: t.flight_no || "",
      ticket_no: t.ticket_no || "",
      passenger_name: t.passenger_name || "",
      pax_type: t.pax_type || "Adult",
      sector: t.sector || "",
      travel_date_display: toDDMMYYYY(t.travel_date) || t.travel_date || "—",
      travel_date_iso: t.travel_date || "",
      status: t.status || "ISSUED",
      basic_fare: Number(t.basic_fare || 0),
      yq: Number(t.yq || 0),
      yr: Number(t.yr || 0),
      k3_tax: Number(t.k3_tax || 0),
      tax_others: Number(t.tax_others || 0),
      seat: Number(t.seat || 0),
      meal: Number(t.meal || 0),
      baggage: Number(t.baggage || 0),
      other_ssr: Number(t.other_ssr || 0),
      disc_on: t.disc_on || "",
      disc_type: t.disc_type || "",
      disc_value: Number(t.disc_value || 0),
      tds_per: Number(t.tds_per || 0),
      markup: Number(t.markup || 0),
      addl_markup: Number(t.addl_markup || 0),
      service_fee: Number(t.service_fee || 0),
      addl_service_fee: Number(t.addl_service_fee || 0),
      gst_pct: Number(t.gst_pct || 0),
      total: Number(t.total_billed || t.basic_fare || 0),
    }];

    renderPaxTable();

    if (isViewMode) {
      applyViewMode(t);
    }
  }

  function applyViewMode(t) {
    const titleEl = document.getElementById("page-title");
    if (titleEl) {
      titleEl.textContent = `View Airline Ticket — ${t.ticket_no || ''} (${t.passenger_name || ''})`;
    }

    // Disable all inputs & selects in the main form
    document.querySelectorAll("#ticket-form input, #ticket-form select").forEach((el) => {
      el.setAttribute("disabled", "true");
      el.style.backgroundColor = "#F1F5F9";
      el.style.cursor = "default";
      el.style.color = "#1E293B";
    });

    // Hide Proceed button
    if (proceedBtn) proceedBtn.style.display = "none";

    // Hide Add Passenger buttons
    if (addLineBtn) addLineBtn.style.display = "none";
    if (addLineBtnBot) addLineBtnBot.style.display = "none";

    // Bottom toolbar: hide Save Ticket, switch Discard to prominent "← Back to Tickets"
    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn) submitBtn.style.display = "none";

    const cancelLink = document.getElementById("cancel-link");
    if (cancelLink) {
      cancelLink.textContent = "← Back to Tickets";
      cancelLink.className = "dom-nav-btn btn-primary";
      cancelLink.style.fontWeight = "700";
      cancelLink.style.display = "inline-flex";
    }

    const jvBtn = document.getElementById("jv-btn");
    if (jvBtn) {
      jvBtn.style.display = "inline-flex";
    }

    const matchingBtn = document.getElementById("matching-btn");
    if (matchingBtn) {
      matchingBtn.style.display = "inline-flex";
    }
  }

  // Ensure J.V and Matching buttons are hidden when opening New Ticket
  if (!isViewMode) {
    const jvBtn = document.getElementById("jv-btn");
    if (jvBtn) jvBtn.style.display = "none";
    const matchingBtn = document.getElementById("matching-btn");
    if (matchingBtn) matchingBtn.style.display = "none";
  }

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

    if (!editId) {
      renderPaxTable();
    } else {
      const existing = existingTickets.find((t) => String(t.id) === String(editId));
      if (existing) {
        populateTicketData(existing);
      } else {
        try {
          const directRes = await fetch(`${API_BASE}/tickets/`);
          if (directRes.ok) {
            const allT = await directRes.json();
            const found = allT.find((t) => String(t.id) === String(editId));
            if (found) {
              populateTicketData(found);
              return;
            }
          }
        } catch (_) {}
        renderPaxTable();
      }
    }
  }
})();