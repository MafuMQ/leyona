"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import type { Market } from "@/lib/fixtures";
import { amount } from "@/lib/money";
import AutoCarousel from "./auto-carousel";

type Props = {
  markets: Market[];
  connected: boolean;
  watchlist: string[];
  onOpen: (market: Market, outcome?: "yes" | "no") => void;
  onTopic: (category: string) => void;
  onWatch: (market: Market) => void;
};
type Trade = { outcome: string; price: number; created_at: string };
const percent = (price: number) =>
  `${(price / 100).toFixed(price % 100 ? 1 : 0)}%`;
const volume = (value: string) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(amount(value)));
const stories: Record<
  string,
  { image: string; alt: string; label: string; copy: string; short: string }
> = {
  "fed-rate": {
    image: "economy",
    alt: "Looking up at the glass towers of a financial district",
    label: "THE ECONOMY",
    copy: "All eyes on the next rate decision. Put your outlook to the test before the announcement.",
    short: "December rate cut",
  },
  "ai-model": {
    image: "technology",
    alt: "Detailed electronic components on a circuit board",
    label: "TECH & SCIENCE",
    copy: "The next chapter of AI is still being written. What will the next big release look like?",
    short: "New frontier AI model",
  },
  "space-launch": {
    image: "space",
    alt: "The blue curve of Earth seen from space",
    label: "THE NEXT FRONTIER",
    copy: "A new test. A new milestone. Follow the possibilities as the next spaceflight takes shape.",
    short: "Starship reaches orbit",
  },
  rain: {
    image: "weather",
    alt: "A green landscape beneath an open sky",
    label: "CLIMATE & WEATHER",
    copy: "A change in the weather can change the weekend. Make your call on Johannesburg’s forecast.",
    short: "Rain in Johannesburg",
  },
  "bitcoin-100k": {
    image: "technology",
    alt: "An electronic circuit board",
    label: "CRYPTO",
    copy: "Where will the year end? Explore the crowd’s outlook, one prediction at a time.",
    short: "Bitcoin above $100k",
  },
};
function storyFor(m: Market) {
  return (
    stories[m.id] ?? {
      image: "economy",
      alt: "A city financial district",
      label: m.category.toUpperCase(),
      copy: "A question worth following. Explore the rules, see the market, and make your prediction.",
      short: m.question,
    }
  );
}

