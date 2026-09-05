(async function () {
  const { get } = window.VoyagerAPI;
  const { fmtMoney, currencyFor } = window.VoyagerUtil;

  async function load(companyId, country) {
    const ccy = currencyFor(country);
    if (country === "IN") {
      document.getElementById("tax-title").textContent = "GST Compliance";
      document.getElementById("tax-sub").textContent = "HSN/SAC-wise taxable value and CGST/SGST/IGST — feeds GSTR-1 / GSTR-3B.";
      document.getElementById("tax-thead").innerHTML = `<tr><th>HSN/SAC</th><th style="text-align:right;">Taxable Value</th><th style="text-align:right;">CGST</th><th style="text-align:right;">SGST</th><th style="text-align:right;">IGST</th><th style="text-align:right;">Total Tax</th></tr>`;
      const rows = await get(`/reports/gst-summary?company_id=${companyId}`);
      document.getElementById("tax-body").innerHTML = rows.map((r) => `
        <tr class="drillable" title="Click to view the GST-bearing vouchers">
          <td style="font-family:var(--font-mono);">${r.hsn_sac_code}</td>
          <td style="text-align:right;" class="tabular-nums">${fmtMoney(r.taxable_value, ccy)}</td>
          <td style="text-align:right;" class="tabular-nums">${fmtMoney(r.cgst, ccy)}</td>
          <td style="text-align:right;" class="tabular-nums">${fmtMoney(r.sgst, ccy)}</td>
          <td style="text-align:right;" class="tabular-nums">${fmtMoney(r.igst, ccy)}</td>
          <td style="text-align:right;" class="tabular-nums" style="font-weight:700;">${fmtMoney(r.cgst + r.sgst + r.igst, ccy)}</td>
        </tr>`).join("") || `<tr><td colspan="6" class="text-muted-custom" style="padding:1.5rem;">No GST transactions for this entity.</td></tr>`;
      document.querySelectorAll("#tax-body tr.drillable").forEach((tr) => {
        tr.addEventListener("click", () => VoyagerDrilldown.byLedger("GST Payable", companyId, ccy));
      });
    } else {
      document.getElementById("tax-title").textContent = "UAE VAT Compliance";
      document.getElementById("tax-sub").textContent = "VAT code-wise taxable value and output VAT — feeds the FTA VAT return.";
      document.getElementById("tax-thead").innerHTML = `<tr><th>VAT Code</th><th style="text-align:right;">Taxable Value</th><th style="text-align:right;">VAT Amount</th></tr>`;
      const rows = await get(`/reports/vat-summary?company_id=${companyId}`);
      document.getElementById("tax-body").innerHTML = rows.map((r) => `
        <tr class="drillable" title="Click to view the VAT-bearing vouchers">
          <td><span class="pill pill-neutral">${r.vat_code.replace("_", " ")}</span></td>
          <td style="text-align:right;" class="tabular-nums">${fmtMoney(r.taxable_value, ccy)}</td>
          <td style="text-align:right;" class="tabular-nums" style="font-weight:700;">${fmtMoney(r.vat_amount, ccy)}</td>
        </tr>`).join("") || `<tr><td colspan="3" class="text-muted-custom" style="padding:1.5rem;">No VAT transactions for this entity.</td></tr>`;
      document.querySelectorAll("#tax-body tr.drillable").forEach((tr) => {
        tr.addEventListener("click", () => VoyagerDrilldown.byLedger("VAT Payable", companyId, ccy));
      });
    }
  }

  const active = await VoyagerShell.init({ activeKey: "tax", onCompanyChange: load });
  if (active) load(active.id, active.country);
})();
