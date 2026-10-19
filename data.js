/*
 * Civic-Chain: School Purchasing-Card Controls — demo data
 *
 * Every figure here is illustrative sample data. District names are archetypes,
 * not real districts. Chart-of-account dimensions follow the structure of the
 * Maine DOE School Finance accounting handbook
 * (https://www.maine.gov/doe/funding/accounting/handbook) but the specific
 * codes and dollar amounts are modeled for the demo.
 *
 * No real cards are issued, no real money moves, and nothing here is legal,
 * financial, or audit advice.
 */

/* ------------------------------------------------------------------ *
 * Merchant Category Codes (ISO 18245) used across the demo.
 * ------------------------------------------------------------------ */
const MCC = {
  "5111": "Stationery & Office Supplies",
  "5943": "Office & School Supply Stores",
  "5942": "Book Stores",
  "5045": "Computers & Peripherals",
  "5734": "Computer Software Stores",
  "5200": "Home Supply & Hardware",
  "5211": "Lumber & Building Materials",
  "8299": "Educational Services",
  "5411": "Grocery Stores & Supermarkets",
  "5541": "Service Stations (Fuel)",
  "5812": "Eating Places & Restaurants",
  "5813": "Bars & Lounges",
  "5921": "Package / Liquor Stores",
  "7011": "Lodging & Hotels",
  "7995": "Betting & Casino Gaming",
  "7832": "Movie Theaters",
  "5999": "Miscellaneous Retail",
};

/* Categories that are hard-blocked for every card, every budget code.
 * These never reach a per-code allowlist check. */
const GLOBAL_BLOCK = ["5921", "5813", "7995", "7832"];

/* ------------------------------------------------------------------ *
 * Chart of accounts — the dimensions a budget code resolves to.
 * Modeled on the Maine DOE handbook's Fund / Location / Function / Object
 * structure. A CivicChain "budget code" is the human label; it maps 1:1 to a
 * full chart-of-accounts string so board reporting is a query, not re-coding.
 * ------------------------------------------------------------------ */
const FUNCTIONS = {
  "1000": "Instruction",
  "2120": "Guidance Services",
  "2220": "Library & Media",
  "2600": "Operation & Maintenance of Plant",
  "2700": "Student Transportation",
  "3100": "Food Service Operations",
};
const OBJECTS = {
  "0430": "Repairs & Maintenance Services",
  "0510": "Student Transportation Purchased Svcs",
  "0610": "General Supplies",
  "0626": "Vehicle Fuel & Lubricants",
  "0640": "Books & Periodicals",
  "0650": "Technology Supplies & Software",
  "0734": "Technology-Related Equipment",
};

/* ------------------------------------------------------------------ *
 * Reusable allowlist presets. A budget code points at one preset; the preset
 * is the set of MCCs that may authorize on any card bound to that code.
 * ------------------------------------------------------------------ */
const ALLOWLIST = {
  instructionalSupplies: ["5111", "5943", "5942", "5045", "5734", "8299"],
  library: ["5942", "5943", "8299", "5111"],
  technology: ["5045", "5734", "5943", "5111"],
  facilities: ["5200", "5211", "5111", "5943"],
  transportationFuel: ["5541"],
  foodService: ["5411", "5943"],
};

/* ------------------------------------------------------------------ *
 * District archetypes. The profile selector swaps the whole dataset so the
 * same product reads for any district, and demonstrates the legal-entity
 * structure question directly:
 *   - A Regional unit (RSU/SAD) is its own legal entity → its own
 *     Modern Treasury customer, funds in a pooled FBO account at the
 *     partner bank, one sub-account per budget code.
 *   - A Municipal school unit is part of the town → it sits UNDER the
 *     town's Modern Treasury customer, with school budget codes as
 *     sub-accounts of the town's account.
 * ------------------------------------------------------------------ */

function code(id, label, fund, location, fn, object, allowlist, pool, spent) {
  return {
    id,
    label,
    fund,
    location,
    function: fn,
    object,
    allowlist,
    coaString: `${fund}-${location}-${fn}-${object}`,
    poolFunded: pool,
    poolSpent: spent,
    get poolRemaining() {
      return this.poolFunded - this.poolSpent;
    },
  };
}