function ForecastChart({
  market,
  trades,
}: {
  market: Market;
  trades: Trade[];
}) {
  const chronological = [...trades].reverse();
  const values = chronological.map((t) =>
    t.outcome === "yes" ? t.price : 10000 - t.price,
  );
  const points = values.length > 1 ? values : [market.yes_price];
  const path = (opposite = false) =>
    points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${points.length === 1 ? 470 : 10 + (i / (points.length - 1)) * 460},${16 + (1 - (opposite ? 10000 - p : p) / 10000) * 116}`,
      )
      .join(" ");
  const last = points.at(-1)!;
  return (
    <div className="forecast-chart">
      <svg
        viewBox="0 0 540 155"
        role="img"
        aria-label={
          values.length > 1
            ? "Yes and No probabilities from executed trades"
            : `Current forecast: Yes ${percent(last)}, No ${percent(10000 - last)}`
        }
      >
        {[16, 74, 132].map((y, i) => (
          <g key={y}>
            <line x1="10" x2="480" y1={y} y2={y} className="chart-gridline" />
            <text x="495" y={y + 4}>
              {["100%", "50%", "0%"][i]}
            </text>
          </g>
        ))}
        {values.length > 1 && (
          <>
            <path d={path()} className="forecast-yes-line" />
            <path d={path(true)} className="forecast-no-line" />
          </>
        )}
        {values.length < 2 && (
          <>
            <line
              x1="10"
              x2="470"
              y1={16 + (1 - last / 10000) * 116}
              y2={16 + (1 - last / 10000) * 116}
              className="snapshot-line forecast-yes-line"
            />
            <line
              x1="10"
              x2="470"
              y1={16 + (last / 10000) * 116}
              y2={16 + (last / 10000) * 116}
              className="snapshot-line forecast-no-line"
            />
          </>
        )}
        <circle
          cx="470"
          cy={16 + (1 - last / 10000) * 116}
          r="4.5"
          className="forecast-yes-dot"
        />
        <circle
          cx="470"
          cy={16 + (last / 10000) * 116}
          r="4.5"
          className="forecast-no-dot"
        />
      </svg>
      <span className="chart-context">
        {values.length > 1
          ? "Recent trades · Yes / No"
          : "Current snapshot · history begins with trading"}
      </span>
    </div>
  );
}

export default function TrendingHome({
  markets,
  connected,
  watchlist,
  onOpen,
  onTopic,
  onWatch,
}: Props) {
  const preferred = [
    "fed-rate",
    "ai-model",
    "space-launch",
    "rain",
    "bitcoin-100k",
  ];
  const featured = preferred
    .map((id) => markets.find((m) => m.id === id))
    .filter((m): m is Market => !!m);
  const slides = featured.length ? featured : markets.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);
  const [histories, setHistories] = useState<Record<string, Trade[]>>({});
  const currentIndex = slides.length ? index % slides.length : 0;
  const current = slides[currentIndex];
  useEffect(() => {
    if (!connected || !current) return;
    const controller = new AbortController();
    void fetch(`/api/markets/${current.id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !controller.signal.aborted) {
          setHistories((previous) => ({
            ...previous,
            [current.id]: data.trades ?? [],
          }));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [current?.id, current?.volume, connected]);
  if (!current) return null;
  const weekly = preferred
    .map((id) => markets.find((m) => m.id === id))
    .filter((m): m is Market => !!m);
  const watch = ["ai-model", "space-launch", "rain"]
    .map((id) => markets.find((m) => m.id === id))
    .filter((m): m is Market => !!m);
  const watching = [
    ...watch,
    ...markets.filter((m) => !watch.some((featured) => featured.id === m.id)),
  ];
  const grouped = Array.from(new Set(markets.map((m) => m.category)))
    .map((category) => {
      const group = markets.filter((m) => m.category === category);
      return {
        category,
        count: group.length,
        volume: group.reduce((sum, m) => sum + BigInt(m.volume), 0n),
      };
    })
    .sort((a, b) =>
      a.volume === b.volume ? b.count - a.count : a.volume > b.volume ? -1 : 1,
    )
    .slice(0, 5);
  function renderFeatured(market: Market) {
    const story = storyFor(market);
    return (
      <article
        className="carousel-slide"
        key={market.id}
        aria-roledescription="slide"
        aria-label={`${slides.findIndex((s) => s.id === market.id) + 1} of ${slides.length}`}
      >
        <div className="carousel-copy">
          <div className="story-kicker">
            <span />
            {story.label}
          </div>
          <button className="hero-market-title" onClick={() => onOpen(market)}>
            <h1>{market.question}</h1>
          </button>
          <div className="forecast-legend">
            <button onClick={() => onOpen(market, "yes")}>
              <i className="yes-dot" /> Yes{" "}
              <strong>{percent(market.yes_price)}</strong>
            </button>
            <button onClick={() => onOpen(market, "no")}>
              <i className="no-dot" /> No{" "}
              <strong>{percent(10000 - market.yes_price)}</strong>
            </button>
            <span>Simulated market</span>
          </div>
          <ForecastChart market={market} trades={histories[market.id] ?? []} />
          <div className="story-volume">
            <span>{volume(market.volume)} cr</span> volume{" "}
            <span className="story-market-count">
              <span className="tiny-live-dot" /> Predictions, in motion
            </span>
          </div>
        </div>
        <div className="carousel-editorial">
          <button
            className="hero-image-button"
            onClick={() => onOpen(market)}
            aria-label={`Explore ${market.question}`}
          >
            <img
              src={`/markets/${story.image}.jpg`}
              alt={story.alt}
              loading="eager"
            />
            <span className="image-topic">
              {market.category}
              <ArrowUpRight size={14} />
            </span>
          </button>
          <p>{story.copy}</p>
          <button className="read-story" onClick={() => onOpen(market)}>
            <span className="desktop-story-cta">Explore market</span>
            <span className="mobile-story-cta">Read more</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="trending-home">
      <section className="feature-carousel">
        <AutoCarousel
          variant="featured"
          items={slides}
          itemKey={(market) => market.id}
          label="Featured predictions"
          onIndexChange={setIndex}
          slideLabel={(market, i) =>
            `Show featured market ${i + 1}: ${market.question}`
          }
          renderItem={renderFeatured}
        />
      </section>
      <section className="weekly-forecasts" aria-label="Weekly forecasts">
        <div className="weekly-label">
          <Sparkles size={15} />
          <h2>Weekly forecasts</h2>
          <button
            aria-label={
              tickerPaused ? "Play weekly forecasts" : "Pause weekly forecasts"
            }
            onClick={() => setTickerPaused(!tickerPaused)}
          >
            {tickerPaused ? <Play size={11} /> : <Pause size={11} />}
          </button>
        </div>
        <div className={`weekly-window ${tickerPaused ? "ticker-paused" : ""}`}>
          <div className="weekly-track">
            {[0, 1].map((copy) => (
              <div
                className="weekly-set"
                key={copy}
                aria-hidden={copy === 1 ? "true" : undefined}
              >
                {weekly.map((m) => (
                  <button
                    key={m.id}
                    className="weekly-pill"
                    tabIndex={copy === 1 ? -1 : 0}
                    onClick={() => onOpen(m)}
                  >
                    <span>{m.icon}</span>
                    <strong>{storyFor(m).short}</strong>
                    <b>{percent(m.yes_price)}</b>
                    <span className="pill-outcome">Yes</span>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="discovery-columns">
        <section className="markets-to-watch" aria-labelledby="watch-heading">
          <div className="discovery-heading">
            <div>
              <span className="section-kicker">ON THE RADAR</span>
              <h2 id="watch-heading">Markets to watch</h2>
            </div>
            <div className="watch-carousel-actions">
              <button
                className="watch-view-all"
                onClick={() =>
                  document.getElementById("trending-trades")?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                    block: "start",
                  })
                }
              >
                View all <ArrowRight size={15} />
              </button>
            </div>
          </div>
          <AutoCarousel
            items={watching}
            itemKey={(m) => m.id}
            label="Markets to watch carousel"
            renderItem={(m) => (
              <article className="watch-market-card" key={m.id}>
                <div className="watch-image-wrap">
                  <button
                    className="watch-image"
                    aria-label={`Open ${m.question}`}
                    onClick={() => onOpen(m)}
                  >
                    <img
                      src={`/markets/${storyFor(m).image}.jpg`}
                      alt={storyFor(m).alt}
                      loading="lazy"
                    />
                  </button>
                  <span className="watch-category">{m.category}</span>
                  <button
                    className={`watch-bookmark ${watchlist.includes(m.id) ? "is-saved" : ""}`}
                    aria-label={`${watchlist.includes(m.id) ? "Unwatch" : "Watch"} ${m.question}`}
                    aria-pressed={watchlist.includes(m.id)}
                    onClick={() => onWatch(m)}
                  >
                    <Bookmark size={15} />
                  </button>
                </div>
                <button className="watch-question" onClick={() => onOpen(m)}>
                  {m.question}
                </button>
                <div className="watch-probability">
                  <strong>
                    {percent(m.yes_price)}
                    <small>chance</small>
                  </strong>
                  <button onClick={() => onOpen(m, "yes")}>
                    Yes <ArrowUpRight size={13} />
                  </button>
                </div>
                <div className="watch-volume">
                  {volume(m.volume)} cr volume
                  <span>
                    Explore <ChevronRight size={11} />
                  </span>
                </div>
              </article>
            )}
          />
        </section>
        <aside className="hot-topics" aria-labelledby="topics-heading">
          <div className="discovery-heading">
            <div>
              <span className="section-kicker">IN THE CONVERSATION</span>
              <h2 id="topics-heading">
                Hot topics <Flame size={18} />
              </h2>
            </div>
          </div>
          <div className="topic-list">
            {grouped.map((topic, i) => (
              <button
                key={topic.category}
                className="hot-topic-row"
                onClick={() => onTopic(topic.category)}
              >
                <span className="topic-rank">{i + 1}</span>
                <strong>{topic.category}</strong>
                <span className="topic-metric">
                  {topic.volume > 0n
                    ? `${volume(topic.volume.toString())} cr vol.`
                    : `${topic.count} ${topic.count === 1 ? "market" : "markets"}`}
                </span>
                <Flame size={13} />
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          <button className="explore-topics" onClick={() => onTopic("All")}>
            Explore all topics <ArrowRight size={14} />
          </button>
          <div className="topics-footnote">
            <span /> Powered by activity on Leyona
          </div>
        </aside>
      </div>
    </div>
  );
}
