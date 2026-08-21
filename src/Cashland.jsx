import React, { useState, useMemo } from "react";

// ---------------------------------------------------------------------------
// CASHLAND — remittance corridor comparator
// Shows true LANDED KES across providers for a given send amount + currency.
// Rates/fees below are SAMPLE data — wire up a live FX feed + real provider
// fee sheets before shipping. Structure is built so that's a drop-in swap.
// ---------------------------------------------------------------------------

const CORRIDORS = [
  {
    region: "North America",
    currencies: [
      { code: "USD", label: "US Dollar", rate: 129.4 },
      { code: "CAD", label: "Canadian Dollar", rate: 93.8 },
    ],
  },
  {
    region: "Europe",
    currencies: [
      { code: "GBP", label: "British Pound", rate: 163.2 },
      { code: "EUR", label: "Euro", rate: 139.6 },
      { code: "CHF", label: "Swiss Franc", rate: 148.9 },
      { code: "SEK", label: "Swedish Krona", rate: 12.1 },
      { code: "NOK", label: "Norwegian Krone", rate: 11.7 },
      { code: "DKK", label: "Danish Krone", rate: 18.7 },
    ],
  },
  {
    region: "Middle East",
    currencies: [
      { code: "AED", label: "UAE Dirham", rate: 35.2 },
      { code: "SAR", label: "Saudi Riyal", rate: 34.5 },
      { code: "QAR", label: "Qatari Riyal", rate: 35.6 },
      { code: "KWD", label: "Kuwaiti Dinar", rate: 421.3 },
      { code: "BHD", label: "Bahraini Dinar", rate: 343.6 },
      { code: "OMR", label: "Omani Rial", rate: 336.4 },
    ],
  },
  {
    region: "Africa",
    currencies: [
      { code: "UGX", label: "Ugandan Shilling", rate: 0.0345 },
      { code: "TZS", label: "Tanzanian Shilling", rate: 0.0497 },
      { code: "RWF", label: "Rwandan Franc", rate: 0.0908 },
      { code: "ETB", label: "Ethiopian Birr", rate: 1.02 },
      { code: "ZAR", label: "South African Rand", rate: 7.28 },
      { code: "GHS", label: "Ghanaian Cedi", rate: 8.61 },
      { code: "NGN", label: "Nigerian Naira", rate: 0.0821 },
      { code: "XOF", label: "West African CFA Franc", rate: 0.213 },
      { code: "XAF", label: "Central African CFA Franc", rate: 0.213 },
      { code: "EGP", label: "Egyptian Pound", rate: 2.68 },
    ],
  },
  {
    region: "Asia-Pacific",
    currencies: [
      { code: "AUD", label: "Australian Dollar", rate: 84.6 },
      { code: "NZD", label: "New Zealand Dollar", rate: 78.1 },
      { code: "INR", label: "Indian Rupee", rate: 1.54 },
      { code: "CNY", label: "Chinese Yuan", rate: 18.0 },
      { code: "JPY", label: "Japanese Yen", rate: 0.876 },
      { code: "SGD", label: "Singapore Dollar", rate: 96.3 },
      { code: "HKD", label: "Hong Kong Dollar", rate: 16.6 },
      { code: "MYR", label: "Malaysian Ringgit", rate: 29.4 },
    ],
  },
  {
    region: "Other",
    currencies: [
      { code: "AUD2", label: "— reserved —", rate: 0, hidden: true },
    ],
  },
];

// flatten to 30 real currencies (drop the placeholder)
const ALL_CURRENCIES = CORRIDORS.flatMap((c) =>
  c.currencies.filter((cur) => !cur.hidden).map((cur) => ({ ...cur, region: c.region }))
);

