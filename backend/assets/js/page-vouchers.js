(async function () {
  const { get } = window.VoyagerAPI;
  const { fmtMoney, fmtDate, currencyFor } = window.VoyagerUtil;
  const { zoomInUrl } = window.VoyagerEntry;

  async function load(companyId, country) {
    const vouchers = await get(`/accounting/vouchers?company_id=${companyId}&limit=150`);
    const ccy = currencyFor(country);
    document.getElementById("voucher-list").innerHTML = vouchers.map((v, i) => `
      <div class="v-card">
        <div class="v-head" data-idx="${i}">
          <div class="v-no">${v.voucher_no}</div>
          <div class="v-type"><span class="pill pill-neutral">${v.voucher_type.replace("_", " ")}</span></div>
          <div class="v-date">${fmtDate(v.voucher_date)}</div>
          <div class="v-narration">${v.narration || ""} <span class="text-muted-custom">— ${v.branch_name}</span></div>
          <div class="v-amount">${fmtMoney(v.total_debit, ccy)}</div>
          <a href="${zoomInUrl("voucher-entry.html", v.id, "vouchers.html")}" class="btn-outline-brand" style="padding:0.2rem 0.5rem; font-size:0.72rem; margin-left:0.5rem;" onclick="event.stopPropagation()">Edit</a>
        </div>
        <div class="v-lines" id="vl-${i}">
          <table>
            <thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
            <tbody>
              ${v.lines.map((l) => `<tr><td>${l.account_name}</td><td>${l.debit ? fmtMoney(l.debit, ccy) : ""}</td><td>${l.credit ? fmtMoney(l.credit, ccy) : ""}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`).join("");

    document.querySelectorAll(".v-head").forEach((head) => {
      head.addEventListener("click", () => document.getElementById(`vl-${head.dataset.idx}`).classList.toggle("open"));
    });
  }

  const active = await VoyagerShell.init({ activeKey: "vouchers", onCompanyChange: load });
  if (active) load(active.id, active.country);
})();
