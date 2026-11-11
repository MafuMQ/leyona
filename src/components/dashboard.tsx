"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Flame,
  Globe,
  Layers3,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import type { Market } from "@/lib/fixtures";
import { amount } from "@/lib/money";
type Position = {
  market_id: string;
  question: string;
  outcome: string;
  available: string;
  reserved: string;
  cost: string;
  realized: string;
  yes_price: number;
  status: string;
};
type Order = {
  id: string;
  question: string;
  market_id: string;
  outcome: string;
  side: string;
  price: number;
  quantity: number;
  remaining: number;
  state: string;
};
type Combo = {
  id: string;
  legs: Leg[];
  stake: string;
  payout: string;
  state: string;
};
type Activity = {
  id: string;
  description: string;
  kind: string;
  created_at: string;
  amount: string;
};
type Portfolio = {
  balance: string;
  reserved: string;
  issued: string;
  positions: Position[];
  orders: Order[];
  combos: Combo[];
  activity: Activity[];
};
type State = {
  mode: string;
  notice: string | null;
  markets: Market[];
  user: { id: string; name: string; email: string; role: string } | null;
  portfolio: Portfolio | null;
  watchlist: string[];
};
type Leg = { marketId: string; outcome: "yes" | "no" };
type Detail = {
  book: { outcome: string; side: string; price: number; quantity: string }[];
  trades: {
    outcome: string;
    price: number;
    quantity: number;
    created_at: string;
  }[];
  comments: { id: string; name: string; body: string; created_at: string }[];
};
type Quote = { id: string; payout: string; stake: string; expires_at: string };
const categories = [
  "All",
  "Politics",
  "Sports",
  "Crypto",
  "Tech",
  "Economy",
  "Science",
  "Culture",
  "Weather",
];
const display = (value: string | bigint | undefined) =>
  new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 }).format(
    Number(amount(value ?? "0")),
  );