const PROFILES = {
  rsu: {
    id: "rsu",
    name: "Pinebrook Regional School Unit",
    shortName: "Pinebrook RSU",
    archetype: "Regional unit (RSU / SAD)",
    entity:
      "Own legal entity. Onboarded as its own CivicChain / Modern Treasury customer; " +
      "funds sit in a pooled For-Benefit-Of account at the partner bank with one " +
      "ledger sub-account per budget code.",
    enrollment: 2480,
    buildings: ["Pinebrook High School", "Riverside Elementary", "District Office"],
    budgetCodes: [
      code("hs-sci", "HS Science — Supplies", "1000", "HS", "1000", "0610", "instructionalSupplies", 14000, 9120),
      code("hs-tech", "HS Technology", "1000", "HS", "1000", "0650", "technology", 22000, 18650),
      code("el-lib", "Riverside Library & Media", "1000", "EL", "2220", "0640", "library", 6500, 2240),
      code("el-sup", "Riverside Classroom Supplies", "1000", "EL", "1000", "0610", "instructionalSupplies", 9000, 8730),
      code("fac-om", "Facilities — O&M", "1000", "DW", "2600", "0430", "facilities", 18000, 7400),
      code("trans-fuel", "Transportation — Fuel", "1000", "DW", "2700", "0626", "transportationFuel", 12000, 9850),
      code("food", "Food Service", "1000", "DW", "3100", "0610", "foodService", 8000, 3110),
    ],
  },

  municipal: {
    id: "municipal",
    name: "Town of Alder Falls — School Department",
    shortName: "Alder Falls Schools",
    archetype: "Municipal school unit (part of the town)",
    entity:
      "Part of the municipality. Does NOT hold its own account; it sits under the " +
      "Town of Alder Falls' CivicChain / Modern Treasury customer, with school " +
      "budget codes as sub-accounts of the town's ledger account.",
    enrollment: 940,
    buildings: ["Alder Falls K-8 School", "Town Office (Schools)"],
    budgetCodes: [
      code("k8-sup", "K-8 Classroom Supplies", "1000", "K8", "1000", "0610", "instructionalSupplies", 11000, 6420),
      code("k8-lib", "K-8 Library & Media", "1000", "K8", "2220", "0640", "library", 4000, 1180),
      code("k8-tech", "K-8 Technology", "1000", "K8", "1000", "0650", "technology", 9000, 8640),
      code("k8-fac", "Facilities — O&M", "1000", "K8", "2600", "0430", "facilities", 7500, 2960),
      code("k8-food", "Food Service", "1000", "K8", "3100", "0610", "foodService", 5000, 1870),
    ],
  },

  sad: {
    id: "sad",
    name: "School Administrative District 7",
    shortName: "SAD 7",
    archetype: "Regional unit (RSU / SAD)",
    entity:
      "Own legal entity spanning several towns. Onboarded as its own CivicChain / " +
      "Modern Treasury customer; each member town's school costs ride the same " +
      "pooled FBO account, separated by budget-code sub-account.",
    enrollment: 1610,
    buildings: ["SAD 7 Junior-Senior High", "Lakeview Elementary", "Central Office"],
    budgetCodes: [
      code("jsh-sup", "Jr-Sr HS Supplies", "1000", "JS", "1000", "0610", "instructionalSupplies", 12500, 5600),
      code("jsh-guid", "Jr-Sr HS Guidance", "1000", "JS", "2120", "0610", "instructionalSupplies", 3500, 900),
      code("lv-sup", "Lakeview Supplies", "1000", "LV", "1000", "0610", "instructionalSupplies", 8500, 7990),
      code("lv-lib", "Lakeview Library", "1000", "LV", "2220", "0640", "library", 3000, 640),
      code("sad-fac", "Facilities — O&M", "1000", "DW", "2600", "0430", "facilities", 15000, 6100),
      code("sad-trans", "Transportation — Fuel", "1000", "DW", "2700", "0626", "transportationFuel", 14000, 11200),
    ],
  },
};

