import {
  FEED, LEADERBOARD, COMPANIES, SECTORS, SECTOR_DETAIL,
  CALENDAR, PULSE, SEARCH_INDEX,
} from './demoData';
import { setToken, getToken, clearToken } from './auth';

// ─── Local-storage portfolio (keeps demo interactive) ────────────────────────

const PORTFOLIO_KEY = 'esp_demo_portfolio';

function storedPortfolio() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '[]'); }
  catch { return []; }
}
function savePortfolio(tickers) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(tickers));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Public read endpoints ────────────────────────────────────────────────────

export const getFeed        = async () => FEED;
export const getFeedSince   = async ()  => [];   // no live updates in demo
export const getLeaderboard = async () => LEADERBOARD;

export const getCompanyHistory = async (ticker) =>
  COMPANIES[ticker.toUpperCase()]?.history ?? [];

export const getCompanyInfo = async (ticker) =>
  COMPANIES[ticker.toUpperCase()]?.info ?? null;

export const getPrices = async () => [];   // price chart not needed for demo

export const getAccuracy = async (ticker) =>
  COMPANIES[ticker.toUpperCase()]?.accuracy ?? { total: 0, buckets: [] };

export const getCalendar = async () => CALENDAR;

export const searchCompanies = async (q) => {
  const query = q.toLowerCase().trim();
  if (!query) return [];
  return SEARCH_INDEX.filter(c =>
    c.ticker.toLowerCase().includes(query) ||
    c.company_name.toLowerCase().includes(query)
  ).slice(0, 6);
};

export const getPulse        = async () => PULSE;
export const getSectors      = async () => SECTORS;
export const getSectorDetail = async (sector) => SECTOR_DETAIL[sector] ?? null;

export const getCompanyLatest = async (ticker) =>
  COMPANIES[ticker.toUpperCase()]?.history?.[0] ?? null;

export const triggerIngest = async () => ({ ok: true });

// ─── Auth (demo: any credentials succeed, token in localStorage) ─────────────

export const login = async (email, password) => {  // eslint-disable-line no-unused-vars
  await sleep(350);
  const token = `demo-${Date.now()}`;
  setToken(token);
  return { token };
};

export const register = async (email, password) => {  // eslint-disable-line no-unused-vars
  await sleep(350);
  const token = `demo-${Date.now()}`;
  setToken(token);
  return { token };
};

export const getMe = async () => ({ email: 'demo@example.com' });

export const updatePreferences = async () => ({ ok: true });

// ─── Portfolio (localStorage-backed so watchlist actually persists) ───────────

export const getPortfolioItems = async () =>
  storedPortfolio().map(t => ({ ticker: t }));

export const addToPortfolio = async (ticker) => {
  const list = storedPortfolio();
  if (!list.includes(ticker)) savePortfolio([...list, ticker]);
  return { ok: true };
};

export const removeFromPortfolio = async (ticker) => {
  savePortfolio(storedPortfolio().filter(t => t !== ticker));
  return { ok: true };
};

export const getSuggestions = async () => [];

// ─── Inspect — fake streaming analysis ───────────────────────────────────────

export async function inspectCall(data, onText, onDone, onError) {  // eslint-disable-line no-unused-vars
  const score  = data?.confidence_score ?? 65;
  const ticker = data?.ticker ?? 'this company';

  const analysis = score >= 70
    ? `Analyzing ${ticker} earnings call...\n\nManagement tone was notably confident throughout the prepared remarks and Q&A session. Key signals detected:\n\n• Language confidence index: high — decisive forward-looking statements with minimal hedging\n• Guidance raised with explicit numerical targets, removing near-term uncertainty\n• CEO referenced pipeline visibility multiple times, signaling demand clarity\n• CFO gross-margin commentary was constructive — cost discipline intact\n• Q&A responses were direct; no evasiveness on the key growth metrics\n\nOverall sentiment score: ${score}/100 — strong bullish signal. Beat-and-raise narrative is intact heading into the next week of trading.`
    : score >= 48
    ? `Analyzing ${ticker} earnings call...\n\nManagement tone was measured throughout, with a balance of optimism and caution. Key signals detected:\n\n• Language confidence index: neutral — forward-looking statements present but qualified\n• Guidance maintained at the midpoint with macro hedges\n• CEO acknowledged headwinds but framed them as temporary\n• Margin commentary was mixed — cost savings offset by pricing pressure\n• Q&A showed some reluctance on the recovery timeline\n\nOverall sentiment score: ${score}/100 — neutral signal. Stock likely range-bound near-term; watch for macro catalysts.`
    : `Analyzing ${ticker} earnings call...\n\nManagement tone was defensive throughout the call. Key signals detected:\n\n• Language confidence index: low — heavy use of qualifying language and caveats\n• Guidance reduced or withdrawn; visibility acknowledged as poor\n• CEO avoided direct answers on recovery timing in Q&A\n• Restructuring language suggests deeper operational issues\n• Multiple references to "challenging environment" and "elevated uncertainty"\n\nOverall sentiment score: ${score}/100 — bearish signal. Expectations reset underway; any near-term bounce is likely a fade opportunity.`;

  for (const char of analysis) {
    await sleep(12);
    onText(char);
  }
  onDone?.();
}
