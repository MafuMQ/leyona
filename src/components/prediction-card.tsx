"use client";

import { useState } from "react";
import { Bookmark, ChevronDown, Layers3 } from "lucide-react";
import type { Market } from "@/lib/fixtures";
import { amount } from "@/lib/money";

const labels: Record<string, string> = {
  "fed-rate": "Rate cut",
  "city-arsenal": "Manchester City wins",
  "lakers-celtics": "Lakers win",
  "ai-model": "New model launches",
  "space-launch": "Reaches orbit",
  "bitcoin-100k": "Above $100,000",
  election: "Incumbent party wins",
  album: "Surprise album tops chart",
  rain: "Rain in Johannesburg",
};

export function groupPredictionMarkets(markets: Market[]): Market[][] {
  const groups = new Map<string, Market[]>();
  for (const market of markets) {
    const key = market.event_group || market.id;
    groups.set(key, [...(groups.get(key) ?? []), market]);
  }
  return [...groups.values()];
}

export default function PredictionCard({
  markets,
  saved,
  onOpen,
  onWatch,
  onCombo,
}: {
  markets: Market[];
  saved: boolean;
  onOpen: (market: Market, outcome?: "yes" | "no") => void;
  onWatch: (market: Market) => void;
  onCombo: (market: Market) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const primary = markets[0];
  const rows = expanded ? markets : markets.slice(0, 2);
  const title =
    markets.length === 1
      ? primary.question
      : primary.event_group
          .replaceAll("-", " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
  const total = markets.reduce(
    (value, market) => value + BigInt(market.volume),
    0n,
  );
  const formattedVolume = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(amount(total)));
  return (
    <article
      className={`market-card row-market-card ${markets.length === 1 ? "binary-market-card" : ""}`}
    >
      <div className="card-top">
        <span
          className={`market-icon icon-${primary.category.toLowerCase()}`}
          aria-hidden="true"
        >
          {primary.icon}
        </span>
        <button className="card-question" onClick={() => onOpen(primary)}>
          {title}
        </button>
        {markets.length === 1 && (
          <div
            className="mobile-probability-gauge"
            aria-label={`${primary.yes_price / 100}% chance`}
          >
            <svg viewBox="0 0 64 42" aria-hidden="true">
              <path d="M5 34 A27 27 0 0 1 59 34" className="gauge-track" />
              <path
                d="M5 34 A27 27 0 0 1 59 34"
                pathLength="100"
                strokeDasharray={`${primary.yes_price / 100} 100`}
                className={
                  primary.yes_price >= 5000
                    ? "gauge-value gauge-positive"
                    : "gauge-value"
                }
              />
            </svg>
            <strong>
              {(primary.yes_price / 100).toFixed(
                primary.yes_price % 100 ? 1 : 0,
              )}
              %
            </strong>
            <small>chance</small>
          </div>
        )}
      </div>
      <div className="prediction-rows">
        {rows.map((market) => (
          <div className="prediction-row" key={market.id}>
            <span className="prediction-row-label" title={market.question}>
              {labels[market.id] ??
                (markets.length === 1 ? "Yes outcome" : market.question)}
            </span>
            <strong>
              {(market.yes_price / 100).toFixed(market.yes_price % 100 ? 1 : 0)}
              %
            </strong>
            <button
              className="row-yes"
              aria-label={`Buy Yes: ${market.question}`}
              onClick={() => onOpen(market, "yes")}
            >
              Yes
            </button>
            <button
              className="row-no"
              aria-label={`Buy No: ${market.question}`}
              onClick={() => onOpen(market, "no")}
            >
              No
            </button>
          </div>
        ))}
        {markets.length > 2 && (
          <button
            className="expand-predictions"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? "Show less"
              : `Show ${markets.length - 2} more outcomes`}
            <ChevronDown size={12} />
          </button>
        )}
      </div>
      <div className="card-footer">
        <span>{formattedVolume} cr Vol.</span>
        {primary.live && (
          <span className="row-live-label">
            <i /> LIVE
          </span>
        )}
        {primary.status !== "open" && (
          <span className="status">{primary.status}</span>
        )}
        <div className="prediction-card-actions">
          <button
            aria-label={`Add ${primary.question} Yes to combo`}
            title="Add Yes to combo"
            onClick={() => onCombo(primary)}
          >
            <Layers3 size={14} />
          </button>
          <button
            className={saved ? "bookmark saved" : "bookmark"}
            aria-label={`Watch ${title}`}
            aria-pressed={saved}
            title="Toggle watchlist"
            onClick={() => onWatch(primary)}
          >
            <Bookmark size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