const probability = (n: number) => `${(n / 100).toFixed(n % 100 ? 1 : 0)}%`;
export default function Dashboard() {
  const [state, setState] = useState<State | null>(null),
    [page, setPage] = useState("Markets"),
    [category, setCategory] = useState("All"),
    [filter, setFilter] = useState("Trending"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("volume");
  const [selected, setSelected] = useState<Market | null>(null),
    [outcome, setOutcome] = useState<"yes" | "no">("yes"),
    [side, setSide] = useState<"buy" | "sell">("buy"),
    [kind, setKind] = useState("market"),
    [quantity, setQuantity] = useState("10"),
    [limit, setLimit] = useState("50"),
    [tif, setTif] = useState("GTC"),
    [details, setDetails] = useState<Detail | null>(null),
    [detailTab, setDetailTab] = useState("Order book"),
    [comment, setComment] = useState("");
  const [modal, setModal] = useState<"auth" | "credits" | null>(null),
    [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [credits, setCredits] = useState("1000");
  const [legs, setLegs] = useState<Leg[]>([]),
    [stake, setStake] = useState("10"),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [now, setNow] = useState(Date.now());
  const [adminEvidence, setAdminEvidence] = useState(""),
    [adminResult, setAdminResult] = useState("yes"),
    [disputes, setDisputes] = useState<
      { id: string; question: string; name: string; evidence: string }[]
    >([]);
  const pendingKeys = useRef(new Map<string, string>());
  const notify = (text: string, error = false) => setToast({ text, error });
  const load = useCallback(async () => {
    const response = await fetch("/api/state");
    if (!response.ok) throw new Error("Unable to load the platform.");
    const next = await response.json();
    setState(next);
  }, []);
  useEffect(() => {
    void load().catch((e) => setToast({ text: e.message, error: true }));
    const timer = setInterval(() => void load().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!modal && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ),
      );
    focusables()[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modal) setModal(null);
        else setSelected(null);
      }
      if (e.key === "Tab") {
        const nodes = focusables(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modal, selected?.id]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Search markets"]')
          ?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    if (!selected || state?.mode !== "connected") return;
    let active = true;
    const refresh = () =>
      fetch(`/api/markets/${selected.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (active && !data.error) setDetails(data);
        })
        .catch(() => {});
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected?.id, state?.mode]);
  useEffect(() => {
    if (page === "Admin" && state?.user?.role === "admin")
      void fetch("/api/admin/disputes")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setDisputes(d);
        });
  }, [page, state?.user?.role]);
  async function call(path: string, body: unknown = {}, success?: string) {
    setBusy(true);
    const payload = JSON.stringify(body),
      fingerprint = path + payload;
    const requestKey =
      pendingKeys.current.get(fingerprint) ?? crypto.randomUUID();
    pendingKeys.current.set(fingerprint, requestKey);
    try {
      const response = await fetch(`/api/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: payload,
      });
      const data = await response.json();
      pendingKeys.current.delete(fingerprint);
      if (!response.ok) throw new Error(data.error ?? "Request failed.");
      await load().catch(() =>
        notify("Action saved. Refresh to update your balance."),
      );
      if (success) notify(success);
      return data;
    } catch (e) {
      notify((e as Error).message, true);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function requireUser() {
    if (!state?.user) {
      setModal("auth");
      return false;
    }
    return true;
  }
  function openMarket(m: Market, value: "yes" | "no" = "yes") {
    setSelected(m);
    setOutcome(value);
    setLimit(
      String((value === "yes" ? m.yes_price : 10000 - m.yes_price) / 100),
    );
    setDetails(null);
    setSide("buy");
    setDetailTab("Order book");
  }
  function addLeg(m: Market, value: "yes" | "no") {
    if (legs.some((l) => l.marketId === m.id)) {
      notify("This market is already in your combo.", true);
      return;
    }
    if (legs.length >= 6) {
      notify("A combo supports up to six legs.", true);
      return;
    }
    setLegs([...legs, { marketId: m.id, outcome: value }]);
    setQuote(null);
    notify("Added to combo");
  }
  const markets = state?.markets ?? [],
    portfolio = state?.portfolio;
  const current = markets.find((m) => m.id === selected?.id) ?? selected;
  const shown = markets.filter(
    (m) =>
      (category === "All" || m.category === category) &&
      m.question.toLowerCase().includes(search.toLowerCase()) &&
      (page !== "Live" || m.live) &&
      (filter !== "Watchlist" || state?.watchlist.includes(m.id)) &&
      (filter !== "Ending soon" ||
        new Date(m.closes_at).getTime() - now < 7 * 86400000),
  );
  shown.sort((a, b) =>
    sort === "probability"
      ? b.yes_price - a.yes_price
      : sort === "closing"
        ? new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime()
        : Number(BigInt(b.volume) - BigInt(a.volume)),
  );
  const markedValue =
    portfolio?.positions.reduce(
      (v, p) =>
        v +
        (Number(p.available) + Number(p.reserved)) *
          (p.outcome === "yes" ? p.yes_price : 10000 - p.yes_price),
      0,
    ) ?? 0;
  const unrealized =
    portfolio?.positions.reduce(
      (v, p) =>
        v +
        (Number(p.available) + Number(p.reserved)) *
          (p.outcome === "yes" ? p.yes_price : 10000 - p.yes_price) -
        Number(p.cost),
      0,
    ) ?? 0;
  const realized =
    portfolio?.positions.reduce((v, p) => v + Number(p.realized), 0) ?? 0;
  const selectedPrice = current
    ? outcome === "yes"
      ? current.yes_price
      : 10000 - current.yes_price
    : 5000;
  const direct = details?.book.filter((b) => b.outcome === outcome) ?? [];
  const ask = direct
    .filter((b) => b.side === "sell")
    .sort((a, b) => a.price - b.price)[0]?.price;
  const bid = direct
    .filter((b) => b.side === "buy")
    .sort((a, b) => b.price - a.price)[0]?.price;
  const indicative =
    kind === "limit"
      ? Math.round(Number(limit) * 100)
      : ((side === "buy" ? ask : bid) ?? selectedPrice);
  async function submitTrade() {
    if (!current || !requireUser()) return;
    if (!/^\d{1,6}$/.test(quantity) || Number(quantity) < 1) {
      notify("Enter a whole number of shares.", true);
      return;
    }
    if (kind === "limit" && !/^\d{1,2}(\.\d{1,2})?$/.test(limit)) {
      notify("Enter a price between 0.01 and 99.99 cents.", true);
      return;
    }
    const price =
      kind === "limit"
        ? Math.round(Number(limit) * 100)
        : side === "buy"
          ? Math.min(9999, (ask ?? selectedPrice) + 100)
          : Math.max(1, (bid ?? selectedPrice) - 100);
    const result = await call("orders", {
      marketId: current.id,
      outcome,
      side,
      quantity: Number(quantity),
      price,
      tif: kind === "market" ? "FAK" : tif,
      ...(kind === "limit" && tif === "GTD"
        ? { expiresAt: new Date(Date.now() + 3600000).toISOString() }
        : {}),
    });
    if (result)
      notify(
        result.state === "pending"
          ? "Live order reserved. Eligible for execution in 3 seconds."
          : result.remaining === result.quantity
            ? "Limit order placed, or immediate order canceled with no fill."
            : `${result.quantity - result.remaining} shares filled${result.remaining ? `; ${result.remaining} unfilled` : ""}.`,
      );
  }
  const marketCard = (m: Market) => (
    <article className="market-card" key={m.id}>
      <div className="card-top">
        <button
          className={`market-icon icon-${m.category.toLowerCase()}`}
          onClick={() => openMarket(m)}
          aria-label={`Open ${m.question}`}
        >
          {m.icon}
        </button>
        <button className="card-question" onClick={() => openMarket(m)}>
          {m.question}
        </button>
        <button
          className={`icon-button bookmark ${state?.watchlist.includes(m.id) ? "saved" : ""}`}
          aria-label="Toggle watchlist"
          onClick={() =>
            requireUser() && void call("watchlist", { marketId: m.id })
          }
        >
          <Bookmark size={16} />
        </button>
      </div>
      <div className="card-probability">
        <span className="chance">
          {probability(m.yes_price)}
          <small>chance</small>
        </span>
        <span className={`category-label ${m.live ? "live-label" : ""}`}>
          {m.live ? (
            <>
              <i /> LIVE
            </>
          ) : (
            m.category
          )}
        </span>
      </div>
      <div className="outcome-buttons">
        <button onClick={() => openMarket(m, "yes")} className="yes">
          Yes <span>{(m.yes_price / 100).toFixed(1)}¢</span>
          <ArrowUpRight size={14} />
        </button>
        <button onClick={() => openMarket(m, "no")} className="no">
          No <span>{((10000 - m.yes_price) / 100).toFixed(1)}¢</span>
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="card-footer">
        <span>{display(m.volume)} cr Vol.</span>
        <span>
          {m.status !== "open" ? (
            <b className="status">{m.status}</b>
          ) : m.live ? (
            <span className="score">{m.score}</span>
          ) : (
            <>
              <Clock size={12} />{" "}
              {new Date(m.closes_at).toLocaleDateString("en-ZA", {
                month: "short",
                day: "numeric",
              })}
            </>
          )}
        </span>
        <button
          title="Add Yes to combo"
          aria-label={`Add ${m.question} Yes to combo`}
          onClick={() => addLeg(m, "yes")}
        >
          <Layers3 size={15} />
          <Plus size={12} />
        </button>
      </div>
    </article>
  );
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="brand"
            onClick={() => {
              setPage("Markets");
              setCategory("All");
            }}
          >
            <span className="brand-mark">
              <BarChart3 size={22} />
            </span>
            leyona<span className="beta">BETA</span>
          </button>
          <div className="header-search">
            <Search size={18} />
            <input
              aria-label="Search markets"
              placeholder="Search markets"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage("Markets");
              }}
            />
            <kbd>/</kbd>
          </div>
          <div className="header-actions">
            {state?.user ? (
              <>
                <button
                  className="balance-button"
                  onClick={() => setPage("Portfolio")}
                >
                  <span>Balance</span>
                  <strong>
                    {display(portfolio?.balance)} <small>cr</small>
                  </strong>
                </button>
                <button
                  className="primary small"
                  onClick={() => setModal("credits")}
                >
                  <Plus size={15} /> Add credits
                </button>
                <button
                  className="avatar"
                  title={`${state.user.name} · Sign out`}
                  onClick={() => void call("auth/logout", {}, "Signed out")}
                >
                  {state.user.name.slice(0, 1).toUpperCase()}
                  <LogOut size={12} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="plain"
                  onClick={() => {
                    setRegister(false);
                    setModal("auth");
                  }}
                >
                  Log in
                </button>
                <button
                  className="primary small"
                  onClick={() => {
                    setRegister(true);
                    setModal("auth");
                  }}
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
        <div className="nav-inner">
          <nav className="main-nav">
            {[
              { label: "Markets", icon: <TrendingUp size={16} /> },
              { label: "Live", icon: <Zap size={16} /> },
              { label: "Combos", icon: <Layers3 size={16} /> },
              { label: "Portfolio", icon: <Wallet size={16} /> },
            ].map((n) => (
              <button
                key={n.label}
                className={page === n.label ? "active" : ""}
                onClick={() => {
                  setPage(n.label);
                  setFilter("Trending");
                }}
              >
                {n.icon}
                {n.label}
                {n.label === "Live" && <span className="live-dot" />}
                {n.label === "Combos" && legs.length > 0 && (
                  <span className="count">{legs.length}</span>
                )}
              </button>
            ))}
            {state?.user?.role === "admin" && (
              <button
                className={page === "Admin" ? "active" : ""}
                onClick={() => setPage("Admin")}
              >
                <ShieldCheck size={16} />
                Admin
              </button>
            )}
          </nav>
          <span className="simulation-badge">
            <span /> Simulated credits only
          </span>
        </div>
      </header>
      <main className="main-container">
        {state?.mode === "preview" && (
          <div className="setup-banner">
            <ShieldCheck size={17} />
            <span>
              <strong>Explore the preview.</strong> PostgreSQL isn’t connected
              yet. Trading and accounts unlock after database setup.
            </span>
            <span className="badge">READ ONLY</span>
          </div>
        )}
        {!state ? (
          <div className="loading">
            <span className="spinner" /> Loading markets…
          </div>
        ) : (
          <>
            {["Markets", "Live", "Combos"].includes(page) && (
              <>
                <div className="category-bar">
                  {categories.map((c) => (
                    <button
                      className={category === c ? "selected" : ""}
                      key={c}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                  <span className="category-end">
                    <Globe size={15} /> All topics
                  </span>
                </div>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">THE WORLD, IN PROBABILITIES</div>
                    <h1>
                      {page === "Live"
                        ? "Every moment. A new possibility."
                        : page === "Combos"
                          ? "Big ideas. Better together."
                          : "What happens next?"}
                    </h1>
                    <p>
                      {page === "Live"
                        ? "Follow the action and trade live simulated events."
                        : page === "Combos"
                          ? "Combine your predictions across topics into one trade."
                          : "Discover what the crowd thinks. Make your prediction."}
                    </p>
                  </div>
                  <div className="heading-note">
                    <Coins size={19} />
                    <div>
                      <strong>Real ideas. Test credits.</strong>
                      <span>Explore markets with zero real money.</span>
                    </div>
                  </div>
                </div>
                {page === "Markets" && (
                  <div className="feature-grid">
                    <button
                      className="feature-card feature-blue"
                      onClick={() =>
                        openMarket(
                          markets.find((m) => m.id === "fed-rate") ??
                            markets[0],
                        )
                      }
                    >
                      <div className="feature-copy">
                        <span className="feature-tag">
                          <Flame size={13} /> IN FOCUS
                        </span>
                        <h2>
                          The next move
                          <br />
                          is anyone’s call.
                        </h2>
                        <p>Explore the markets moving the economy.</p>
                        <span className="feature-link">
                          See the prediction <ArrowUpRight size={16} />
                        </span>
                      </div>
                      <div className="feature-art">
                        <span className="art-ring ring-one" />
                        <span className="art-ring ring-two" />
                        <span className="feature-number">
                          {probability(
                            markets.find((m) => m.id === "fed-rate")
                              ?.yes_price ?? 5000,
                          )}
                        </span>
                        <span className="number-label">
                          RATE CUT · DECEMBER
                        </span>
                        <svg viewBox="0 0 220 80">
                          <path d="M0 65 L23 62 L37 69 L53 45 L69 49 L85 33 L103 40 L118 25 L138 32 L153 13 L171 19 L190 9 L215 15" />
                        </svg>
                      </div>
                    </button>
                    <button
                      className="feature-card feature-dark"
                      onClick={() => setPage("Combos")}
                    >
                      <div className="feature-copy">
                        <span className="feature-tag">
                          <Layers3 size={13} /> CROSS-CATEGORY COMBOS
                        </span>
                        <h2>
                          One prediction?
                          <br />
                          Think bigger.
                        </h2>
                        <p>Your strongest convictions. One combo.</p>
                        <span className="feature-link">
                          Build a combo <ArrowUpRight size={16} />
                        </span>
                      </div>
                      <div className="combo-art">
                        <span className="art-chip chip-a">
                          ⚽ <b>YES</b>
                        </span>
                        <span className="art-plus">+</span>
                        <span className="art-chip chip-b">
                          🌦️ <b>YES</b>
                        </span>
                        <span className="art-chip chip-c">
                          🏛️ <b>NO</b>
                        </span>
                      </div>
                    </button>
                  </div>
                )}
                <div className="content-layout">
                  <section className="feed">
                    <div className="feed-toolbar">
                      <div className="feed-tabs">
                        {["Trending", "Ending soon", "Watchlist"].map((f) => (
                          <button
                            key={f}
                            className={filter === f ? "selected" : ""}
                            onClick={() => setFilter(f)}
                          >
                            {f === "Trending" ? (
                              <Flame size={15} />
                            ) : f === "Watchlist" ? (
                              <Bookmark size={14} />
                            ) : (
                              <Clock size={14} />
                            )}{" "}
                            {f}
                          </button>
                        ))}
                      </div>
                      <label className="sort">
                        <Settings2 size={14} />
                        <select
                          aria-label="Sort markets"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="volume">Volume</option>
                          <option value="probability">Probability</option>
                          <option value="closing">Closing date</option>
                        </select>
                      </label>
                    </div>
                    <div className="market-grid">{shown.map(marketCard)}</div>
                    {!shown.length && (
                      <div className="empty">
                        <Search size={30} />
                        <h3>No markets found</h3>
                        <p>Try another topic or search term.</p>
                        <button
                          className="secondary"
                          onClick={() => {
                            setSearch("");
                            setCategory("All");
                            setFilter("Trending");
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                    <div className="feed-end">
                      <span />
                      You’re all caught up
                      <span />
                    </div>
                  </section>
                  {(page === "Combos" || legs.length > 0) && (
                    <aside className="combo-slip">
                      <div className="slip-title">
                        <Layers3 size={18} />
                        <h3>Your combo</h3>
                        <span className="count">{legs.length}</span>
                      </div>
                      <p className="muted">Every leg needs to win.</p>
                      {!legs.length && (
                        <div className="combo-empty">
                          <Layers3 size={33} />
                          <p>
                            Add predictions using the <strong>＋</strong> on a
                            market, or choose an outcome in its trade ticket.
                          </p>
                        </div>
                      )}
                      {legs.map((leg, i) => (
                        <div className="slip-leg" key={leg.marketId}>
                          <span className="leg-number">{i + 1}</span>
                          <div>
                            <strong>
                              {
                                markets.find((m) => m.id === leg.marketId)
                                  ?.question
                              }
                            </strong>
                            <span
                              className={
                                leg.outcome === "yes" ? "green" : "red"
                              }
                            >
                              {leg.outcome.toUpperCase()}
                            </span>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="Remove leg"
                            onClick={() => {
                              setLegs(legs.filter((_, index) => i !== index));
                              setQuote(null);
                            }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <label className="field">
                        Stake{" "}
                        <div className="input-wrap">
                          <input
                            aria-label="Combo stake"
                            value={stake}
                            onChange={(e) => {
                              setStake(e.target.value);
                              setQuote(null);
                            }}
                            inputMode="decimal"
                          />
                          <span>credits</span>
                        </div>
                      </label>
                      {quote && (
                        <div className="quote-box">
                          <span>Maximum payout</span>
                          <strong>{display(quote.payout)} cr</strong>
                          <small>
                            Quote expires in{" "}
                            {Math.max(
                              0,
                              Math.ceil(
                                (new Date(quote.expires_at).getTime() - now) /
                                  1000,
                              ),
                            )}
                            s
                          </small>
                        </div>
                      )}
                      <button
                        className="primary full"
                        disabled={busy || legs.length < 2}
                        onClick={async () => {
                          if (!requireUser()) return;
                          if (
                            quote &&
                            new Date(quote.expires_at).getTime() > now
                          ) {
                            const r = await call(
                              "combos/accept",
                              { id: quote.id },
                              "Combo opened. Maximum payout is fully funded.",
                            );
                            if (r) {
                              setLegs([]);
                              setQuote(null);
                              setPage("Portfolio");
                            }
                          } else {
                            const q = await call("combos/quotes", {
                              legs,
                              stake,
                            });
                            if (q) setQuote(q);
                          }
                        }}
                      >
                        {busy
                          ? "Please wait…"
                          : quote && new Date(quote.expires_at).getTime() > now
                            ? "Confirm combo"
                            : "Get a quote"}
                      </button>
                      <p className="fine-print">
                        Simulation quotes assume eligible event groups are
                        independent. Same-event legs are unsupported. A void leg
                        refunds the whole stake after all legs finalize.
                      </p>
                    </aside>
                  )}
                </div>
              </>
            )}
            {page === "Portfolio" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">YOUR PREDICTIONS, AT A GLANCE</div>
                    <h1>Your portfolio</h1>
                    <p>Track your positions, open orders, and test credits.</p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => requireUser() && setModal("credits")}
                  >
                    <Plus size={16} /> Add credits
                  </button>
                </div>
                {!state.user ? (
                  <div className="empty panel">
                    <Wallet size={35} />
                    <h3>Your next prediction starts here.</h3>
                    <p>Sign in to add free credits and build your portfolio.</p>
                    <button
                      className="primary"
                      onClick={() => setModal("auth")}
                    >
                      Log in
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="stats-grid">
                      <Stat
                        label="Available credits"
                        value={`${display(portfolio?.balance)} cr`}
                        icon={<Wallet size={18} />}
                      />
                      <Stat
                        label="Position value"
                        value={`${display(BigInt(Math.round(markedValue)))} cr`}
                        icon={<TrendingUp size={18} />}
                      />
                      <Stat
                        label="Trading P&L"
                        value={`${display(BigInt(Math.round(realized + unrealized)))} cr`}
                        icon={<BarChart3 size={18} />}
                      />
                      <Stat
                        label="Reserved credits"
                        value={`${display(portfolio?.reserved)} cr`}
                        icon={<Clock size={18} />}
                      />
                    </div>
                    <p className="portfolio-note">
                      Total free credits added:{" "}
                      <strong>{display(portfolio?.issued)} cr</strong>. Top-ups
                      are excluded from P&amp;L. Position value uses the last
                      trade price; combo stakes and returns appear separately
                      below.
                    </p>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Positions</h2>
                        <span>
                          {
                            portfolio?.positions.filter(
                              (p) =>
                                Number(p.available) + Number(p.reserved) > 0,
                            ).length
                          }{" "}
                          active
                        </span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Market</th>
                              <th>Outcome</th>
                              <th>Shares</th>
                              <th>Avg. cost</th>
                              <th>Value</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {portfolio?.positions
                              .filter(
                                (p) =>
                                  Number(p.available) + Number(p.reserved) > 0,
                              )
                              .map((p) => (
                                <tr key={p.market_id + p.outcome}>
                                  <td>{p.question}</td>
                                  <td>
                                    <span
                                      className={`outcome-tag ${p.outcome}`}
                                    >
                                      {p.outcome}
                                    </span>
                                  </td>
                                  <td>
                                    {Number(p.available) + Number(p.reserved)}
                                    <small>
                                      {Number(p.reserved) > 0
                                        ? `${p.reserved} reserved`
                                        : ""}
                                    </small>
                                  </td>
                                  <td>
                                    {(
                                      Number(p.cost) /
                                      (Number(p.available) +
                                        Number(p.reserved)) /
                                      100
                                    ).toFixed(1)}
                                    ¢
                                  </td>
                                  <td>
                                    {display(
                                      BigInt(
                                        (Number(p.available) +
                                          Number(p.reserved)) *
                                          (p.outcome === "yes"
                                            ? p.yes_price
                                            : 10000 - p.yes_price),
                                      ),
                                    )}{" "}
                                    cr
                                  </td>
                                  <td>
                                    <button
                                      className="text-button"
                                      onClick={() => {
                                        const m = markets.find(
                                          (m) => m.id === p.market_id,
                                        );
                                        if (m) {
                                          openMarket(
                                            m,
                                            p.outcome as "yes" | "no",
                                          );
                                          setSide("sell");
                                        }
                                      }}
                                    >
                                      Trade <ArrowUpRight size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {!portfolio?.positions.some(
                          (p) => Number(p.available) + Number(p.reserved) > 0,
                        ) && (
                          <div className="empty compact">
                            Your first trade will appear here.
                          </div>
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Open orders</h2>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void call(
                              "orders/cancel-all",
                              {},
                              "Open orders canceled",
                            )
                          }
                        >
                          Cancel all
                        </button>
                      </div>
                      {portfolio?.orders
                        .filter((o) => ["pending", "open"].includes(o.state))
                        .map((o) => (
                          <div className="list-row" key={o.id}>
                            <div>
                              <strong>{o.question}</strong>
                              <span>
                                {o.side.toUpperCase()} {o.outcome.toUpperCase()}{" "}
                                · {o.remaining}/{o.quantity} shares ·{" "}
                                {(o.price / 100).toFixed(1)}¢ · {o.state}
                              </span>
                            </div>
                            <button
                              className="secondary small"
                              disabled={busy}
                              onClick={() =>
                                void call(
                                  "orders/cancel",
                                  { id: o.id },
                                  "Order canceled; unused reservation released.",
                                )
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        ))}
                      {!portfolio?.orders.some((o) =>
                        ["pending", "open"].includes(o.state),
                      ) && <div className="empty compact">No open orders.</div>}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Combos</h2>
                        <Layers3 size={17} />
                      </div>
                      {portfolio?.combos.map((c) => (
                        <div className="list-row" key={c.id}>
                          <div>
                            <strong>
                              {c.legs.length}-leg cross-category combo{" "}
                              <span className="status">{c.state}</span>
                            </strong>
                            <span>
                              {c.legs
                                .map(
                                  (l) =>
                                    `${markets.find((m) => m.id === l.marketId)?.category ?? l.marketId}: ${l.outcome.toUpperCase()}`,
                                )
                                .join(" + ")}
                            </span>
                            <span>
                              Stake {display(c.stake)} cr · Max payout{" "}
                              {display(c.payout)} cr
                            </span>
                          </div>
                          {c.state === "open" && (
                            <button
                              className="secondary small"
                              disabled={busy}
                              onClick={async () => {
                                const q = await call("combos/cashout-quote", {
                                  id: c.id,
                                });
                                if (
                                  q &&
                                  window.confirm(
                                    `Sell this combo for ${display(q.amount)} credits? Quote is valid for 15 seconds.`,
                                  )
                                )
                                  await call(
                                    "combos/cashout",
                                    { id: q.id },
                                    "Combo sold; credits returned to your balance.",
                                  );
                              }}
                            >
                              Cash out
                            </button>
                          )}
                        </div>
                      ))}
                      {!portfolio?.combos.length && (
                        <div className="empty compact">
                          No combos yet. Combine two or more predictions to get
                          started.
                        </div>
                      )}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Credit activity</h2>
                        <Coins size={18} />
                      </div>
                      {portfolio?.activity.map((a) => (
                        <div className="list-row" key={a.id}>
                          <div className="activity-title">
                            <span className="activity-icon">
                              {BigInt(a.amount) >= 0n ? (
                                <ArrowDownLeft size={17} />
                              ) : (
                                <ArrowUpRight size={17} />
                              )}
                            </span>
                            <div>
                              <strong>{a.description}</strong>
                              <span>
                                {new Date(a.created_at).toLocaleString("en-ZA")}
                              </span>
                            </div>
                          </div>
                          <strong
                            className={BigInt(a.amount) > 0n ? "green" : ""}
                          >
                            {BigInt(a.amount) > 0n ? "+" : ""}
                            {display(a.amount)} cr
                          </strong>
                        </div>
                      ))}
                      {!portfolio?.activity.length && (
                        <div className="empty compact">
                          No credit activity yet.
                        </div>
                      )}
                    </section>
                  </>
                )}
              </>
            )}
            {page === "Admin" && state.user?.role === "admin" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">MARKET OPERATIONS</div>
                    <h1>Control room</h1>
                    <p>
                      Create markets, review evidence, and manage resolutions.
                    </p>
                  </div>
                  <ShieldCheck size={30} />
                </div>
                <div className="admin-grid">
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Markets</h2>
                    </div>
                    {markets.map((m) => (
                      <div className="list-row" key={m.id}>
                        <div>
                          <strong>{m.question}</strong>
                          <span>
                            {m.status} · {m.category}
                          </span>
                        </div>
                        <button
                          className="secondary small"
                          onClick={() => openMarket(m)}
                        >
                          Manage
                        </button>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Create a market</h2>
                    </div>
                    <form
                      className="admin-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          data = new FormData(form);
                        const r = await call(
                          "admin/markets",
                          {
                            id: data.get("id"),
                            question: data.get("question"),
                            description: data.get("description"),
                            category: data.get("category"),
                            closesAt: new Date(
                              String(data.get("close")),
                            ).toISOString(),
                            eventGroup: data.get("group"),
                            live: data.get("live") === "on",
                          },
                          "Market created. Add liquidity before trading.",
                        );
                        if (r) form.reset();
                      }}
                    >
                      <label className="field">
                        Question
                        <input
                          name="question"
                          required
                          minLength={10}
                          placeholder="Will…?"
                        />
                      </label>
                      <label className="field">
                        Slug
                        <input
                          name="id"
                          required
                          pattern="[a-z0-9-]{3,80}"
                          placeholder="my-market"
                        />
                      </label>
                      <label className="field">
                        Category
                        <select name="category">
                          {categories.slice(1).map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Event group
                        <input
                          name="group"
                          required
                          minLength={3}
                          placeholder="Independent event identifier"
                        />
                      </label>
                      <label className="field">
                        Close time
                        <input name="close" type="datetime-local" required />
                      </label>
                      <label className="field">
                        Resolution rules &amp; source
                        <textarea
                          name="description"
                          minLength={30}
                          required
                          rows={4}
                        />
                      </label>
                      <label className="checkbox">
                        <input type="checkbox" name="live" /> Live simulated
                        event
                      </label>
                      <button className="primary full" disabled={busy}>
                        Create market
                      </button>
                    </form>
                  </section>
                </div>
                <section className="panel">
                  <div className="section-heading">
                    <h2>User disputes</h2>
                  </div>
                  {disputes.map((d) => (
                    <div className="list-row" key={d.id}>
                      <div>
                        <strong>
                          {d.question} · {d.name}
                        </strong>
                        <p>{d.evidence}</p>
                      </div>
                    </div>
                  ))}
                  {!disputes.length && (
                    <div className="empty compact">No disputes submitted.</div>
                  )}
                </section>
              </>
            )}
          </>
        )}
        <footer className="site-footer">
          <div className="footer-brand">
            leyona<span>Make your prediction.</span>
          </div>
          <p>
            A local prediction-market sandbox. Credits have no cash value.
            <br />
            Markets and live scores are simulated. No purchases or withdrawals.
          </p>
          <span className="footer-status">
            <i />{" "}
            {state?.mode === "connected"
              ? "Connected to local PostgreSQL"
              : "Preview mode"}
          </span>
        </footer>
      </main>
      {current && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="market-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={current.question}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close market"
              onClick={() => setSelected(null)}
            >
              <X size={21} />
            </button>
            <div className="market-main">
              <div className="market-breadcrumb">
                {current.category} <ChevronRight size={13} /> Prediction market
              </div>
              <div className="market-title">
                <span
                  className={`market-icon icon-${current.category.toLowerCase()}`}
                >
                  {current.icon}
                </span>
                <h2>{current.question}</h2>
              </div>
              <div className="market-meta">
                <strong>
                  {probability(current.yes_price)} <span>chance</span>
                </strong>
                <span>{display(current.volume)} cr Vol.</span>
                {current.live && (
                  <span className="live-label">
                    <i /> SIMULATED LIVE
                  </span>
                )}
                <span className="status">{current.status}</span>
              </div>
              {current.live && (
                <div className="live-score">
                  <Zap size={18} />
                  {current.score}
                  <span>Local simulation</span>
                </div>
              )}
              <div className="chart-area">
                {details && details.trades.length > 1 ? (
                  <>
                    <svg
                      viewBox="0 0 600 140"
                      preserveAspectRatio="none"
                      aria-label="Actual trade price history"
                    >
                      <path
                        d={details.trades
                          .slice()
                          .reverse()
                          .map(
                            (t, i) =>
                              `${i === 0 ? "M" : "L"}${(i / (details.trades.length - 1)) * 600} ${130 - ((t.outcome === "yes" ? t.price : 10000 - t.price) / 10000) * 120}`,
                          )
                          .join(" ")}
                      />
                    </svg>
                    <div className="chart-caption">
                      Recent executed trades · Yes probability
                    </div>
                  </>
                ) : (
                  <>
                    <BarChart3 size={30} />
                    <p>Price history starts with the first trades.</p>
                    <span>No fabricated price history.</span>
                  </>
                )}
              </div>
              <div className="detail-tabs">
                {["Order book", "Rules", "Comments"].map((t) => (
                  <button
                    className={detailTab === t ? "selected" : ""}
                    key={t}
                    onClick={() => setDetailTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {detailTab === "Order book" && (
                <div className="book">
                  <div className="book-heading">
                    <span>{outcome.toUpperCase()} order book</span>
                    <span>Price / Shares</span>
                  </div>
                  {direct
                    .filter((b) => b.side === "sell")
                    .slice(0, 5)
                    .map((b) => (
                      <div className="book-row red" key={`${b.side}${b.price}`}>
                        <span>Ask</span>
                        <b>{(b.price / 100).toFixed(2)}¢</b>
                        <span>{b.quantity}</span>
                      </div>
                    ))}
                  <div className="spread">
                    Spread{" "}
                    {ask && bid ? `${((ask - bid) / 100).toFixed(2)}¢` : "—"}
                  </div>
                  {direct
                    .filter((b) => b.side === "buy")
                    .slice(0, 5)
                    .map((b) => (
                      <div
                        className="book-row green"
                        key={`${b.side}${b.price}`}
                      >
                        <span>Bid</span>
                        <b>{(b.price / 100).toFixed(2)}¢</b>
                        <span>{b.quantity}</span>
                      </div>
                    ))}
                  {!direct.length && (
                    <p className="muted">
                      No resting orders. Liquidity requires funded
                      counterparties.
                    </p>
                  )}
                </div>
              )}
              {detailTab === "Rules" && (
                <div className="rules">
                  <h3>Resolution rules</h3>
                  <p>{current.description}</p>
                  <p>
                    Trading closes{" "}
                    {new Date(current.closes_at).toLocaleString("en-ZA")}. A
                    void result pays 0.5 credits per Yes and No share.
                  </p>
                  {["proposed", "disputed"].includes(current.status) && (
                    <>
                      <h3>Proposed result: {current.result?.toUpperCase()}</h3>
                      <p>
                        Settlement is paused during the challenge period and
                        while disputes are reviewed.
                      </p>
                      <textarea
                        aria-label="Dispute evidence"
                        placeholder="Explain your dispute with supporting evidence…"
                        value={adminEvidence}
                        onChange={(e) => setAdminEvidence(e.target.value)}
                      />
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          requireUser() &&
                          void call(
                            "disputes",
                            { marketId: current.id, evidence: adminEvidence },
                            "Dispute submitted; finalization is paused.",
                          )
                        }
                      >
                        Submit dispute
                      </button>
                    </>
                  )}
                </div>
              )}
              {detailTab === "Comments" && (
                <div className="comments">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!requireUser()) return;
                      const r = await call(
                        "comments",
                        { marketId: current.id, body: comment },
                        "Comment posted",
                      );
                      if (r) setComment("");
                    }}
                  >
                    <input
                      aria-label="Comment"
                      placeholder="Share your reasoning…"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={1000}
                    />
                    <button
                      className="primary small"
                      disabled={busy || !comment.trim()}
                    >
                      Post
                    </button>
                  </form>
                  {details?.comments.map((c) => (
                    <div className="comment" key={c.id}>
                      <div>
                        <strong>{c.name}</strong>
                        <span>
                          {new Date(c.created_at).toLocaleDateString("en-ZA")}
                        </span>
                      </div>
                      <p>{c.body}</p>
                    </div>
                  ))}
                  {!details?.comments.length && (
                    <p className="muted">
                      Start the conversation with your prediction.
                    </p>
                  )}
                </div>
              )}
              {state?.user?.role === "admin" && (
                <div className="admin-resolution">
                  <h3>Market controls</h3>
                  <div className="button-row">
                    <button
                      className="secondary small"
                      disabled={busy}
                      onClick={() =>
                        void call(
                          "admin/status",
                          {
                            marketId: current.id,
                            status:
                              current.status === "open" ? "suspended" : "open",
                          },
                          "Market status updated",
                        )
                      }
                    >
                      {current.status === "open"
                        ? "Suspend & clear orders"
                        : "Reopen market"}
                    </button>
                    <button
                      className="secondary small"
                      disabled={busy || current.status !== "proposed"}
                      onClick={() =>
                        void call(
                          "admin/finalize",
                          { marketId: current.id },
                          "Market finalized and settled",
                        )
                      }
                    >
                      Finalize result
                    </button>
                  </div>
                  <label className="field">
                    Resolution
                    <select
                      value={adminResult}
                      onChange={(e) => setAdminResult(e.target.value)}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                      <option value="void">Void / 50–50</option>
                    </select>
                  </label>
                  <textarea
                    aria-label="Resolution evidence"
                    placeholder="Evidence and source, or review decision…"
                    value={adminEvidence}
                    onChange={(e) => setAdminEvidence(e.target.value)}
                  />
                  <button
                    className="primary small"
                    disabled={busy}
                    onClick={() =>
                      void call(
                        "admin/propose",
                        {
                          marketId: current.id,
                          result: adminResult,
                          evidence: adminEvidence,
                        },
                        "Result proposed. Challenge window started.",
                      )
                    }
                  >
                    Propose / review result
                  </button>
                </div>
              )}
            </div>
            <aside className="trade-ticket">
              <div className="trade-tabs">
                <button
                  className={side === "buy" ? "selected" : ""}
                  onClick={() => setSide("buy")}
                >
                  Buy
                </button>
                <button
                  className={side === "sell" ? "selected" : ""}
                  onClick={() => setSide("sell")}
                >
                  Sell
                </button>
                <select
                  aria-label="Order type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                </select>
              </div>
              <div className="ticket-outcomes">
                <button
                  className={outcome === "yes" ? "yes selected" : "yes"}
                  onClick={() => setOutcome("yes")}
                >
                  Yes {(current.yes_price / 100).toFixed(1)}¢
                </button>
                <button
                  className={outcome === "no" ? "no selected" : "no"}
                  onClick={() => setOutcome("no")}
                >
                  No {((10000 - current.yes_price) / 100).toFixed(1)}¢
                </button>
              </div>
              {kind === "limit" && (
                <>
                  <label className="field">
                    Limit price
                    <div className="input-wrap">
                      <input
                        aria-label="Limit price in cents"
                        value={limit}
                        onChange={(e) => setLimit(e.target.value)}
                        inputMode="decimal"
                      />
                      <span>¢</span>
                    </div>
                  </label>
                  <label className="field">
                    Time in force
                    <select
                      value={tif}
                      onChange={(e) => setTif(e.target.value)}
                    >
                      <option value="GTC">Good until canceled</option>
                      <option value="GTD">Expires in 1 hour</option>
                      <option value="FOK">Fill or kill</option>
                      <option value="FAK">Fill and kill</option>
                    </select>
                  </label>
                </>
              )}
              <label className="field">
                Shares
                <div className="input-wrap">
                  <input
                    aria-label="Number of shares"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <span>shares</span>
                </div>
              </label>
              <div className="quick-amounts">
                {[10, 25, 50, 100].map((q) => (
                  <button key={q} onClick={() => setQuantity(String(q))}>
                    +{q}
                  </button>
                ))}
              </div>
              <div className="ticket-balance">
                <span>Available balance</span>
                <strong>{display(portfolio?.balance)} cr</strong>
              </div>
              <div className="trade-summary">
                <div>
                  <span>Estimated {side === "buy" ? "cost" : "proceeds"}</span>
                  <strong>
                    {Number.isFinite(indicative * Number(quantity))
                      ? display(
                          BigInt(Math.round(indicative * Number(quantity))),
                        )
                      : "—"}{" "}
                    cr
                  </strong>
                </div>
                {side === "buy" && (
                  <div>
                    <span>Maximum payout</span>
                    <strong className="green">
                      {Number(quantity) || 0} cr
                    </strong>
                  </div>
                )}
                <div>
                  <span>Trading fee</span>
                  <strong>0 cr</strong>
                </div>
              </div>
              <button
                className={`primary full trade-submit ${outcome === "no" ? "red-button" : ""}`}
                disabled={
                  busy ||
                  current.status !== "open" ||
                  state?.mode !== "connected"
                }
                onClick={() => void submitTrade()}
              >
                {busy
                  ? "Submitting…"
                  : `${side === "buy" ? "Buy" : "Sell"} ${outcome.toUpperCase()}`}
              </button>
              <button
                className="secondary full"
                onClick={() => addLeg(current, outcome)}
              >
                <Layers3 size={15} /> Add to combo
              </button>
              <p className="fine-print">
                {current.live ? "Live orders have a 3-second delay. " : ""}
                {kind === "market"
                  ? "Immediate execution with a 1¢ price guard; unfilled shares are canceled. "
                  : ""}
                Execution depends on available liquidity. Credits have no cash
                value.
              </p>
            </aside>
          </section>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop auth-backdrop"
          onClick={() => setModal(null)}
        >
          <section
            className="simple-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={modal === "credits" ? "Add credits" : "Account"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            <span className="dialog-icon">
              {modal === "credits" ? (
                <Coins size={26} />
              ) : (
                <BarChart3 size={26} />
              )}
            </span>
            <h2>
              {modal === "credits"
                ? "More room to predict."
                : register
                  ? "Make your first prediction."
                  : "Welcome back."}
            </h2>
            <p className="muted">
              {modal === "credits"
                ? "Add free simulated credits. No card. No real money."
                : "Your ideas deserve a position."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const result =
                  modal === "credits"
                    ? await call(
                        "credits/top-ups",
                        { amount: credits },
                        "Free credits added to your ledger.",
                      )
                    : await call(
                        register ? "auth/register" : "auth/login",
                        { email, password, ...(register ? { name } : {}) },
                        register
                          ? "Account created. Add free credits to start trading."
                          : "Welcome back",
                      );
                if (result) {
                  setModal(null);
                  setPassword("");
                }
              }}
            >
              {modal === "credits" ? (
                <>
                  <label className="field">
                    Credits to add
                    <input
                      value={credits}
                      onChange={(e) => setCredits(e.target.value)}
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <div className="quick-amounts">
                    {[100, 1000, 10000].map((v) => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => setCredits(String(v))}
                      >
                        {v.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <p className="fine-print">
                    Unlimited top-ups. Each addition is recorded in your credit
                    history.
                  </p>
                </>
              ) : (
                <>
                  {register && (
                    <label className="field">
                      Display name
                      <input
                        autoComplete="nickname"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        minLength={2}
                        maxLength={40}
                        required
                      />
                    </label>
                  )}
                  <label className="field">
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    Password
                    <input
                      type="password"
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={10}
                      maxLength={128}
                      required
                      placeholder="At least 10 characters"
                    />
                  </label>
                </>
              )}
              <button
                className="primary full"
                disabled={busy || state?.mode !== "connected"}
              >
                {busy
                  ? "Please wait…"
                  : modal === "credits"
                    ? "Add free credits"
                    : register
                      ? "Create account"
                      : "Log in"}
              </button>
            </form>
            {modal === "auth" && (
              <p className="auth-switch">
                {register ? "Already have an account?" : "New to Leyona?"}{" "}
                <button onClick={() => setRegister(!register)}>
                  {register ? "Log in" : "Sign up"}
                </button>
              </p>
            )}
            {state?.mode !== "connected" && (
              <p className="form-warning">
                Connect and initialize PostgreSQL first.
              </p>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role="status"
        >
          {toast.error ? <X size={17} /> : <Check size={17} />}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
    </div>
  );
}
