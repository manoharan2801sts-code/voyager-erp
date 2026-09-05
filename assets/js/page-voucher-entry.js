(async function () {
  const { fillSelect, todayISO, saveRecord, getEditId, getReturnTo } = window.VoyagerEntry;
  let activeCompanyId, activeCountry, accounts = [], originalVoucherNo = null;
  let lineCount = 0;
  const editId = getEditId();
  const returnTo = getReturnTo("vouchers.html");
  document.getElementById("cancel-link").href = returnTo;

  function accountOptionsHtml() {
    return `<option value="">Select account…</option>` + accounts.map((a) => `<option value="${a.name}">${a.code} — ${a.name}</option>`).join("");
  }

  function addLine(prefill) {
    lineCount += 1;
    const id = `line-${lineCount}`;
    const tr = document.createElement("tr");
    tr.id = id;
    tr.innerHTML = `
      <td><select class="form-control-custom line-account">${accountOptionsHtml()}</select></td>
      <td><input class="form-control-custom line-debit" type="number" min="0" step="0.01" value="${prefill && prefill.debit ? prefill.debit : ""}" /></td>
      <td><input class="form-control-custom line-credit" type="number" min="0" step="0.01" value="${prefill && prefill.credit ? prefill.credit : ""}" /></td>
      <td><button type="button" class="btn-outline-brand remove-line" style="padding:0.4rem 0.7rem; font-size:0.78rem;">✕</button></td>`;
    document.getElementById("lines-body").appendChild(tr);
    tr.querySelector(".line-debit").addEventListener("input", recalcTotals);
    tr.querySelector(".line-credit").addEventListener("input", recalcTotals);
    tr.querySelector(".remove-line").addEventListener("click", () => { tr.remove(); recalcTotals(); });
    if (prefill && prefill.account) tr.querySelector(".line-account").value = prefill.account;
  }

  function recalcTotals() {
    let debit = 0, credit = 0;
    document.querySelectorAll("#lines-body tr").forEach((tr) => {
      debit += parseFloat(tr.querySelector(".line-debit").value) || 0;
      credit += parseFloat(tr.querySelector(".line-credit").value) || 0;
    });
    document.getElementById("total-debit").textContent = debit.toFixed(2);
    document.getElementById("total-credit").textContent = credit.toFixed(2);
    const balanced = debit > 0 && Math.abs(debit - credit) < 0.005;
    const indicator = document.getElementById("balance-indicator");
    const saveBtn = document.getElementById("save-btn");
    if (balanced) {
      indicator.textContent = "Balanced ✓";
      indicator.style.background = "var(--color-success-bg)"; indicator.style.color = "var(--color-success)";
      saveBtn.disabled = false;
    } else {
      indicator.textContent = "Unbalanced";
      indicator.style.background = "var(--color-danger-bg)"; indicator.style.color = "var(--color-danger)";
      saveBtn.disabled = true;
    }
  }

  function populateRefs(companyId) {
    const ref = window.VoyagerMock.getReferenceData(companyId);
    fillSelect(document.getElementById("branch"), ref.branches, (b) => b.name, (b) => b.name);
    accounts = ref.accounts;
    document.querySelectorAll(".line-account").forEach((sel) => (sel.innerHTML = accountOptionsHtml()));
  }

  function prefill(v) {
    document.getElementById("page-title").textContent = `Edit Voucher — ${v.voucher_no}`;
    document.getElementById("save-btn").textContent = "Update Voucher";
    originalVoucherNo = v.voucher_no;
    document.getElementById("branch").value = v.branch_name;
    document.getElementById("voucher_type").value = v.voucher_type;
    document.getElementById("voucher_date").value = v.voucher_date;
    document.getElementById("narration").value = v.narration || "";
    document.getElementById("lines-body").innerHTML = "";
    lineCount = 0;
    v.lines.forEach((l) => addLine({ account: l.account_name, debit: l.debit, credit: l.credit }));
    recalcTotals();
  }

  if (!editId) document.getElementById("voucher_date").value = todayISO();
  document.getElementById("add-line-btn").addEventListener("click", () => addLine());

  document.getElementById("voucher-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const lines = Array.from(document.querySelectorAll("#lines-body tr")).map((tr) => ({
      account_name: tr.querySelector(".line-account").value,
      debit: parseFloat(tr.querySelector(".line-debit").value) || 0,
      credit: parseFloat(tr.querySelector(".line-credit").value) || 0,
      narration: null,
    })).filter((l) => l.account_name && (l.debit || l.credit));

    const total = parseFloat(document.getElementById("total-debit").textContent);
    const type = document.getElementById("voucher_type").value;
    const payload = {
      voucher_no: originalVoucherNo || `${type.slice(0, 3)}-${document.getElementById("voucher_date").value.replace(/-/g, "").slice(0, 6)}-${Math.floor(1000 + Math.random() * 8999)}`,
      voucher_type: type, voucher_date: document.getElementById("voucher_date").value,
      narration: document.getElementById("narration").value, branch_name: document.getElementById("branch").value,
      total_debit: total, total_credit: total, is_posted: true, lines,
    };
    await saveRecord({
      mockAdd: window.VoyagerMock.addVoucher, mockUpdate: window.VoyagerMock.updateVoucher2,
      apiPath: "/accounting/vouchers", companyId: activeCompanyId, editId,
      payload, successMessage: editId ? "Voucher updated." : "Voucher posted.", redirectTo: returnTo,
    });
  });

  const active = await VoyagerShell.init({
    activeKey: "vouchers",
    onCompanyChange: (id, country) => { activeCompanyId = Number(id); activeCountry = country; populateRefs(activeCompanyId); },
  });
  if (active) {
    activeCompanyId = Number(active.id); activeCountry = active.country;
    populateRefs(activeCompanyId);
    if (editId) {
      const v = await window.VoyagerAPI.get(`/accounting/vouchers/${editId}`);
      prefill(v);
    } else {
      addLine(); addLine();
      recalcTotals();
    }
  }
})();
