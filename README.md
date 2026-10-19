# Civic-Chain: School Purchasing-Card Controls (Demo)

An interactive demonstration of how a K-12 school district can run its
purchasing-card (p-card) program as a **real-time, policy-enforced, publicly
auditable** spend-control system instead of a monthly bank statement
reconciled by hand weeks after the money moved.

> **This is a demonstration.** Every figure is illustrative sample data. The
> three district profiles are archetypes, not real districts. Chart-of-account
> codes follow the *structure* of the Maine DOE School Finance handbook but are
> modeled for the demo, and the ledger anchoring / tamper-evidence is modeled.
> Nothing here is legal, financial, or audit advice.

This repo is a **self-contained static bundle** — no build step, no server, no
dependencies. It is a sibling to the CivicChain TLaaS, TIF, and TRL demos.

---

## Contents

1. [The problem](#1-the-problem)
2. [What this demonstrates](#2-what-this-demonstrates)
3. [The demo, tab by tab](#3-the-demo-tab-by-tab)
4. [Acceptance criteria → where to see each](#4-acceptance-criteria--where-to-see-each)
5. [The money & legal-entity model](#5-the-money--legal-entity-model)
6. [How the numbers work](#6-how-the-numbers-work)
7. [Scope](#7-scope)
8. [Run & deploy](#8-run--deploy)
9. [File map](#9-file-map)
10. [Open questions](#10-open-questions)

---

## 1. The problem

School districts run p-card programs through a bank. Controls are limited to
broad MCC (merchant-category) blocks configured at the issuer; statements arrive
monthly; reconciliation to budget codes is a manual spreadsheet done weeks after
the money moved. A purchase outside policy is discovered during reconciliation or
the annual audit, **not at the register**. The business administrator carries
audit and board exposure for spend they cannot see in real time, and the district
has no way to show the board or public where card dollars went without producing a
report by hand.

**Primary persona:** School Business Administrator / District Finance Director in
a district too small for a dedicated procurement office. **Secondary:** a building
principal or department head holding a card; the district's external auditor.

## 2. What this demonstrates

CivicChain issues **virtual cards scoped to a budget code rather than to a
person**, in three tiers (District, Building, Individual). It:

- Enforces a **per-budget-code MCC allowlist at the authorization webhook**, so an
  out-of-policy merchant is **declined in real time** with a cardholder-visible
  reason — not flagged later.
- Funds each card from a **pool tied to its budget code**, with **hard decline on
  exhaustion** and an automatic **admin refill request**.
- Writes a **redacted settlement record to a public ledger** (merchant category,
  amount, budget code — and **no cardholder identity**), so board and public
  reporting is a query.
- Maps every budget code to the district **chart of accounts**, so >90% of spend
  auto-reconciles with no manual coding.

## 3. The demo, tab by tab

A **district-profile selector** (top right) swaps the whole dataset between three
archetypes (see §5).

- **Overview** — pooled funds, per-code pools, and the five-step control in plain
  language.
- **Cards & pools** — the three card tiers, each shown bound to a budget code with
  its live pool meter, COA string, and allowed MCC chips.
- **Authorization simulator** — the core control. Pick a card, a merchant (each
  carries an MCC), and an amount, then run the authorization. The webhook approves
  or declines in real time; approved transactions settle and write a public record.
- **Public ledger** — the redacted settlement records with a running hash, plus a
  one-click **tamper test**: alter a published figure and the recomputed
  fingerprint stops matching the anchored chain. Open **admin refill requests**
  land here too.
- **Board reporting** — filter settled spend by building and date range and
  **export CSV**. No manual coding; the COA string is already on every row.
- **Receipts** — attach a receipt to any settled transaction still missing one;
  it links to that record.
- **Chart of accounts** — every budget code resolved to its Fund · Location ·
  Function · Object dimensions.

## 4. Acceptance criteria → where to see each

| Acceptance criterion | Where |
| --- | --- |
| Card on a building budget code; merchant MCC outside the allowlist → declined in real time, cardholder sees the reason | **Authorization simulator** — e.g. the HS Science-Supplies card at "The Corner Diner" (MCC 5812) |
| Budget-code pool exhausted → hard decline + admin refill request created | **Authorization simulator** — set an amount above a pool's remaining balance; the request appears on the **Public ledger** tab |
| Settlement → redacted public record (category, amount, budget code, no cardholder identity) | **Public ledger** — every approved sim transaction appends one |
| Admin filters board reporting by building + date range → export, no manual coding | **Board reporting** — filter and **Export CSV** |
| Cardholder uploads a receipt → linked to the settled record at settlement | **Receipts** — attach to a settled transaction |

## 5. The money & legal-entity model

Funds sit in a pooled **For-Benefit-Of (FBO)** account at a partner bank (card
issuing via **Lithic**, ledgering via **Modern Treasury**). Each customer gets its
own account on the Modern Treasury ledger, with **one sub-account per budget code**.
The legal-entity question decides who the "customer" is:

| Profile in the demo | Archetype | How it's onboarded |
| --- | --- | --- |
| Pinebrook RSU | Regional unit (RSU / SAD) | **Its own legal entity** → its own CivicChain / Modern Treasury customer; FBO pool with a sub-account per budget code |
| Alder Falls | Municipal school unit | **Part of the town** → sits **under the town's** customer, with school budget codes as sub-accounts of the town's account |
| SAD 7 | Regional unit (RSU / SAD) | Own legal entity spanning several towns → own customer; member towns separated by budget-code sub-account |

This mirrors the towns product: regional districts (RSUs/SADs) onboard as their
own customer; municipal school units ride the town's account.

## 6. How the numbers work

- Each budget code has a **funded pool** and a **spent-to-date** figure; remaining
  = funded − spent. Approved simulator transactions increase spent and draw down
  the pool live.
- The **authorization webhook** (`authorize()` in `app.js`) runs three checks in
  order: global block list → per-code MCC allowlist → pool sufficiency. The first
  failure declines with a specific reason.
- The **public ledger** keeps the merchant *category* and a masked vendor label,
  never the cardholder or card number. Each record carries a running non-crypto
  hash chained to the previous record — a stand-in for on-chain anchoring, enough
  to show the tamper test visually.

## 7. Scope

**In scope:** card tiers bound to budget codes; per-code MCC allowlist with
real-time decline + reason; per-code pools with hard decline + refill workflow;
receipt capture/link; budget-code → chart-of-accounts mapping; board export by
building and budget code.

**Out of scope:** student-information-system integration and any student-level
data; federal grant / Title I / IDEA compliance reporting; physical card
issuance; purchase-order / requisition workflow integration.

## 8. Run & deploy

**Run locally** — it's plain static files, so any static server works:

```bash
cd civic-chain-schools
python3 -m http.server 8080
# open http://localhost:8080
```

(Opening `index.html` via `file://` also works, but a server is closer to prod
and avoids any path quirks with the `/brand/` absolute asset paths.)

**Deploy** — push to GitHub and connect the repo to Netlify. `netlify.toml` sets
`publish = "."` with no build command; Netlify serves the files as-is.

## 9. File map

```
index.html     structure + copy, loads the two scripts
styles.css     brand-matched styling (DM Sans / DM Serif Text, CivicChain palette)
data.js        the data model: profiles, budget codes, MCCs, cards, seed ledger
app.js         all interactivity: tabs, authorization webhook, ledger, reporting
brand/         CivicChain logo, favicon, social preview (shared brand assets)
netlify.toml   static deploy config (no build step)
```

To change the sample data (districts, budget codes, pools, MCC allowlists,
merchants, seed transactions), edit `data.js` — it's the single source of truth
and everything else renders from it.

## 10. Open questions

- **Issuing partner for K-12.** Same as the towns product: Lithic for issuing,
  Modern Treasury for ledgering, funds in a pooled FBO account. Resolved for
  legal-entity structure (see §5): RSUs/SADs onboard as their own customer;
  municipal school units ride the town's account with school budget codes as
  sub-accounts.
- **State chart-of-accounts mandate.** Confirm with Maine DOE (school finance)
  whether reporting under the handbook's chart of accounts is mandatory. Either
  way, budget codes map to the handbook:
  <https://www.maine.gov/doe/funding/accounting/handbook>.
