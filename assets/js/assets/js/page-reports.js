(async function () {
  const { get } = window.VoyagerAPI;
  const { fmtMoney, currencyFor } = window.VoyagerUtil;
  let activeCompanyId, activeCcy;

  async function load(companyId, country) {
    activeCompanyId = companyId; activeCcy = currencyFor(country);
    const rows = await get(`/reports/trial-balance?company_id=${companyId}`);
    let totalDebit = 0, totalCredit = 0;
    document.getElementById("tb-body").innerHTML = rows.map((r) => {
      totalDebit += r.debit; totalCredit += r.credit;
      return `<tr class="drillable" data-ledger="${r.name}" title="Click to view the vouchers behind this balance">
        <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--color-text-muted);">${r.code}</td>
        <td>${r.name}</td><td><span class="pill pill-neutral">${r.account_type}</span></td>
        <td style="text-align:right;" class="tabular-nums">${r.debit ? fmtMoney(r.debit, activeCcy) : ""}</td>
        <td style="text-align:right;" class="tabular-nums">${r.credit ? fmtMoney(r.credit, activeCcy) : ""}</td>
      </tr>`;
    }).join("");
    document.getElementById("tb-foot").innerHTML = `
      <tr style="font-weight:800; background:var(--color-bg-canvas);">
        <td colspan="3" style="padding:0.85rem 1.2rem;">Total</td>
        <td style="text-align:right; padding:0.85rem 1.2rem;" class="tabular-nums">${fmtMoney(totalDebit, activeCcy)}</td>
        <td style="text-align:right; padding:0.85rem 1.2rem;" class="tabular-nums">${fmtMoney(totalCredit, activeCcy)}</td>
      </tr>`;

    document.querySelectorAll("#tb-body tr.drillable").forEach((tr) => {
      tr.addEventListener("click", () => VoyagerDrilldown.byLedger(tr.dataset.ledger, activeCompanyId, activeCcy));
    });
  }

  const active = await VoyagerShell.init({ activeKey: "reports", onCompanyChange: load });
  if (active) load(active.id, active.country);
})();
