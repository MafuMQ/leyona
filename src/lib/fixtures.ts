export type Market = {
  id: string;
  question: string;
  description: string;
  category: string;
  icon: string;
  yes_price: number;
  volume: string;
  closes_at: string;
  status: string;
  live: boolean;
  score: string | null;
  event_group: string;
  result: string | null;
  evidence?: string | null;
  challenge_until?: string | null;
};
const closing = "2027-01-01T00:00:00.000Z";
export const fixtures: Market[] = [
  {
    id: "fed-rate",
    question: "Will the Fed cut interest rates in December?",
    description:
      "Resolves Yes if the Federal Reserve announces a lower target federal funds rate at its December 2026 meeting. Source: the official FOMC statement. Simulation fixture; administrators resolve against the published scenario.",
    category: "Economy",
    icon: "🏛️",
    yes_price: 6400,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: false,
    score: null,
    event_group: "fed-december",
    result: null,
  },
  {
    id: "city-arsenal",
    question: "Will Manchester City beat Arsenal?",
    description:
      "Moneyline. Regulation time plus stoppage time only. A draw resolves No. A canceled fixture resolves Void. This is a simulated fixture, not a live external score feed.",
    category: "Sports",
    icon: "⚽",
    yes_price: 5700,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: true,
    score: "MCI 1 – 0 ARS · 34′",
    event_group: "city-arsenal",
    result: null,
  },
  {
    id: "ai-model",
    question: "Will a new frontier AI model launch before December?",
    description:
      "Resolves Yes if the simulated technology scenario announces a publicly available new frontier model before 1 December 2026. Source: simulator event and administrator evidence.",
    category: "Tech",
    icon: "✳️",
    yes_price: 7800,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: false,
    score: null,
    event_group: "ai-launch",
    result: null,
  },
  {
    id: "bitcoin-100k",
    question: "Will Bitcoin finish the year above $100,000?",
    description:
      "Resolves against the final reference observation in the local year-end price scenario, in USD. A missing observation resolves Void. Credits and trading are entirely simulated.",
    category: "Crypto",
    icon: "₿",
    yes_price: 4300,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: false,
    score: null,
    event_group: "btc-year-end",
    result: null,
  },
  {
    id: "election",
    question: "Will the incumbent party win the next election?",
    description:
      "Resolves against the certified result of the local election simulation. The scenario is fictional. A canceled election resolves Void.",
    category: "Politics",
    icon: "🗳️",
    yes_price: 5100,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: false,
    score: null,
    event_group: "election",
    result: null,
  },
  {
    id: "space-launch",
    question: "Will the next Starship test reach orbit?",
    description:
      "Resolves against the next orbital test scenario's final flight record. Source: local simulator and admin evidence. A canceled test resolves Void.",
    category: "Science",
    icon: "🚀",
    yes_price: 7200,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: false,
    score: null,
    event_group: "space-test",
    result: null,
  },
  {
    id: "lakers-celtics",
    question: "Will the Lakers beat the Celtics tonight?",
    description:
      "Moneyline including overtime. Resolves against the local basketball simulator. A canceled game resolves Void. This is a simulated fixture.",
    category: "Sports",
    icon: "🏀",
    yes_price: 3800,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: true,
    score: "LAL 62 – 68 BOS · Q3",
    event_group: "lakers-celtics",
    result: null,
  },
  {
    id: "album",
    question: "Will a surprise album top the charts this month?",
    description:
      "Resolves against the final weekly chart in the local culture scenario. Source: simulated chart publication. Administrator evidence required.",
    category: "Culture",
    icon: "🎵",
    yes_price: 2900,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: false,
    score: null,
    event_group: "music-chart",
    result: null,
  },
  {
    id: "rain",
    question: "Will Johannesburg get rain this weekend?",
    description:
      "Resolves Yes if the local weather simulator records at least 1 mm of precipitation over the weekend. Source: simulated station observation. Missing data resolves Void.",
    category: "Weather",
    icon: "🌦️",
    yes_price: 6600,
    volume: "0",
    closes_at: closing,
    status: "open",
    live: false,
    score: null,
    event_group: "jhb-weather",
    result: null,
  },
];
