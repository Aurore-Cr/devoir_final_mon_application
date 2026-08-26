"use strict";
const RSSParser = require("rss-parser");
const parser = new RSSParser({
  timeout: 8000,
  headers: { "User-Agent": "James/2.0" },
});
const CACHE_TTL = 3600000;
let _cache = null;

const CATS = [
  {
    key: "dev",
    label: "Développement Web",
    emoji: "💻",
    color: "#58a6ff",
    quota: 2,
    feeds: [
      { url: "https://www.developpez.com/index/rss", name: "Developpez.com" },
      { url: "https://korben.info/feed", name: "Korben" },
      { url: "https://next.ink/feed/", name: "Next.ink" },
    ],
  },
  {
    key: "ia",
    label: "Intelligence Artificielle",
    emoji: "🧠",
    color: "#bc8cff",
    quota: 2,
    feeds: [
      {
        url: "https://www.lemondeinformatique.fr/flux-rss/thematique-intelligence-artificielle-31.xml",
        name: "LMI-IA",
      },
      { url: "https://korben.info/feed", name: "Korben" },
    ],
  },
  {
    key: "cyber",
    label: "Cybersécurité",
    emoji: "🔒",
    color: "#f85149",
    quota: 2,
    feeds: [
      { url: "https://www.zataz.com/feed/", name: "ZATAZ" },
      { url: "https://www.undernews.fr/feed", name: "Undernews" },
    ],
  },
  {
    key: "general",
    label: "Tech & Informatique",
    emoji: "🖥️",
    color: "#3fb950",
    quota: 2,
    feeds: [
      {
        url: "https://www.lemondeinformatique.fr/flux-rss/toute-l-actualite-31.xml",
        name: "LMI",
      },
      { url: "https://next.ink/feed/", name: "Next.ink" },
    ],
  },
];

const KW = {
  dev: [
    "javascript",
    "typescript",
    "react",
    "vue",
    "angular",
    "node",
    "css",
    "html",
    "api",
    "docker",
    "php",
  ],
  ia: [
    "intelligence artificielle",
    "ia ",
    "machine learning",
    "llm",
    "chatgpt",
    "gemini",
    "openai",
  ],
  cyber: [
    "sécurité",
    "cybersécurité",
    "hack",
    "malware",
    "ransomware",
    "vulnérabilité",
    "faille",
  ],
  general: [
    "microsoft",
    "apple",
    "google",
    "cloud",
    "smartphone",
    "processeur",
    "nvidia",
    "startup",
    "tech",
  ],
};

const FALLBACK = {
  dev: [
    {
      title: "JavaScript ES2024 — Nouvelles fonctionnalités",
      url: "https://developer.mozilla.org/fr/docs/Web/JavaScript",
      sourceName: "MDN",
      pubDate: new Date().toISOString(),
    },
    {
      title: "CSS Grid vs Flexbox — Choisir le bon outil",
      url: "https://css-tricks.com/snippets/css/complete-guide-grid/",
      sourceName: "CSS-Tricks",
      pubDate: new Date().toISOString(),
    },
  ],
  ia: [
    {
      title: "Guide Google Gemini API pour développeurs",
      url: "https://ai.google.dev/docs",
      sourceName: "Google AI",
      pubDate: new Date().toISOString(),
    },
    {
      title: "LLM et développement web — État de l'art",
      url: "https://dev.to/t/ai",
      sourceName: "Dev.to",
      pubDate: new Date().toISOString(),
    },
  ],
  cyber: [
    {
      title: "OWASP Top 10 — Vulnérabilités web critiques",
      url: "https://owasp.org/www-project-top-ten/",
      sourceName: "OWASP",
      pubDate: new Date().toISOString(),
    },
    {
      title: "JWT — Bonnes pratiques de sécurité",
      url: "https://jwt.io/introduction",
      sourceName: "jwt.io",
      pubDate: new Date().toISOString(),
    },
  ],
  general: [
    {
      title: "Node.js LTS — Nouvelles fonctionnalités",
      url: "https://nodejs.org/fr/blog",
      sourceName: "Node.js Blog",
      pubDate: new Date().toISOString(),
    },
    {
      title: "Docker — Optimiser son environnement dev",
      url: "https://docs.docker.com/get-started/",
      sourceName: "Docker",
      pubDate: new Date().toISOString(),
    },
  ],
};

function strip(s) {
  return (s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function score(a, k) {
  const t = (a.title + " " + (a.summary || "")).toLowerCase();
  return (
    (KW[k] || []).filter((w) => t.includes(w)).length * 5 +
    Math.max(0, 10 - (Date.now() - new Date(a.pubDate).getTime()) / 86400000)
  );
}

async function fetchFeed(feed) {
  try {
    const d = await parser.parseURL(feed.url);
    return (d.items || [])
      .filter((i) => i.title && (i.link || i.guid))
      .map((i) => ({
        title: strip(i.title),
        url: i.link || i.guid,
        sourceName: feed.name,
        pubDate: i.isoDate || i.pubDate || new Date().toISOString(),
        summary: strip(i.contentSnippet || i.summary || "").slice(0, 180),
      }));
  } catch (e) {
    console.warn("[Veille]", feed.name, ":", e.message);
    return [];
  }
}

async function buildReport() {
  const t0 = Date.now();
  const cats = await Promise.all(
    CATS.map(async (cat) => {
      const items = (await Promise.all(cat.feeds.map(fetchFeed))).flat();
      const seen = new Set();
      const unique = items.filter((a) => {
        const k = a.title.toLowerCase().slice(0, 50);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const arts = unique
        .map((a) => ({ ...a, score: score(a, cat.key) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, cat.quota);
      return {
        key: cat.key,
        label: cat.label,
        emoji: cat.emoji,
        color: cat.color,
        articles: arts.length > 0 ? arts : FALLBACK[cat.key] || [],
      };
    }),
  );
  console.log(
    "[Veille] ✅",
    cats.reduce((s, c) => s + c.articles.length, 0),
    "articles —",
    Date.now() - t0,
    "ms",
  );
  return { generatedAt: new Date().toISOString(), categories: cats };
}

async function getVeilleReport(force) {
  const now = Date.now();
  if (!force && _cache && _cache.expiresAt > now) return _cache.data;
  try {
    const data = await buildReport();
    _cache = { data, fetchedAt: now, expiresAt: now + CACHE_TTL };
    return data;
  } catch (e) {
    console.error("[Veille]", e.message);
    if (_cache) return _cache.data;
    return {
      generatedAt: new Date().toISOString(),
      categories: CATS.map((c) => ({ ...c, articles: FALLBACK[c.key] || [] })),
    };
  }
}

async function prefetchReport() {
  try {
    await getVeilleReport(true);
  } catch (e) {
    console.error("[Veille prefetch]", e.message);
  }
}
module.exports = { getVeilleReport, prefetchReport };