/* Friendly labels for location segments used in COA strings. */
const LOCATIONS = {
  HS: "Pinebrook High School",
  EL: "Riverside Elementary",
  K8: "Alder Falls K-8 School",
  JS: "SAD 7 Junior-Senior High",
  LV: "Lakeview Elementary",
  DW: "District-wide",
};

/* ------------------------------------------------------------------ *
 * Cards. Three tiers, each BOUND TO A BUDGET CODE (not to a person).
 *   District  — broad, held by the business office
 *   Building  — scoped to one building's budget code
 *   Individual— a single cardholder drawing on one code
 * budgetCodeId references a code in the active profile. Cards whose code is
 * not in the active profile are simply filtered out at render time.
 * ------------------------------------------------------------------ */
const CARDS = [
  // Pinebrook RSU
  { id: "c-1041", tier: "District", holder: "Business Office", last4: "1041", budgetCodeId: "fac-om", profile: "rsu" },
  { id: "c-2277", tier: "Building", holder: "Pinebrook HS — Main Office", last4: "2277", budgetCodeId: "hs-sci", profile: "rsu" },
  { id: "c-2290", tier: "Building", holder: "Pinebrook HS — IT", last4: "2290", budgetCodeId: "hs-tech", profile: "rsu" },
  { id: "c-3312", tier: "Individual", holder: "Riverside — Librarian", last4: "3312", budgetCodeId: "el-lib", profile: "rsu" },
  { id: "c-3340", tier: "Individual", holder: "Riverside — Gr. 3 Teacher", last4: "3340", budgetCodeId: "el-sup", profile: "rsu" },
  { id: "c-4408", tier: "Building", holder: "Transportation Dept.", last4: "4408", budgetCodeId: "trans-fuel", profile: "rsu" },
  { id: "c-4461", tier: "Building", holder: "Food Service Director", last4: "4461", budgetCodeId: "food", profile: "rsu" },

  // Alder Falls (municipal)
  { id: "m-5501", tier: "Building", holder: "Alder Falls K-8 — Office", last4: "5501", budgetCodeId: "k8-sup", profile: "municipal" },
  { id: "m-5520", tier: "Individual", holder: "K-8 — Librarian", last4: "5520", budgetCodeId: "k8-lib", profile: "municipal" },
  { id: "m-5533", tier: "Building", holder: "K-8 — IT", last4: "5533", budgetCodeId: "k8-tech", profile: "municipal" },
  { id: "m-5544", tier: "District", holder: "Facilities Lead", last4: "5544", budgetCodeId: "k8-fac", profile: "municipal" },
  { id: "m-5560", tier: "Building", holder: "K-8 Food Service", last4: "5560", budgetCodeId: "k8-food", profile: "municipal" },

  // SAD 7
  { id: "s-6601", tier: "Building", holder: "Jr-Sr HS — Office", last4: "6601", budgetCodeId: "jsh-sup", profile: "sad" },
  { id: "s-6620", tier: "Individual", holder: "Jr-Sr HS — Counselor", last4: "6620", budgetCodeId: "jsh-guid", profile: "sad" },
  { id: "s-6633", tier: "Building", holder: "Lakeview — Office", last4: "6633", budgetCodeId: "lv-sup", profile: "sad" },
  { id: "s-6644", tier: "Individual", holder: "Lakeview — Librarian", last4: "6644", budgetCodeId: "lv-lib", profile: "sad" },
  { id: "s-6655", tier: "District", holder: "Facilities Lead", last4: "6655", budgetCodeId: "sad-fac", profile: "sad" },
  { id: "s-6677", tier: "Building", holder: "Transportation Dept.", last4: "6677", budgetCodeId: "sad-trans", profile: "sad" },
];

/* ------------------------------------------------------------------ *
 * Sample merchants for the authorization simulator. Each carries an MCC so the
 * webhook can decide approve / decline against the card's budget-code allowlist.
 * ------------------------------------------------------------------ */