// Fee + FX-margin figures below are wired from published/third-party-verified
// 2026 pricing structure for the US/UK/EU -> Kenya corridor (Wise, paybillke,
// Monito, transfer.co.ke, firstcard.app). Real pricing varies by exact
// corridor, funding method, and amount tier — treat these as realistic
// mid-2026 defaults, not a binding quote. Update PROVIDERS as pricing shifts.
const PROVIDERS = [
  {
    name: "Wise",
    feePct: 0.45,
    flatFeeUSD: 1.0,
    fxMarginPct: 0.4,
    note: "Mid-market FX, tightest margin. Wins on larger sends.",
  },
  {
    name: "Sendwave",
    feePct: 0,
    flatFeeUSD: 0,
    fxMarginPct: 1.5,
    note: "Zero flat fee. Wins on small sends under ~$200.",
  },
  {
    name: "TapTap Send",
    feePct: 0,
    flatFeeUSD: 0,
    fxMarginPct: 1.2,
    note: "Zero flat fee, strong EU coverage.",
  },
  {
    name: "LemFi",
    feePct: 0,
    flatFeeUSD: 0,
    fxMarginPct: 1.3,
    note: "Strong UK/Canada pricing, sometimes beats Wise on small GBP sends.",
  },
  {
    name: "Remitly (Express)",
    feePct: 0,
    flatFeeUSD: 3.99,
    fxMarginPct: 1.0,
    note: "Faster delivery, small fee, tighter margin than Economy.",
  },
  {
    name: "Remitly (Economy)",
    feePct: 0,
    flatFeeUSD: 0,
    fxMarginPct: 1.8,
    note: "No fee, but margin is the real cost. 1–2 day delivery.",
  },
  {
    name: "WorldRemit",
    feePct: 0,
    flatFeeUSD: 2.99,
    fxMarginPct: 2.0,
    note: "Broadest payout coverage (bank, cash, wallet, airtime).",
  },
  {
    name: "Western Union",
    feePct: 0,
    flatFeeUSD: 4.99,
    fxMarginPct: 2.5,
    note: "Online rate — agent cash pickup costs more.",
  },
  {
    name: "MoneyGram",
    feePct: 0,
    flatFeeUSD: 5.0,
    fxMarginPct: 2.0,
    note: "Fee varies $0–12 by funding method; online bank is cheapest.",
  },
  {
    name: "Xoom (PayPal)",
    feePct: 0,
    flatFeeUSD: 4.99,
    fxMarginPct: 3.3,
    note: "FX margin is the dominant cost — structurally expensive.",
  },
];

// crude USD-equivalent conversion for flat fees quoted in USD, using the
// selected currency's own rate vs a rough USD/KES anchor (129.4)
const USD_KES_ANCHOR = 129.4;

function computeLanded(provider, sendAmount, kesRate) {
  const flatFeeInSourceCcy = (provider.flatFeeUSD * USD_KES_ANCHOR) / kesRate;
  const afterPctFee = sendAmount * (1 - provider.feePct / 100);
  const afterFlatFee = Math.max(afterPctFee - flatFeeInSourceCcy, 0);
  const effectiveRate = kesRate * (1 - provider.fxMarginPct / 100);
  const landedKES = afterFlatFee * effectiveRate;
  const totalCostKES = sendAmount * kesRate - landedKES;
  return { landedKES, totalCostKES, effectiveRate };
}

