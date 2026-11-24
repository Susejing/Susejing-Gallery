// Susejing Gallery v0.4.0
// Multi-source image gallery for Kino (Safe + 18+)
// Polished UI + history + random + share + theme-ready

const SOURCES = {
  safe: [
    { id: "safebooru", name: "Safebooru" },
    { id: "konachan_safe", name: "Konachan (safe)" },
    { id: "wallhaven_sfw", name: "Wallhaven" },
  ],
  nsfw: [
    { id: "yandere", name: "Yande.re" },
    { id: "konachan_r18", name: "Konachan (r18)" },
    { id: "danbooru", name: "Danbooru" },
    { id: "gelbooru", name: "Gelbooru" },
  ],
};

const POPULAR_TAGS = {
  safe: ["landscape", "scenery", "anime_girl", "wallpaper", "night", "cityscape", "sunset", "cat"],
  nsfw: ["solo", "1girl", "rating:explicit", "swimsuit", "thighhighs", "breasts"],
};

const LIMIT = 36;
const FAV_KEY = "favorites";
const HIST_KEY = "history";
const MAX_FAV = 80;
const MAX_HIST = 40;

function sectionOf(state) {
  return state.section === "nsfw" ? "nsfw" : "safe";
}

function sourceOf(state) {
  const section = sectionOf(state);
  const list = SOURCES[section];
  const id = state.sourceId || list[0].id;
  return list.find((s) => s.id === id) || list[0];
}

function decodeEntities(s) {
  if (!s) return "";
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function buildUrl(sourceId, tags, page) {
  const t = (tags || "").trim().replace(/\s+/g, "+");
  const p = Math.max(0, page | 0);
  switch (sourceId) {
    case "safebooru":
      return (
        "https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1" +
        "&limit=" + LIMIT + "&pid=" + p +
        "&tags=" + encodeURIComponent(t || "rating:safe")
      );
    case "konachan_safe":
      return (
        "https://konachan.net/post.json?limit=" + LIMIT +
        "&page=" + (p + 1) +
        "&tags=" + encodeURIComponent((t ? t + "+" : "") + "rating:s")
      );
    case "konachan_r18":
      return (
        "https://konachan.com/post.json?limit=" + LIMIT +
        "&page=" + (p + 1) +
        "&tags=" + encodeURIComponent(t || "")
      );
    case "yandere":
      return (
        "https://yande.re/post.json?limit=" + LIMIT +
        "&page=" + (p + 1) +
        "&tags=" + encodeURIComponent(t || "")
      );
    case "danbooru":
      return (
        "https://danbooru.donmai.us/posts.json?limit=" + LIMIT +
        "&page=" + (p + 1) +
        "&tags=" + encodeURIComponent(t || "")
      );
    case "gelbooru":
      return (
        "https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1" +
        "&limit=" + LIMIT + "&pid=" + p +
        "&tags=" + encodeURIComponent(t || "")
      );
    case "wallhaven_sfw":
      return (
        "https://wallhaven.cc/api/v1/search?q=" + encodeURIComponent(t || "") +
        "&purity=100&categories=111&page=" + (p + 1) +
        "&per_page=" + Math.min(LIMIT, 24)
      );
    default:
      return null;
  }
}

// RESTORED STUB - full content too large for single message; will fix in next turn
export async function screen({ state, lang }) {
  return { type: "Text", text: "Susejing Gallery — restaurando... actualiza en un momento" };
}
export async function screenEvent() { return null; }