const MERCHANTS = [
  { name: "Quill Office Supply", mcc: "5111" },
  { name: "Scholastic Book Fairs", mcc: "5942" },
  { name: "CDW-G (Ed Tech)", mcc: "5045" },
  { name: "Adobe (Software)", mcc: "5734" },
  { name: "Hannaford Supermarket", mcc: "5411" },
  { name: "Aubuchon Hardware", mcc: "5200" },
  { name: "Irving Fuel Station", mcc: "5541" },
  { name: "The Corner Diner", mcc: "5812" },
  { name: "Harborview Hotel", mcc: "7011" },
  { name: "State Line Liquors", mcc: "5921" },
  { name: "Amazon (Misc Retail)", mcc: "5999" },
  { name: "Riverbend Educational Svcs", mcc: "8299" },
];

/* ------------------------------------------------------------------ *
 * Seed ledger. Settled, redacted public records across recent dates. The
 * ledger writer appends to this at settlement. Each record carries NO
 * cardholder identity — only merchant category, amount, budget code, building,
 * date, and a running hash (modeled tamper-evidence).
 * ------------------------------------------------------------------ */
const SEED_TXNS = [
  // profile, date, budgetCodeId, mcc, merchantMasked, amount, building, receipt?
  ["rsu", "2026-09-08", "hs-sci", "5111", "Office supply vendor", 212.4, "Pinebrook High School", true],
  ["rsu", "2026-09-11", "hs-tech", "5045", "Ed-tech hardware vendor", 1890.0, "Pinebrook High School", true],
  ["rsu", "2026-09-15", "el-lib", "5942", "Book vendor", 340.18, "Riverside Elementary", true],
  ["rsu", "2026-09-19", "el-sup", "5111", "Office supply vendor", 96.75, "Riverside Elementary", false],
  ["rsu", "2026-09-22", "fac-om", "5200", "Hardware vendor", 1204.9, "District-wide", true],
  ["rsu", "2026-09-26", "trans-fuel", "5541", "Fuel station", 742.0, "District-wide", true],
  ["rsu", "2026-10-02", "food", "5411", "Grocery / supermarket", 410.33, "District-wide", true],
  ["rsu", "2026-10-06", "hs-tech", "5734", "Software vendor", 599.0, "Pinebrook High School", false],
  ["rsu", "2026-10-09", "hs-sci", "5942", "Book vendor", 128.5, "Pinebrook High School", true],
  ["rsu", "2026-10-13", "fac-om", "5211", "Building materials vendor", 2210.6, "District-wide", true],

  ["municipal", "2026-09-10", "k8-sup", "5111", "Office supply vendor", 184.2, "Alder Falls K-8 School", true],
  ["municipal", "2026-09-17", "k8-tech", "5045", "Ed-tech hardware vendor", 2140.0, "Alder Falls K-8 School", true],
  ["municipal", "2026-09-24", "k8-lib", "5942", "Book vendor", 211.9, "Alder Falls K-8 School", false],
  ["municipal", "2026-10-01", "k8-fac", "5200", "Hardware vendor", 560.45, "Alder Falls K-8 School", true],
  ["municipal", "2026-10-08", "k8-food", "5411", "Grocery / supermarket", 302.1, "Alder Falls K-8 School", true],

  ["sad", "2026-09-09", "jsh-sup", "5111", "Office supply vendor", 150.0, "SAD 7 Junior-Senior High", true],
  ["sad", "2026-09-16", "lv-sup", "5943", "School supply store", 240.75, "Lakeview Elementary", true],
  ["sad", "2026-09-23", "sad-trans", "5541", "Fuel station", 980.0, "District-wide", true],
  ["sad", "2026-09-30", "lv-lib", "5942", "Book vendor", 175.4, "Lakeview Elementary", false],
  ["sad", "2026-10-07", "sad-fac", "5200", "Hardware vendor", 1320.0, "District-wide", true],
];

/* Expose for app.js (plain globals; no bundler in this standalone demo). */
window.CC_DATA = {
  MCC,
  GLOBAL_BLOCK,
  FUNCTIONS,
  OBJECTS,
  ALLOWLIST,
  PROFILES,
  LOCATIONS,
  CARDS,
  MERCHANTS,
  SEED_TXNS,
};