export default function Cashland() {
  const [amount, setAmount] = useState(500);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [search, setSearch] = useState("");
  const [rateOverride, setRateOverride] = useState(null);
  const [liveRates, setLiveRates] = useState(null); // { USD: kesPerUsd, ... }
  const [liveStatus, setLiveStatus] = useState("idle"); // idle | loading | ok | error
  const [lastUpdated, setLastUpdated] = useState(null);

  async function fetchLiveRates() {
    setLiveStatus("loading");
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/KES");
      const data = await res.json();
      if (data.result !== "success" || !data.rates) throw new Error("bad payload");
      // API gives KES -> X, invert to get "1 unit of X = ? KES"
      const inverted = {};
      Object.entries(data.rates).forEach(([code, kesPerUnit]) => {
        if (kesPerUnit > 0) inverted[code] = 1 / kesPerUnit;
      });
      setLiveRates(inverted);
      setLastUpdated(data.time_last_update_utc || new Date().toUTCString());
      setLiveStatus("ok");
    } catch (err) {
      setLiveStatus("error");
    }
  }

  React.useEffect(() => {
    fetchLiveRates();
  }, []);

  const currency = ALL_CURRENCIES.find((c) => c.code === currencyCode);
  const liveRateForCurrency = liveRates?.[currencyCode];
  const baseRate = liveRateForCurrency ?? currency.rate;
  const kesRate = rateOverride ?? baseRate;

  const filteredCurrencies = useMemo(() => {
    if (!search.trim()) return CORRIDORS;
    const q = search.trim().toLowerCase();
    return CORRIDORS.map((region) => ({
      ...region,
      currencies: region.currencies.filter(
        (c) =>
          !c.hidden &&
          (c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
      ),
    })).filter((r) => r.currencies.length > 0);
  }, [search]);

  const results = useMemo(() => {
    const rows = PROVIDERS.map((p) => ({
      ...p,
      ...computeLanded(p, Number(amount) || 0, kesRate),
    }));
    rows.sort((a, b) => b.landedKES - a.landedKES);
    return rows;
  }, [amount, kesRate]);

  const best = results[0];
  const worst = results[results.length - 1];
  const spread = best && worst ? best.landedKES - worst.landedKES : 0;

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
        .cl-select-scroll::-webkit-scrollbar { width: 6px; }
        .cl-select-scroll::-webkit-scrollbar-thumb { background: #2A3348; border-radius: 4px; }
        .cl-row:hover { background: #171E2E; }
        @media (max-width: 720px) {
          .cl-hero-grid { grid-template-columns: 1fr !important; }
          .cl-table-fee, .cl-table-rate { display: none !important; }
        }
      `}</style>

      {/* HERO */}
      <header style={styles.hero}>
        <div style={styles.heroTop}>
          <div style={styles.wordmark}>
            <span style={{ color: "#E8B84B" }}>CASH</span>
            <span style={{ color: "#F3F1E9" }}>LAND</span>
          </div>
          <div style={styles.tagline}>true landed KES, corridor by corridor</div>
        </div>

        <div className="cl-hero-grid" style={styles.heroGrid}>
          {/* send amount */}
          <div style={styles.card}>
            <label style={styles.label}>You send</label>
            <div style={styles.amountRow}>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={styles.amountInput}
              />
              <div style={styles.ccyBadge}>{currency.code}</div>
            </div>

            <label style={{ ...styles.label, marginTop: 18 }}>From currency</label>
            <input
              type="text"
              placeholder="Search currency or region…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
            <div className="cl-select-scroll" style={styles.currencyList}>
              {filteredCurrencies.map((region) => (
                <div key={region.region}>
                  <div style={styles.regionLabel}>{region.region}</div>
                  <div style={styles.ccyGrid}>
                    {region.currencies.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => {
                          setCurrencyCode(c.code);
                          setRateOverride(null);
                        }}
                        title={c.label}
                        style={{
                          ...styles.ccyChip,
                          ...(c.code === currencyCode ? styles.ccyChipActive : {}),
                        }}
                      >
                        {c.code}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* corridor / rate summary */}
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ ...styles.label, marginBottom: 0 }}>Mid-market reference rate</label>
              <button onClick={fetchLiveRates} style={styles.refreshBtn} title="Refresh live rate">
                ⟳ {liveStatus === "loading" ? "syncing…" : "refresh"}
              </button>
            </div>
            <div style={{ ...styles.rateRow, marginTop: 8 }}>
              <span style={styles.rateMono}>1 {currency.code} =</span>
              <input
                type="number"
                step="0.0001"
                value={kesRate}
                onChange={(e) => setRateOverride(Number(e.target.value))}
                style={styles.rateInput}
              />
              <span style={styles.rateMono}>KES</span>
            </div>
            <div style={styles.helperText}>
              {liveStatus === "ok" && liveRateForCurrency && !rateOverride && (
                <>
                  <span style={{ color: "#3ECF8E" }}>● live</span> via exchangerate-api.com
                  {lastUpdated ? ` · updated ${lastUpdated}` : ""}
                </>
              )}
              {liveStatus === "ok" && !liveRateForCurrency && !rateOverride && (
                <>
                  <span style={{ color: "#E8B84B" }}>● fallback</span> — {currency.code} not in the live feed, using sample rate
                </>
              )}
              {liveStatus === "error" && !rateOverride && (
                <>
                  <span style={{ color: "#E8836A" }}>● offline</span> — live feed unreachable, using sample rate
                </>
              )}
              {liveStatus === "loading" && "fetching live rate…"}
              {rateOverride !== null && (
                <>
                  <span style={{ color: "#8B93A7" }}>● manual override</span>
                  {" · "}
                  <button
                    onClick={() => setRateOverride(null)}
                    style={styles.linkBtn}
                  >
                    reset to live rate
                  </button>
                </>
              )}
            </div>

            <div style={styles.divider} />

            <div style={styles.statBlock}>
              <div style={styles.statLabel}>Best landed amount</div>
              <div style={styles.statValueBig}>
                KES {best ? best.landedKES.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
              </div>
              <div style={styles.statSub}>via {best?.name}</div>
            </div>

            <div style={styles.statBlock}>
              <div style={styles.statLabel}>Spread vs. worst option</div>
              <div style={styles.statValueSm}>
                KES {spread.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
              </div>
              <div style={styles.statSub}>what picking right is worth</div>
            </div>
          </div>
        </div>
      </header>

      {/* RESULTS */}
      <main style={styles.main}>
        <div style={styles.sectionHeadRow}>
          <div style={styles.sectionHead}>Providers, ranked by landed KES</div>
          <div style={styles.sectionSub}>
            {currency.code} {Number(amount || 0).toLocaleString()} → Kenya
          </div>
        </div>

        <div style={styles.table}>
          <div style={{ ...styles.tRow, ...styles.tHead }}>
            <div style={styles.tRank}>#</div>
            <div style={styles.tName}>Provider</div>
            <div className="cl-table-fee" style={styles.tCol}>Fee</div>
            <div className="cl-table-rate" style={styles.tCol}>Effective rate</div>
            <div style={styles.tCol}>Total cost</div>
            <div style={styles.tLanded}>Landed KES</div>
          </div>

          {results.map((r, i) => (
            <div className="cl-row" key={r.name} style={styles.tRow}>
              <div style={styles.tRank}>{i + 1}</div>
              <div style={styles.tName}>
                <div>
                  {r.name}
                  {i === 0 && <span style={styles.bestBadge}>BEST</span>}
                </div>
                <div className="cl-table-fee" style={styles.tNote}>{r.note}</div>
              </div>
              <div className="cl-table-fee" style={styles.tCol}>
                {r.feePct > 0 ? `${r.feePct}%` : ""}
                {r.flatFeeUSD > 0 ? ` +$${r.flatFeeUSD.toFixed(2)}` : ""}
                {r.feePct === 0 && r.flatFeeUSD === 0 ? "—" : ""}
              </div>
              <div className="cl-table-rate" style={styles.tCol}>
                {r.effectiveRate.toFixed(3)}
              </div>
              <div style={styles.tCol}>
                KES {r.totalCostKES.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
              </div>
              <div style={styles.tLanded}>
                KES {r.landedKES.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
              </div>
            </div>
          ))}
        </div>

        <footer style={styles.footer}>
          Mid-market rates from exchangerate-api.com (updated daily, free tier — override manually if you need a fresher print).
          Provider fee and FX-margin figures reflect published mid-2026 pricing structure for the diaspora → Kenya corridor;
          actual pricing varies by exact corridor, funding method, and amount tier. Verify on the provider's own quote page
          before a live send. Built for the Kenyan diaspora corridor.
        </footer>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0F1420",
    color: "#F3F1E9",
    fontFamily: "'Inter', sans-serif",
  },
  hero: {
    background: "linear-gradient(180deg, #131A2A 0%, #0F1420 100%)",
    borderBottom: "1px solid #232C42",
    padding: "36px 24px 40px",
  },
  heroTop: {
    maxWidth: 1040,
    margin: "0 auto 28px",
    display: "flex",
    alignItems: "baseline",
    gap: 14,
    flexWrap: "wrap",
  },
  wordmark: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 30,
    letterSpacing: "-0.02em",
  },
  tagline: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "#8B93A7",
    letterSpacing: "0.02em",
  },
  heroGrid: {
    maxWidth: 1040,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1.3fr 1fr",
    gap: 18,
  },
  card: {
    background: "#171E2E",
    border: "1px solid #232C42",
    borderRadius: 14,
    padding: 22,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "#8B93A7",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 8,
  },
  amountRow: { display: "flex", alignItems: "center", gap: 10 },
  amountInput: {
    flex: 1,
    background: "#0F1420",
    border: "1px solid #2A3348",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#F3F1E9",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 22,
    fontWeight: 500,
    outline: "none",
  },
  ccyBadge: {
    background: "#E8B84B",
    color: "#0F1420",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 14,
    padding: "10px 14px",
    borderRadius: 10,
  },
  searchInput: {
    width: "100%",
    background: "#0F1420",
    border: "1px solid #2A3348",
    borderRadius: 10,
    padding: "9px 12px",
    color: "#F3F1E9",
    fontSize: 13,
    outline: "none",
    marginBottom: 10,
  },
  currencyList: {
    maxHeight: 220,
    overflowY: "auto",
    paddingRight: 4,
  },
  regionLabel: {
    fontSize: 10,
    color: "#5C6478",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: 10,
    marginBottom: 6,
    fontWeight: 600,
  },
  ccyGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  ccyChip: {
    background: "#0F1420",
    border: "1px solid #2A3348",
    color: "#C7CCDA",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: "'IBM Plex Mono', monospace",
    cursor: "pointer",
  },
  ccyChipActive: {
    background: "#E8B84B",
    borderColor: "#E8B84B",
    color: "#0F1420",
    fontWeight: 700,
  },
  rateRow: { display: "flex", alignItems: "center", gap: 8 },
  rateMono: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "#8B93A7",
  },
  rateInput: {
    flex: 1,
    background: "#0F1420",
    border: "1px solid #2A3348",
    borderRadius: 8,
    padding: "8px 10px",
    color: "#F3F1E9",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14,
    outline: "none",
  },
  helperText: {
    fontSize: 11,
    color: "#5C6478",
    marginTop: 6,
  },
  divider: {
    height: 1,
    background: "#232C42",
    margin: "18px 0",
  },
  statBlock: { marginBottom: 16 },
  statLabel: {
    fontSize: 11,
    color: "#8B93A7",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 4,
  },
  statValueBig: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: "#3ECF8E",
  },
  statValueSm: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 18,
    fontWeight: 600,
    color: "#F3F1E9",
  },
  statSub: { fontSize: 12, color: "#5C6478", marginTop: 2 },
  main: { maxWidth: 1040, margin: "0 auto", padding: "32px 24px 60px" },
  sectionHeadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 14,
    flexWrap: "wrap",
    gap: 8,
  },
  sectionHead: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 600,
    fontSize: 18,
  },
  sectionSub: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "#8B93A7",
  },
  table: {
    border: "1px solid #232C42",
    borderRadius: 14,
    overflow: "hidden",
  },
  tRow: {
    display: "grid",
    gridTemplateColumns: "40px 1.4fr 1fr 1fr 1fr 1.2fr",
    alignItems: "center",
    padding: "13px 16px",
    borderBottom: "1px solid #1B2233",
  },
  tHead: {
    background: "#171E2E",
    fontSize: 11,
    color: "#8B93A7",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 600,
  },
  tRank: { fontFamily: "'IBM Plex Mono', monospace", color: "#5C6478", fontSize: 13 },
  tName: { fontWeight: 600, fontSize: 14 },
  tNote: { fontWeight: 400, fontSize: 11, color: "#5C6478", marginTop: 2, maxWidth: 260 },
  refreshBtn: {
    background: "transparent",
    border: "1px solid #2A3348",
    color: "#8B93A7",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    cursor: "pointer",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#E8B84B",
    fontSize: 11,
    textDecoration: "underline",
    cursor: "pointer",
    padding: 0,
    fontFamily: "'Inter', sans-serif",
  },
  bestBadge: {
    background: "rgba(62,207,142,0.15)",
    color: "#3ECF8E",
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    letterSpacing: "0.04em",
    marginLeft: 8,
  },
  tCol: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "#C7CCDA",
  },
  tLanded: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14,
    fontWeight: 700,
    color: "#3ECF8E",
    textAlign: "right",
  },
  footer: {
    marginTop: 22,
    fontSize: 11,
    color: "#5C6478",
    lineHeight: 1.6,
  },
};
