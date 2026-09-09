(async function () {
  const { fillSelect, todayISO, saveRecord, getEditId, getReturnTo } = window.VoyagerEntry;
  let activeCompanyId, activeCountry, allCustomers = [], tourServices = [], editingServiceId = null;
  const editId = getEditId();
  const urlParams = new URLSearchParams(window.location.search);
  const isViewMode = urlParams.get("mode") === "view" || Boolean(editId);
  const returnTo = getReturnTo("tours.html");
  document.getElementById("cancel-link").href = returnTo;

  // ============================================================
  // Date Helpers (dd-mm-yyyy <-> ISO)
  // ============================================================
  function todayDDMMYYYY() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  function toISOFromDDMMYYYY(ddmmyyyy) {
    if (!ddmmyyyy || typeof ddmmyyyy !== "string") return todayISO();
    const parts = ddmmyyyy.trim().split(/[-/]/);
    if (parts.length === 3) {
      const dd = parts[0].padStart(2, "0");
      const mm = parts[1].padStart(2, "0");
      const yyyy = parts[2].length === 2 ? "20" + parts[2] : parts[2];
      return `${yyyy}-${mm}-${dd}`;
    }
    return todayISO();
  }

  function toDDMMYYYYFromISO(iso) {
    if (!iso || typeof iso !== "string") return todayDDMMYYYY();
    const parts = iso.trim().slice(0, 10).split("-");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return todayDDMMYYYY();
  }

  function setDateGroupValue(container, ddmmyyyy) {
    if (!container) return;
    const parts = (ddmmyyyy || "").split("-");
    const dd = container.querySelector(".dg-dd");
    const mm = container.querySelector(".dg-mm");
    const yyyy = container.querySelector(".dg-yyyy");
    if (dd) dd.value = parts[0] || "";
    if (mm) mm.value = parts[1] || "";
    if (yyyy) yyyy.value = parts[2] || "";
  }

  function getDateGroupValue(container) {
    if (!container) return "";
    const dd = container.querySelector(".dg-dd")?.value?.trim() || "";
    const mm = container.querySelector(".dg-mm")?.value?.trim() || "";
    const yyyy = container.querySelector(".dg-yyyy")?.value?.trim() || "";
    if (!dd && !mm && !yyyy) return "";
    return `${dd.padStart(2, "0")}-${mm.padStart(2, "0")}-${yyyy}`;
  }

  function wireDateGroup(container, onChange) {
    if (!container) return;
    const dd = container.querySelector(".dg-dd"), mm = container.querySelector(".dg-mm"), yyyy = container.querySelector(".dg-yyyy");
    const segments = [dd, mm, yyyy];
    segments.forEach((el, i) => {
      el.addEventListener("input", () => {
        el.value = el.value.replace(/\D/g, "").slice(0, el.maxLength);
        if (el.value.length === el.maxLength && segments[i + 1]) segments[i + 1].focus();
        if (onChange) onChange();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && el.value === "" && segments[i - 1]) {
          segments[i - 1].focus();
        }
      });
    });
  }

  function updateDuration() {
    const sDateIso = toISOFromDDMMYYYY(getDateGroupValue(document.getElementById("start_date")));
    const eDateIso = toISOFromDDMMYYYY(getDateGroupValue(document.getElementById("end_date")));
    const durEl = document.getElementById("duration_display");
    if (!durEl) return;
    try {
      const s = new Date(sDateIso);
      const e = new Date(eDateIso);
      const diffMs = e.getTime() - s.getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      const nights = Math.max(0, diffDays - 1);
      durEl.textContent = `${nights} Night${nights === 1 ? '' : 's'} / ${diffDays} Day${diffDays === 1 ? '' : 's'}`;
    } catch (_) {
      durEl.textContent = "—";
    }
  }

  wireDateGroup(document.getElementById("booking_date"));
  wireDateGroup(document.getElementById("start_date"), updateDuration);
  wireDateGroup(document.getElementById("end_date"), updateDuration);

  // ============================================================
  // Populate Reference Data (Customers, Branches)
  // ============================================================
  function populateRefs(companyId) {
    const ref = window.VoyagerMock.getReferenceData(companyId);
    allCustomers = ref.customers || [];
    const ccy = ref.currency || (activeCountry === "AE" ? "AED" : "INR");
    document.getElementById("currency").textContent = ccy;
    document.getElementById("bal-currency").textContent = ccy;

    const branchSel = document.getElementById("branch");
    if (branchSel) {
      fillSelect(branchSel, ref.branches || [], (b) => b.name, (b) => b.name);
    }

    const datalist = document.getElementById("customer-options");
    if (datalist) {
      datalist.innerHTML = allCustomers.map((c) => `<option value="${c.name}">${c.code ? `[${c.code}] ` : ""}${c.name}</option>`).join("");
    }
  }

  const custInput = document.getElementById("customer");
  if (custInput) {
    custInput.addEventListener("input", () => {
      const val = custInput.value.trim().toLowerCase();
      const match = allCustomers.find((c) => c.name.toLowerCase() === val || (c.code && c.code.toLowerCase() === val));
      if (match) {
        document.getElementById("customer_code").textContent = match.code || "—";
        document.getElementById("customer_gst").textContent = match.tax_reg_no || match.trn || "33AAACB1533F4ZB";
      } else {
        document.getElementById("customer_code").textContent = "—";
        document.getElementById("customer_gst").textContent = "—";
      }
    });
  }

  // ============================================================
  // Tour Services & Flight Components Table Management
  // ============================================================
  const linesBody = document.getElementById("tour-lines");
  const serviceModal = document.getElementById("service-modal");
  const modalCloseX = document.getElementById("modal-close-x-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalSaveBtn = document.getElementById("modal-save-btn");
  const proceedBtn = document.getElementById("proceed-btn");
  const addItemBtnGrid = document.getElementById("add-item-btn-grid");
  const addItemBtnBot = document.getElementById("add-item-btn-bot");
  const refreshBtn = document.getElementById("refresh-total-btn");

  function recalcTotals() {
    let sumCost = 0, sumRevenue = 0;
    tourServices.forEach((s) => {
      sumCost += Number(s.cost || 0);
      sumRevenue += Number(s.revenue || 0);
    });
    const margin = sumRevenue - sumCost;
    const marginPct = sumRevenue > 0 ? ((margin / sumRevenue) * 100).toFixed(1) : "0.0";

    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById("package_net_total").textContent = fmt(sumRevenue);
    document.getElementById("breakdown-cost").textContent = fmt(sumCost);
    document.getElementById("breakdown-revenue").textContent = fmt(sumRevenue);
    document.getElementById("breakdown-margin").textContent = fmt(margin);
    document.getElementById("breakdown-margin-pct").textContent = `${marginPct}%`;
    document.getElementById("breakdown-net").textContent = fmt(sumRevenue);

    const statusVal = document.getElementById("status")?.value || "CONFIRMED";
    document.getElementById("breakdown-status").textContent = statusVal;
  }

  function renderServicesTable() {
    if (tourServices.length === 0) {
      linesBody.innerHTML = `
        <tr id="no-services-row">
          <td colspan="8" style="text-align:center; padding:18px; color:#64748B; font-size:11.5px;">
            No services or flights added yet. Fill details above and click <strong style="color:#0F766E;">+ Add Service / Flight &#10132;</strong> to add airline flights, hotels, and tour components.
          </td>
        </tr>`;
      document.getElementById("services-count").textContent = "0 Items";
      if (addItemBtnGrid) addItemBtnGrid.style.display = isViewMode ? "none" : "none";
      if (addItemBtnBot) addItemBtnBot.style.display = isViewMode ? "none" : "none";
      recalcTotals();
      return;
    }

    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    linesBody.innerHTML = tourServices.map((s, idx) => {
      const margin = Number(s.revenue || 0) - Number(s.cost || 0);
      const actionHtml = isViewMode ? `
        <button type="button" class="dom-action-btn btn-view-service" data-id="${s.id}" style="color:#0F766E; font-weight:700;">Details</button>
      ` : `
        <div class="dom-action-btn-group">
          <button type="button" class="dom-action-btn btn-edit-service" data-id="${s.id}" style="color:#0F766E; font-weight:700;">Edit</button>
          <button type="button" class="dom-action-btn btn-delete-service" data-id="${s.id}" style="color:#DC2626;">&times;</button>
        </div>
      `;

      return `
        <tr class="service-row" data-id="${s.id}">
          <td style="text-align:center; font-weight:700;">${idx + 1}</td>
          <td><span class="pill pill-neutral" style="font-size:10px; font-weight:700;">${s.category}</span></td>
          <td>
            <strong>${s.description}</strong>
            ${s.details ? `<div style="font-size:10.5px; color:#64748B;">${s.details}</div>` : ""}
          </td>
          <td>${s.supplier_name || "—"}</td>
          <td class="num">${fmt(s.cost)}</td>
          <td class="num" style="font-weight:700; color:#0F766E;">${fmt(s.revenue)}</td>
          <td class="num" style="font-weight:700; color:#16A34A;">${fmt(margin)}</td>
          <td style="text-align:center;">${actionHtml}</td>
        </tr>
      `;
    }).join("");

    document.getElementById("services-count").textContent = `${tourServices.length} Item${tourServices.length === 1 ? "" : "s"}`;
    if (addItemBtnGrid) addItemBtnGrid.style.display = isViewMode ? "none" : "inline-flex";
    if (addItemBtnBot) addItemBtnBot.style.display = isViewMode ? "none" : "inline-flex";

    linesBody.querySelectorAll(".btn-view-service, .btn-edit-service").forEach(btn => {
      btn.addEventListener("click", () => openServiceModal(btn.dataset.id));
    });

    linesBody.querySelectorAll(".btn-delete-service").forEach(btn => {
      btn.addEventListener("click", () => {
        tourServices = tourServices.filter(item => String(item.id) !== String(btn.dataset.id));
        renderServicesTable();
      });
    });

    recalcTotals();
  }

  // ============================================================
  // Service Item Modal
  // ============================================================
  function openServiceModal(id) {
    editingServiceId = id;
    const catSelect = document.getElementById("modal-service-category");
    const flightFields = document.getElementById("modal-flight-fields");

    const updateCategoryFields = () => {
      if (flightFields) {
        flightFields.style.display = catSelect.value === "FLIGHT" ? "block" : "none";
      }
    };
    catSelect.onchange = updateCategoryFields;

    if (id) {
      const item = tourServices.find(s => String(s.id) === String(id));
      if (item) {
        document.getElementById("modal-service-display").textContent = `Edit — ${item.category}`;
        catSelect.value = item.category || "FLIGHT";
        document.getElementById("modal-supplier-name").value = item.supplier_name || "";
        document.getElementById("modal-ref-no").value = item.ref_no || "";
        document.getElementById("modal-flight-airline").value = item.flight_airline || "";
        document.getElementById("modal-flight-no").value = item.flight_no || "";
        document.getElementById("modal-flight-ticket").value = item.flight_ticket || "";
        document.getElementById("modal-flight-sector").value = item.flight_sector || "";
        document.getElementById("modal-item-description").value = item.description || "";
        document.getElementById("modal-cost").value = item.cost || 0;
        document.getElementById("modal-revenue").value = item.revenue || 0;
      }
    } else {
      document.getElementById("modal-service-display").textContent = `Item #${tourServices.length + 1}`;
      catSelect.value = "FLIGHT";
      document.getElementById("modal-supplier-name").value = "";
      document.getElementById("modal-ref-no").value = "";
      document.getElementById("modal-flight-airline").value = "";
      document.getElementById("modal-flight-no").value = "";
      document.getElementById("modal-flight-ticket").value = "";
      document.getElementById("modal-flight-sector").value = "";
      document.getElementById("modal-item-description").value = "";
      document.getElementById("modal-cost").value = 0;
      document.getElementById("modal-revenue").value = 0;
    }

    updateCategoryFields();
    recalcModalMargin();

    if (isViewMode) {
      if (modalSaveBtn) modalSaveBtn.style.display = "none";
      serviceModal.querySelectorAll("input, select").forEach(el => {
        el.setAttribute("disabled", "true");
        el.style.backgroundColor = "#F1F5F9";
      });
    } else {
      if (modalSaveBtn) modalSaveBtn.style.display = "inline-flex";
      serviceModal.querySelectorAll("input, select").forEach(el => {
        el.removeAttribute("disabled");
        el.style.backgroundColor = "";
      });
    }

    serviceModal.classList.add("open");
  }

  function closeServiceModal() {
    if (serviceModal) serviceModal.classList.remove("open");
    editingServiceId = null;
  }

  function recalcModalMargin() {
    const cost = parseFloat(document.getElementById("modal-cost").value) || 0;
    const rev = parseFloat(document.getElementById("modal-revenue").value) || 0;
    const margin = rev - cost;
    const pct = rev > 0 ? ((margin / rev) * 100).toFixed(1) : "0.0";
    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById("modal-margin-computed").textContent = fmt(margin);
    document.getElementById("modal-margin-pct").textContent = `${pct}%`;
  }

  document.querySelectorAll(".modal-calc").forEach(el => el.addEventListener("input", recalcModalMargin));

  function saveServiceModal() {
    const cat = document.getElementById("modal-service-category").value;
    const desc = document.getElementById("modal-item-description").value.trim();
    const supp = document.getElementById("modal-supplier-name").value.trim();
    if (!desc || !supp) {
      alert("Supplier / Vendor and Item Description are required.");
      return;
    }

    const cost = parseFloat(document.getElementById("modal-cost").value) || 0;
    const rev = parseFloat(document.getElementById("modal-revenue").value) || 0;

    let details = "";
    if (cat === "FLIGHT") {
      const air = document.getElementById("modal-flight-airline").value.trim();
      const fn = document.getElementById("modal-flight-no").value.trim();
      const sec = document.getElementById("modal-flight-sector").value.trim();
      const tkt = document.getElementById("modal-flight-ticket").value.trim();
      details = [air, fn, sec, tkt ? `Tkt: ${tkt}` : ""].filter(Boolean).join(" • ");
    } else {
      const ref = document.getElementById("modal-ref-no").value.trim();
      if (ref) details = `Ref: ${ref}`;
    }

    const serviceRecord = {
      id: editingServiceId || String(Date.now()),
      category: cat,
      description: desc,
      details,
      supplier_name: supp,
      ref_no: document.getElementById("modal-ref-no").value.trim(),
      flight_airline: document.getElementById("modal-flight-airline").value.trim(),
      flight_no: document.getElementById("modal-flight-no").value.trim(),
      flight_ticket: document.getElementById("modal-flight-ticket").value.trim(),
      flight_sector: document.getElementById("modal-flight-sector").value.trim(),
      cost,
      revenue: rev
    };

    if (editingServiceId) {
      const idx = tourServices.findIndex(s => String(s.id) === String(editingServiceId));
      if (idx !== -1) tourServices[idx] = serviceRecord;
    } else {
      tourServices.push(serviceRecord);
    }

    closeServiceModal();
    renderServicesTable();
  }

  if (proceedBtn) proceedBtn.addEventListener("click", () => openServiceModal(null));
  if (addItemBtnGrid) addItemBtnGrid.addEventListener("click", () => openServiceModal(null));
  if (addItemBtnBot) addItemBtnBot.addEventListener("click", () => openServiceModal(null));
  if (modalCloseX) modalCloseX.addEventListener("click", closeServiceModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeServiceModal);
  if (modalSaveBtn) modalSaveBtn.addEventListener("click", saveServiceModal);
  if (refreshBtn) refreshBtn.addEventListener("click", recalcTotals);

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
    const pkgRef = document.getElementById("booking_ref")?.value?.trim() || "PKG-2026-TOUR";
    const pkgDate = getDateGroupValue(document.getElementById("booking_date")) || todayDDMMYYYY();
    const custName = document.getElementById("customer")?.value?.trim() || "Customer (Sundry Debtors)";
    const pkgName = document.getElementById("package_name")?.value?.trim() || "Tour Package";
    const ccy = document.getElementById("currency")?.textContent || "INR";

    let sumCost = 0, sumRevenue = 0;
    tourServices.forEach(s => {
      sumCost += Number(s.cost || 0);
      sumRevenue += Number(s.revenue || 0);
    });

    if (sumRevenue === 0) {
      const netEl = document.getElementById("package_net_total");
      sumRevenue = netEl ? parseFloat(netEl.textContent.replace(/,/g, "")) || 0 : 0;
      sumCost = sumRevenue * 0.8;
    }

    const margin = sumRevenue - sumCost;
    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const jvNo = "JV-" + pkgRef;
    document.getElementById("jv-modal-vno").textContent = jvNo;
    document.getElementById("jv-meta-vno").textContent = jvNo;
    document.getElementById("jv-meta-date").textContent = pkgDate;
    document.getElementById("jv-meta-currency").textContent = ccy;
    document.getElementById("jv-meta-customer").textContent = custName;
    document.getElementById("jv-meta-package").textContent = pkgName;

    jvModal.querySelectorAll(".jv-currency-label").forEach(el => el.textContent = ccy);

    // Double-entry GL lines
    const glLines = [
      { account: custName, category: "Sundry Debtors (Asset)", debit: sumRevenue, credit: 0 },
      { account: "Tour Package Suppliers / Vendors", category: "Sundry Creditors (Liability)", debit: 0, credit: sumCost },
      { account: "Tour Package Operating Margin Income", category: "Direct Income", debit: 0, credit: margin }
    ];

    const totalDr = glLines.reduce((acc, row) => acc + row.debit, 0);
    const totalCr = glLines.reduce((acc, row) => acc + row.credit, 0);

    const tbody = document.getElementById("jv-table-body");
    if (tbody) {
      tbody.innerHTML = glLines.map((row, idx) => `
        <tr style="border-bottom:1px solid #E2E8F0; height:26px; ${idx % 2 === 1 ? 'background:#F8FAFC;' : ''}">
          <td style="text-align:center; color:#64748B;">${idx + 1}</td>
          <td style="font-weight:600; color:#1E293B;">${row.account}</td>
          <td style="color:#64748B; font-size:11px;">${row.category}</td>
          <td style="text-align:right; font-family:var(--font-mono); font-weight:${row.debit > 0 ? '700' : '400'}; color:${row.debit > 0 ? '#0F766E' : '#94A3B8'};">${row.debit > 0 ? fmt(row.debit) : '—'}</td>
          <td style="text-align:right; font-family:var(--font-mono); font-weight:${row.credit > 0 ? '700' : '400'}; color:${row.credit > 0 ? '#0F766E' : '#94A3B8'};">${row.credit > 0 ? fmt(row.credit) : '—'}</td>
        </tr>
      `).join("");
    }

    document.getElementById("jv-total-debit").textContent = fmt(totalDr);
    document.getElementById("jv-total-credit").textContent = fmt(totalCr);
    document.getElementById("jv-narration-text").textContent = `Being tour package billing for ${pkgName} for client ${custName} (Ref #${pkgRef}). Total Dr and Cr fully balanced.`;

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
    const pkgRef = document.getElementById("booking_ref")?.value?.trim() || "PKG-2026-TOUR";
    const pkgDate = getDateGroupValue(document.getElementById("booking_date")) || todayDDMMYYYY();
    const custName = document.getElementById("customer")?.value?.trim() || "Customer Account";
    const pkgName = document.getElementById("package_name")?.value?.trim() || "Tour Package";
    const ccy = document.getElementById("currency")?.textContent || "INR";

    let sumRevenue = 0;
    tourServices.forEach(s => sumRevenue += Number(s.revenue || 0));
    if (sumRevenue === 0) {
      const netEl = document.getElementById("package_net_total");
      sumRevenue = netEl ? parseFloat(netEl.textContent.replace(/,/g, "")) || 0 : 0;
    }

    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById("matching-modal-title").textContent = pkgRef;
    document.getElementById("matching-doc-no").textContent = pkgRef;
    document.getElementById("matching-doc-date").textContent = pkgDate;
    document.getElementById("matching-balance-amount").textContent = `${ccy} ${fmt(sumRevenue)}`;

    const tbody = document.getElementById("matching-table-body");
    if (tbody) {
      const rowsHtml = tourServices.map((s, idx) => `
        <tr style="border-bottom:1px solid #E2E8F0; height:26px; ${idx % 2 === 1 ? 'background:#F8FAFC;' : ''}">
          <td style="padding:4px 8px; color:#475569;">${pkgDate}</td>
          <td style="padding:4px 8px; font-family:var(--font-mono); font-weight:600; color:#0F766E;">${pkgRef}</td>
          <td style="padding:4px 8px; font-weight:600;">
            [${s.category}] ${s.description} &bull; <span style="color:#64748B; font-size:10.5px;">Vendor: ${s.supplier_name}</span>
          </td>
          <td style="padding:4px 8px; color:#475569; font-family:var(--font-mono);">${s.ref_no || `SRV-${idx+1}`}</td>
          <td style="padding:4px 8px; text-align:center; font-weight:600;">${ccy}</td>
          <td style="padding:4px 8px; text-align:right; font-family:var(--font-mono); font-weight:700; color:#0F766E;">${fmt(s.revenue)}</td>
        </tr>
      `).join("");

      tbody.innerHTML = rowsHtml || `
        <tr>
          <td style="padding:4px 8px; color:#475569;">${pkgDate}</td>
          <td style="padding:4px 8px; font-family:var(--font-mono); font-weight:600; color:#0F766E;">${pkgRef}</td>
          <td style="padding:4px 8px; font-weight:600;">BOOKED BY ${custName} &bull; ${pkgName}</td>
          <td style="padding:4px 8px; color:#475569; font-family:var(--font-mono);">REF-${pkgRef}</td>
          <td style="padding:4px 8px; text-align:center; font-weight:600;">${ccy}</td>
          <td style="padding:4px 8px; text-align:right; font-family:var(--font-mono); font-weight:700; color:#0F766E;">${fmt(sumRevenue)}</td>
        </tr>
      `;
    }

    matchingModal.classList.add("open");
  }

  if (matchingBtn) matchingBtn.addEventListener("click", openMatchingModal);
  if (matchingCloseX) matchingCloseX.addEventListener("click", closeMatchingModal);
  if (matchingOkBtn) matchingOkBtn.addEventListener("click", closeMatchingModal);

  // Live Timestamp
  const tsEl = document.getElementById("erp-live-timestamp");
  if (tsEl) {
    const d = new Date();
    tsEl.textContent = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ============================================================
  // Prefill Data & View Mode Configuration
  // ============================================================
  function prefill(t) {
    document.getElementById("booking_ref").value = t.booking_ref || `PKG-${String(t.id).padStart(4, '0')}`;
    setDateGroupValue(document.getElementById("booking_date"), toDDMMYYYYFromISO(t.booking_date || t.start_date));
    document.getElementById("package_type").value = t.package_type || "FIT";
    document.getElementById("customer").value = t.customer_name || "";
    document.getElementById("branch").value = t.branch_name || "";
    document.getElementById("package_name").value = t.package_name || "";
    document.getElementById("pax_count").value = t.pax_count || 2;
    setDateGroupValue(document.getElementById("start_date"), toDDMMYYYYFromISO(t.start_date));
    setDateGroupValue(document.getElementById("end_date"), toDDMMYYYYFromISO(t.end_date));
    document.getElementById("status").value = t.status || "CONFIRMED";
    document.getElementById("destination").value = t.destination || "";
    updateDuration();

    // Look up customer code/gst
    const match = allCustomers.find((c) => c.name.toLowerCase() === (t.customer_name || '').toLowerCase());
    if (match) {
      document.getElementById("customer_code").textContent = match.code || "—";
      document.getElementById("customer_gst").textContent = match.tax_reg_no || match.trn || "33AAACB1533F4ZB";
    }

    // Populate seeded components if empty
    if (t.services && Array.isArray(t.services) && t.services.length > 0) {
      tourServices = t.services;
    } else {
      const halfCost = Number(t.total_cost || 0) * 0.55;
      const halfRev = Number(t.total_revenue || 0) * 0.55;
      const restCost = Number(t.total_cost || 0) - halfCost;
      const restRev = Number(t.total_revenue || 0) - halfRev;

      tourServices = [
        {
          id: "srv-1",
          category: "FLIGHT",
          description: `Return Airline Flights for ${t.pax_count || 2} Pax`,
          details: `Air India (AI) • AI-502 • Sector: MAA-DEL-MAA`,
          supplier_name: "Air India BSP",
          ref_no: `PNR-T${t.id || '101'}`,
          flight_airline: "Air India",
          flight_no: "AI-502",
          flight_ticket: `098-8766${1000 + (t.id || 1)}`,
          flight_sector: "MAA-DEL-MAA",
          cost: halfCost,
          revenue: halfRev
        },
        {
          id: "srv-2",
          category: "HOTEL",
          description: `${t.package_name} Deluxe Resort Accommodation & Meals`,
          details: `4 Nights Deluxe Room with Daily Breakfast`,
          supplier_name: "Taj / Oberoi Hotels & Resorts",
          ref_no: `HTL-CONF-${1000 + (t.id || 1)}`,
          cost: restCost * 0.7,
          revenue: restRev * 0.7
        },
        {
          id: "srv-3",
          category: "SIGHTSEEING",
          description: `Guided City Tours, Private AC Vehicle & Monument Entries`,
          details: `Daily Sightseeing with English-speaking Guide`,
          supplier_name: "Voyager Destination Management",
          ref_no: `DMC-${1000 + (t.id || 1)}`,
          cost: restCost * 0.3,
          revenue: restRev * 0.3
        }
      ];
    }

    renderServicesTable();

    if (isViewMode) {
      applyViewMode(t);
    }
  }

  function applyViewMode(t) {
    document.getElementById("page-title").textContent = `View Tour Package — ${t.package_name || ''} (${t.customer_name || ''})`;

    document.querySelectorAll("#tour-form input, #tour-form select").forEach(el => {
      el.setAttribute("disabled", "true");
      el.style.backgroundColor = "#F1F5F9";
      el.style.cursor = "default";
      el.style.color = "#1E293B";
    });

    if (proceedBtn) proceedBtn.style.display = "none";
    if (addItemBtnGrid) addItemBtnGrid.style.display = "none";
    if (addItemBtnBot) addItemBtnBot.style.display = "none";

    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn) submitBtn.style.display = "none";

    const cancelLink = document.getElementById("cancel-link");
    if (cancelLink) {
      cancelLink.textContent = "← Back to Tours";
      cancelLink.className = "dom-nav-btn btn-primary";
      cancelLink.style.fontWeight = "700";
      cancelLink.style.display = "inline-flex";
    }

    if (jvBtn) jvBtn.style.display = "inline-flex";
    if (matchingBtn) matchingBtn.style.display = "inline-flex";
  }

  // Ensure J.V and Matching buttons are hidden on New Tour
  if (!isViewMode) {
    if (jvBtn) jvBtn.style.display = "none";
    if (matchingBtn) matchingBtn.style.display = "none";
  }

  // Default dates for new tour
  if (!editId) {
    document.getElementById("booking_ref").value = `PKG-${Date.now().toString().slice(-6)}`;
    setDateGroupValue(document.getElementById("booking_date"), todayDDMMYYYY());
    setDateGroupValue(document.getElementById("start_date"), todayDDMMYYYY());
    const end = new Date();
    end.setDate(end.getDate() + 6);
    const dd = String(end.getDate()).padStart(2, "0");
    const mm = String(end.getMonth() + 1).padStart(2, "0");
    const yyyy = end.getFullYear();
    setDateGroupValue(document.getElementById("end_date"), `${dd}-${mm}-${yyyy}`);
    updateDuration();
  }

  // ============================================================
  // Form Submission Handler
  // ============================================================
  document.getElementById("tour-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    let sumCost = 0, sumRevenue = 0;
    tourServices.forEach(s => {
      sumCost += Number(s.cost || 0);
      sumRevenue += Number(s.revenue || 0);
    });

    const payload = {
      booking_ref: document.getElementById("booking_ref").value.trim(),
      booking_date: toISOFromDDMMYYYY(getDateGroupValue(document.getElementById("booking_date"))),
      branch_name: document.getElementById("branch").value,
      customer_name: document.getElementById("customer").value.trim(),
      package_name: document.getElementById("package_name").value.trim(),
      package_type: document.getElementById("package_type").value,
      pax_count: parseInt(document.getElementById("pax_count").value) || 2,
      start_date: toISOFromDDMMYYYY(getDateGroupValue(document.getElementById("start_date"))),
      end_date: toISOFromDDMMYYYY(getDateGroupValue(document.getElementById("end_date"))),
      destination: document.getElementById("destination").value.trim(),
      payment_mode: document.getElementById("payment_mode").value,
      status: document.getElementById("status").value,
      total_cost: sumCost,
      total_revenue: sumRevenue,
      services: tourServices
    };

    await saveRecord({
      mockAdd: window.VoyagerMock.addTour,
      mockUpdate: window.VoyagerMock.updateTour,
      apiPath: "/travel/tours",
      companyId: activeCompanyId,
      editId,
      payload,
      successMessage: editId ? "Tour package updated." : "Tour package saved.",
      redirectTo: returnTo,
    });
  });

  // Shell init
  const active = await VoyagerShell.init({
    activeKey: "tours",
    onCompanyChange: (id, country) => {
      activeCompanyId = Number(id);
      activeCountry = country;
      populateRefs(activeCompanyId);
    },
  });

  if (active) {
    activeCompanyId = Number(active.id);
    activeCountry = active.country;
    populateRefs(activeCompanyId);

    if (editId) {
      const t = await window.VoyagerAPI.get(`/travel/tours/${editId}`);
      if (t) {
        prefill(t);
      } else {
        renderServicesTable();
      }
    } else {
      renderServicesTable();
    }
  }
})();
