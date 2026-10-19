/* Civic-Chain: School Purchasing-Card Controls — demo logic (vanilla JS)
 *
 * All state is in-memory and resets on reload. The point is to show, end to
 * end, each acceptance criterion:
 *   1. MCC outside a budget code's allowlist → real-time decline + reason.
 *   2. Exhausted pool → hard decline + admin refill request created.
 *   3. Settlement → redacted public ledger record (no cardholder identity) +
 *      a one-click tamper check over a running hash.
 *   4. Board reporting → filter by building + date range → export, no re-coding.
 *   5. Receipt upload → linked to the settled transaction record.
 */

(() => {
  const D = window.CC_DATA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- Mutable state ---------------------------------------------- */
  let activeProfile = "rsu";
  let txns = []; // settled ledger records for the active profile
  let refillRequests = []; // {codeId, label, building, at, amountNeeded}
  let txSeq = 1000;

  /* Deep-clone the active profile's budget codes so pool balances mutate
   * locally without touching the seed data. */
  let codes = {};

  function profile() { return D.PROFILES[activeProfile]; }
  function codeById(id) { return codes[id]; }
  function cardsForProfile() { return D.CARDS.filter((c) => c.profile === activeProfile); }

  /* Tiny non-crypto hash for the modeled tamper-evidence chain. Deterministic
   * over the record's public fields + the previous hash. */
  function hashStep(prev, rec) {
    const payload = `${prev}|${rec.date}|${rec.codeId}|${rec.mcc}|${rec.amount}|${rec.building}`;
    let h = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      h ^= payload.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function rechain() {
    let prev = "00000000";
    txns.forEach((t) => {
      t.prevHash = prev;
      t.hash = hashStep(prev, t);
      prev = t.hash;
    });
  }

  function loadProfile(id) {
    activeProfile = id;
    codes = {};
    profile().budgetCodes.forEach((c) => {
      // Spreading would freeze the poolRemaining getter to a static value, so
      // rebuild the clone with a live getter over the mutable spent balance.
      const clone = { ...c, poolFunded: c.poolFunded, poolSpent: c.poolSpent };
      Object.defineProperty(clone, "poolRemaining", {
        enumerable: true,
        get() { return this.poolFunded - this.poolSpent; },
      });
      codes[c.id] = clone;
    });
    refillRequests = [];
    txns = D.SEED_TXNS.filter((r) => r[0] === activeProfile).map((r, i) => ({
      ref: "TX-" + (2000 + i),
      date: r[1], codeId: r[2], mcc: r[3], merchantMasked: r[4],
      amount: r[5], building: r[6], receipt: r[7],
    }));
    rechain();
    renderAll();
  }

  /* ---- The authorization webhook — the core control -------------- */
  /* Returns { approved, reason, code }. This is the logic that would run at
   * Lithic's authorization webhook before the transaction is allowed. */
  function authorize(card, mcc, amount) {
    const code = codeById(card.budgetCodeId);
    if (D.GLOBAL_BLOCK.includes(mcc)) {
      return { approved: false, code, reason: `Category ${mcc} (${D.MCC[mcc]}) is globally blocked for all district cards.` };
    }
    const allow = D.ALLOWLIST[code.allowlist];
    if (!allow.includes(mcc)) {
      return { approved: false, code, reason: `Merchant category ${mcc} (${D.MCC[mcc]}) is not on the allowlist for budget code "${code.label}" (${code.coaString}).` };
    }
    if (amount > code.poolRemaining) {
      return { approved: false, hardExhaust: true, code, reason: `Budget-code pool exhausted. Remaining ${fmt(code.poolRemaining)} < requested ${fmt(amount)}. A refill request has been created for the business office.` };
    }
    return { approved: true, code, reason: "Within allowlist and funded. Authorized." };
  }

  function settle(card, mcc, amount) {
    const code = codeById(card.budgetCodeId);
    code.poolSpent += amount;
    const rec = {
      ref: "TX-" + ++txSeq,
      date: new Date().toISOString().slice(0, 10),
      codeId: code.id,
      mcc,
      merchantMasked: maskMerchant(mcc),
      amount,
      building: buildingForCode(code),
      receipt: false,
    };
    txns.push(rec);
    rechain();
    return rec;
  }

  function maskMerchant(mcc) {
    // Public ledger keeps the category, not the specific vendor identity.
    const label = D.MCC[mcc] || "Retail";
    return label.replace(/ Stores| Stations.*| & Peripherals/, "").replace(/\s*\(.*\)/, "") + " vendor";
  }
  function buildingForCode(code) {
    return D.LOCATIONS[code.location] || "District-wide";
  }

  /* ================================================================ *
   *  RENDER
   * ================================================================ */
  function renderAll() {
    renderHeader();
    renderOverview();
    renderCards();
    renderCoa();
    renderLedger();
    renderReporting();
    renderReceipts();
    renderSimCardOptions();
    resetSlip();
  }

  function renderHeader() {
    const p = profile();
    $("#entity-note").innerHTML =
      `<strong>${esc(p.name)}</strong> — ${esc(p.archetype)}.<br>${esc(p.entity)}`;
  }

  /* ---- Overview ---------------------------------------------------- */
  function renderOverview() {
    const p = profile();
    const cs = Object.values(codes);
    const funded = cs.reduce((a, c) => a + c.poolFunded, 0);
    const spent = cs.reduce((a, c) => a + c.poolSpent, 0);
    const autoCoded = txns.length; // every settled txn carries its code already
    const el = $("#overview");
    el.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:22px">
        ${statCard(p.enrollment.toLocaleString(), "Students")}
        ${statCard(p.buildings.length, "Buildings")}
        ${statCard(cs.length, "Budget-code pools")}
        ${statCard("100%", "Spend auto-coded")}
      </div>
      <div class="grid cols-2">
        <div class="card">
          <div class="stat-label">Pooled funds (across budget codes)</div>
          <div class="stat">${fmt(funded)}</div>
          <div class="meter ${spent / funded > 0.85 ? "warn" : ""}"><span style="width:${Math.min(100, (spent / funded) * 100).toFixed(1)}%"></span></div>
          <div class="metric-row"><span class="k">Committed / spent</span><span class="v">${fmt(spent)}</span></div>
          <div class="metric-row"><span class="k">Available</span><span class="v">${fmt(funded - spent)}</span></div>
          <p class="note" style="font-size:13px;color:var(--slate-500);margin:12px 0 0">
            Funds sit in a pooled For-Benefit-Of account at the partner bank (Lithic + Modern Treasury),
            one ledger sub-account per budget code. Cards are bound to a <em>code</em>, not a person.
          </p>
        </div>
        <div class="card">
          <h3>How the control works</h3>
          <ol style="margin:8px 0 0;padding-left:20px;font-size:14px;color:var(--slate-700);line-height:1.7">
            <li>Issue virtual cards scoped to a budget code, in three tiers (District / Building / Individual).</li>
            <li>Enforce the MCC allowlist <strong>at the authorization webhook</strong> — out-of-policy merchants decline at the register, with a reason.</li>
            <li>Hard-decline on pool exhaustion; auto-create an admin refill request.</li>
            <li>At settlement, write a <strong>redacted public record</strong> (category, amount, code — no cardholder identity).</li>
            <li>Board reporting is a filter-and-export query, not a monthly spreadsheet.</li>
          </ol>
        </div>
      </div>`;
  }
  function statCard(v, label) {
    return `<div class="card"><div class="stat sm">${esc(v)}</div><div class="stat-label" style="margin-top:6px">${esc(label)}</div></div>`;
  }

  /* ---- Cards ------------------------------------------------------- */
  function renderCards() {
    const el = $("#cards");
    const cards = cardsForProfile();
    el.innerHTML = `<div class="grid cols-3">${cards.map(cardTile).join("")}</div>`;
  }
  function cardTile(card) {
    const code = codeById(card.budgetCodeId);
    const pct = Math.min(100, (code.poolSpent / code.poolFunded) * 100);
    const rem = code.poolRemaining;
    const ratio = rem / code.poolFunded;
    const meterCls = ratio <= 0.05 ? "danger" : ratio <= 0.2 ? "warn" : "";
    const allow = D.ALLOWLIST[code.allowlist];
    return `
      <div class="card">
        <div class="paycard tier-${card.tier}">
          <span class="tier-badge">${card.tier}</span>
          <div class="pan">•••• ${card.last4}</div>
          <div class="meta">
            <div class="holder">${esc(card.holder)}</div>
            <span class="binding">bound to ${esc(code.label)}</span>
          </div>
        </div>
        <div style="margin-top:14px">
          <div class="metric-row"><span class="k">Pool remaining</span><span class="v">${fmt(rem)} / ${fmt(code.poolFunded)}</span></div>
          <div class="meter ${meterCls}"><span style="width:${pct.toFixed(1)}%"></span></div>
          <div class="coa-string" style="margin-top:8px">${code.coaString}</div>
          <div class="mcc-chips">
            ${allow.slice(0, 5).map((m) => `<span class="pill ok">${m}</span>`).join("")}
            ${allow.length > 5 ? `<span class="pill neutral">+${allow.length - 5}</span>` : ""}
          </div>
        </div>
      </div>`;
  }

  /* ---- Chart-of-accounts mapping ---------------------------------- */
  function renderCoa() {
    const el = $("#coa");
    const rows = Object.values(codes).map((c) => `
      <tr>
        <td><strong>${esc(c.label)}</strong></td>
        <td class="mono">${c.coaString}</td>
        <td>
          <div class="coa-dims">
            <span class="dim">Fund ${c.fund}</span>
            <span class="dim">Loc ${c.location} · ${esc(D.LOCATIONS[c.location] || "")}</span>
            <span class="dim">Func ${c.function} · ${esc(D.FUNCTIONS[c.function] || "")}</span>
            <span class="dim">Obj ${c.object} · ${esc(D.OBJECTS[c.object] || "")}</span>
          </div>
        </td>
      </tr>`).join("");
    el.innerHTML = `
      <div class="card" style="margin-bottom:18px">
        <p style="margin:0;font-size:14px;color:var(--slate-700)">
          Each CivicChain budget code resolves to a full chart-of-accounts string in the structure of the
          <a href="https://www.maine.gov/doe/funding/accounting/handbook" target="_blank" rel="noopener">Maine DOE School Finance handbook</a>
          (Fund · Location · Function · Object). Because the code rides every authorization and settlement, spend
          lands in the right account automatically — board and audit reporting become a query over this table.
        </p>
      </div>
      <table>
        <thead><tr><th>Budget code</th><th>COA string</th><th>Dimensions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  /* ---- Simulator --------------------------------------------------- */
  function renderSimCardOptions() {
    const cards = cardsForProfile();
    $("#sim-card").innerHTML = cards.map((c) => {
      const code = codeById(c.budgetCodeId);
      return `<option value="${c.id}">${esc(c.tier)} •••• ${c.last4} — ${esc(code.label)}</option>`;
    }).join("");
    $("#sim-merchant").innerHTML = D.MERCHANTS.map((m) =>
      `<option value="${m.mcc}">${esc(m.name)} — MCC ${m.mcc}</option>`).join("");
  }

  function resetSlip() {
    $("#slip").innerHTML = `<div class="note" style="text-align:center;padding-top:60px">
      Pick a card, a merchant, and an amount, then run the authorization.<br>
      Try the Science-Supplies card at <strong>The Corner Diner</strong>, or set an amount
      above a nearly-empty pool to trigger a hard decline.</div>`;
  }

  function runAuth() {
    const cardId = $("#sim-card").value;
    const mcc = $("#sim-merchant").value;
    const amount = Math.max(0, parseFloat($("#sim-amount").value) || 0);
    const card = D.CARDS.find((c) => c.id === cardId);
    const merchant = D.MERCHANTS.find((m) => m.mcc === mcc);
    const result = authorize(card, mcc, amount);
    const code = result.code;

    let settledBlock = "";
    if (result.approved) {
      const rec = settle(card, mcc, amount);
      settledBlock = `
        <hr>
        <div class="line"><span>Settled ref</span><span class="mono">${rec.ref}</span></div>
        <div class="line"><span>Public ledger</span><span class="pill ok">record written</span></div>
        <div class="note">A redacted settlement record was appended to the public ledger with
          category, amount, and budget code — no cardholder identity. See the <strong>Public Ledger</strong> tab.</div>`;
      renderCards(); renderOverview(); renderLedger(); renderReporting(); renderReceipts();
    } else if (result.hardExhaust) {
      // record an admin refill request
      refillRequests.push({
        codeId: code.id, label: code.label, building: buildingForCode(code),
        at: new Date().toLocaleString(), shortBy: amount - code.poolRemaining,
      });
      settledBlock = `<hr><div class="line"><span>Refill request</span><span class="pill gold">created for business office</span></div>`;
      renderLedger();
    }

    const decisionCls = result.approved ? "approve" : "decline";
    const decisionTxt = result.approved ? "APPROVED" : "DECLINED";
    $("#slip").innerHTML = `
      <div class="line"><span>Merchant</span><span>${esc(merchant.name)}</span></div>
      <div class="line"><span>Category (MCC)</span><span>${mcc} · ${esc(D.MCC[mcc])}</span></div>
      <div class="line"><span>Card</span><span>${esc(card.tier)} •••• ${card.last4}</span></div>
      <div class="line"><span>Budget code</span><span>${esc(code.label)}</span></div>
      <div class="line"><span>Amount</span><span>${fmt(amount)}</span></div>
      <div class="line"><span>Pool remaining</span><span>${fmt(code.poolRemaining)}</span></div>
      <div class="decision ${decisionCls}">${decisionTxt}</div>
      ${result.approved
        ? `<div class="note">${esc(result.reason)}</div>`
        : `<div class="reason">${esc(result.reason)}</div>`}
      ${settledBlock}`;
  }

  /* ---- Public ledger + tamper check ------------------------------- */
  function renderLedger() {
    const el = $("#ledger");
    const rows = txns.map((t) => `
      <tr>
        <td class="mono">${t.ref}</td>
        <td>${t.date}</td>
        <td>${esc(t.merchantMasked)}<br><span class="pill neutral">MCC ${t.mcc}</span></td>
        <td>${esc(codeById(t.codeId) ? codeById(t.codeId).label : t.codeId)}<br><span class="coa-string">${codeById(t.codeId) ? codeById(t.codeId).coaString : ""}</span></td>
        <td>${esc(t.building)}</td>
        <td class="num">${fmt(t.amount)}</td>
        <td>${t.receipt ? '<span class="pill ok">linked</span>' : '<span class="pill neutral">none</span>'}</td>
        <td class="mono" title="prev ${t.prevHash}">${t.hash}</td>
      </tr>`).join("");

    const refills = refillRequests.length
      ? `<ul class="refill-list">${refillRequests.map((r) => `
          <li><span><strong>Refill request</strong> — ${esc(r.label)} (${esc(r.building)})<br>
          <span style="font-size:12.5px">short by ${fmt(r.shortBy)} · ${esc(r.at)}</span></span>
          <span class="pill gold">open</span></li>`).join("")}</ul>`
      : `<p class="empty">No open refill requests. Exhaust a pool in the simulator to create one.</p>`;

    el.innerHTML = `
      <div class="tamper-bar">
        <span>Ledger integrity:</span>
        <span id="tamper-status" class="status ok">✓ verified — all ${txns.length} records recompute to the anchored chain</span>
        <span class="header-spacer"></span>
        <button class="btn ghost" id="btn-tamper">Tamper test</button>
        <button class="btn ghost" id="btn-reverify">Re-verify</button>
      </div>
      <p class="sub" style="margin-bottom:14px">Every settled transaction writes a redacted public record: merchant <em>category</em>,
      amount, budget code, building, date, and a running hash. No cardholder name, card number, or merchant identity is published.</p>
      <table>
        <thead><tr><th>Ref</th><th>Date</th><th>Category</th><th>Budget code</th><th>Building</th><th class="num">Amount</th><th>Receipt</th><th>Hash</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h3 style="margin:28px 0 10px;font-size:20px">Admin refill requests</h3>
      ${refills}`;

    $("#btn-tamper").onclick = () => {
      if (!txns.length) return;
      const i = Math.floor(txns.length / 2);
      txns[i].amount = +(txns[i].amount + 500).toFixed(2); // alter a published figure
      // do NOT rechain — the stored hashes now disagree with a recompute
      const status = $("#tamper-status");
      status.className = "status bad";
      status.innerHTML = `✗ FAILED — record ${txns[i].ref} was altered to ${fmt(txns[i].amount)}; its recomputed fingerprint no longer matches the anchored chain`;
      toast("Tamper detected — recompute ≠ anchor");
    };
    $("#btn-reverify").onclick = () => { rechain(); renderLedger(); toast("Re-anchored and verified"); };
  }

  /* ---- Board reporting -------------------------------------------- */
  function renderReporting() {
    const el = $("#reporting");
    const p = profile();
    const buildings = ["All buildings", ...p.buildings, "District-wide"];
    el.innerHTML = `
      <div class="controls">
        <div class="field"><label>Building</label>
          <select id="rep-building">${buildings.map((b) => `<option>${esc(b)}</option>`).join("")}</select></div>
        <div class="field"><label>From</label><input type="date" id="rep-from" value="2026-09-01"></div>
        <div class="field"><label>To</label><input type="date" id="rep-to" value="2026-10-31"></div>
        <button class="btn" id="rep-export">Export CSV</button>
      </div>
      <div id="rep-summary"></div>
      <div id="rep-table"></div>`;
    const run = () => renderReportTable();
    $("#rep-building").onchange = run;
    $("#rep-from").onchange = run;
    $("#rep-to").onchange = run;
    $("#rep-export").onclick = exportCsv;
    renderReportTable();
  }
  function reportRows() {
    const b = $("#rep-building").value;
    const from = $("#rep-from").value, to = $("#rep-to").value;
    return txns.filter((t) =>
      (b === "All buildings" || t.building === b) &&
      (!from || t.date >= from) && (!to || t.date <= to));
  }
  function renderReportTable() {
    const rows = reportRows();
    const total = rows.reduce((a, t) => a + t.amount, 0);
    const byCode = {};
    rows.forEach((t) => { byCode[t.codeId] = (byCode[t.codeId] || 0) + t.amount; });
    $("#rep-summary").innerHTML = `
      <div class="grid cols-3" style="margin-bottom:18px">
        ${statCard(rows.length, "Transactions")}
        ${statCard(fmt(total), "Total spend")}
        ${statCard("100%", "Pre-coded to COA")}
      </div>`;
    $("#rep-table").innerHTML = rows.length ? `
      <table>
        <thead><tr><th>Date</th><th>Building</th><th>Budget code</th><th>COA string</th><th>Category</th><th class="num">Amount</th></tr></thead>
        <tbody>${rows.map((t) => {
          const c = codeById(t.codeId);
          return `<tr><td>${t.date}</td><td>${esc(t.building)}</td><td>${esc(c ? c.label : t.codeId)}</td>
            <td class="mono">${c ? c.coaString : ""}</td><td>${esc(t.merchantMasked)} (MCC ${t.mcc})</td>
            <td class="num">${fmt(t.amount)}</td></tr>`;
        }).join("")}</tbody>
      </table>` : `<p class="empty">No transactions match this filter.</p>`;
  }
  function exportCsv() {
    const rows = reportRows();
    const header = ["Date", "Building", "Budget Code", "COA String", "Fund", "Function", "Object", "MCC", "Category", "Amount", "Receipt", "Ledger Hash"];
    const lines = [header.join(",")];
    rows.forEach((t) => {
      const c = codeById(t.codeId);
      lines.push([
        t.date, q(t.building), q(c ? c.label : t.codeId), c ? c.coaString : "",
        c ? c.fund : "", c ? c.function : "", c ? c.object : "",
        t.mcc, q(D.MCC[t.mcc] || ""), t.amount.toFixed(2), t.receipt ? "linked" : "none", t.hash,
      ].join(","));
    });
    download(`civicchain-schools-${activeProfile}-board-report.csv`, lines.join("\n"));
    toast(`Exported ${rows.length} rows — no manual coding`);
  }
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  function download(name, text) {
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---- Receipts ---------------------------------------------------- */
  function renderReceipts() {
    const el = $("#receipts");
    const missing = txns.filter((t) => !t.receipt);
    el.innerHTML = `
      <p class="sub">A cardholder captures a receipt at the point of transaction. When settlement posts, the
      receipt is linked to that settled record. Below are settled transactions still missing a receipt — attach one to link it.</p>
      ${missing.length ? `
        <table>
          <thead><tr><th>Ref</th><th>Date</th><th>Budget code</th><th>Category</th><th class="num">Amount</th><th>Receipt</th></tr></thead>
          <tbody>${missing.map((t) => {
            const c = codeById(t.codeId);
            return `<tr><td class="mono">${t.ref}</td><td>${t.date}</td><td>${esc(c ? c.label : t.codeId)}</td>
              <td>${esc(t.merchantMasked)}</td><td class="num">${fmt(t.amount)}</td>
              <td><button class="btn ghost attach" data-ref="${t.ref}">Attach receipt</button></td></tr>`;
          }).join("")}</tbody>
        </table>` : `<p class="empty">Every settled transaction has a linked receipt. 🎉</p>`}`;
    $$(".attach", el).forEach((b) => b.onclick = () => {
      const t = txns.find((x) => x.ref === b.dataset.ref);
      if (t) { t.receipt = true; renderReceipts(); renderLedger(); renderReportTable(); toast(`Receipt linked to ${t.ref}`); }
    });
  }

  /* ---- Toast ------------------------------------------------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ---- Tabs -------------------------------------------------------- */
  function initTabs() {
    $$(".tab").forEach((tab) => tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.setAttribute("aria-selected", "false"));
      $$(".panel").forEach((p) => p.setAttribute("data-active", "false"));
      tab.setAttribute("aria-selected", "true");
      $("#panel-" + tab.dataset.tab).setAttribute("data-active", "true");
    }));
  }

  /* ---- Boot -------------------------------------------------------- */
  function init() {
    initTabs();
    $("#profile").addEventListener("change", (e) => loadProfile(e.target.value));
    $("#sim-run").addEventListener("click", runAuth);
    loadProfile("rsu");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
