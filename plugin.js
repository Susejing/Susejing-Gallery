// Susejing Gallery v0.5.1
// Multi-source image gallery for Kino (Safe + 18+)
// Collections · Theme candidates · Search in lists · Recent tags · Resolution · Swipe · Share fix · Galgame tags

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
  safe: [
    "landscape", "scenery", "wallpaper", "night", "cityscape", "sunset", "space", "cherry_blossoms",
    "game_cg", "official_art", "key_visual", "visual_novel", "1girl", "solo", "school_uniform",
    "dress", "kimono", "cat_ears", "animal_ears", "sky", "beach", "forest", "rain", "snow"
  ],
  nsfw: [
    "solo", "1girl", "rating:explicit", "game_cg", "official_art", "swimsuit", "thighhighs",
    "breasts", "nude", "ass", "lingerie", "underwear", "sex", "paizuri", "oral"
  ],
};

// Tag aliases: user types these, we rewrite to tags that actually exist on boorus
const TAG_ALIASES = {
  galgames: "game_cg",
  galgame: "game_cg",
  "visual novel": "visual_novel",
  vn: "visual_novel",
  "key art": "key_visual",
  "official art": "official_art",
  cg: "game_cg",
  wallpaper: "wallpaper",
  paisaje: "landscape",
  noche: "night",
  ciudad: "cityscape",
};

const LIMIT = 36;
const FAV_KEY = "favorites";
const HIST_KEY = "history";
const COL_KEY = "collections";
const CAND_KEY = "themeCandidates";
const RECENT_KEY = "recentTags";
const MAX_FAV = 120;
const MAX_HIST = 60;
const MAX_COL = 12;
const MAX_COL_ITEMS = 80;
const MAX_CAND = 30;
const MAX_RECENT = 12;

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

function postKey(p) {
  return (p.sourceId || "") + ":" + p.id;
}

function normalizeQuery(q) {
  var t = String(q || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  var lower = t.toLowerCase();
  if (TAG_ALIASES[lower]) return TAG_ALIASES[lower];
  // multi-word: replace known phrases
  var out = lower;
  Object.keys(TAG_ALIASES).forEach(function (k) {
    if (k.indexOf(" ") !== -1 && out.indexOf(k) !== -1) {
      out = out.split(k).join(TAG_ALIASES[k]);
    }
  });
  // single tokens
  out = out.split(" ").map(function (tok) {
    return TAG_ALIASES[tok] || tok;
  }).join(" ");
  return out.trim();
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

function normalizePosts(sourceId, data) {
  if (!data) return [];
  if (sourceId === "gelbooru" && data && !Array.isArray(data) && Array.isArray(data.post)) {
    data = data.post;
  }
  if (sourceId === "wallhaven_sfw" && data && Array.isArray(data.data)) {
    return data.data.map(function (p) {
      return {
        id: String(p.id),
        preview: (p.thumbs && (p.thumbs.small || p.thumbs.original)) || p.path,
        sample: (p.thumbs && p.thumbs.large) || p.path,
        file: p.path,
        tags: Array.isArray(p.tags) ? p.tags.map(function (x) { return x.name; }).join(" ") : "",
        width: p.dimension_x || p.resolution && parseInt(String(p.resolution).split("x")[0], 10) || null,
        height: p.dimension_y || p.resolution && parseInt(String(p.resolution).split("x")[1], 10) || null,
        sourceId: sourceId,
      };
    });
  }
  if (!Array.isArray(data)) return [];
  return data.map(function (p) {
    var preview = p.preview_url || p.preview_file_url || p.sample_url || p.large_file_url || p.file_url || "";
    var sample = p.sample_url || p.large_file_url || p.file_url || preview;
    var file = p.file_url || p.large_file_url || sample;
    if (!file && p.directory && p.image) {
      var base = sourceId === "safebooru" ? "https://safebooru.org/images" : "https://gelbooru.com/images";
      file = base + "/" + p.directory + "/" + p.image;
      sample = file;
      preview = p.preview_url || file;
    }
    if (sourceId === "danbooru") {
      preview = p.preview_file_url || preview;
      sample = p.large_file_url || sample;
      file = p.file_url || file;
    }
    if (!preview && !sample && !file) return null;
    var w = p.width || p.image_width || null;
    var h = p.height || p.image_height || null;
    return {
      id: String(p.id != null ? p.id : p.md5 || Math.random()),
      preview: preview || sample || file,
      sample: sample || file || preview,
      file: file || sample || preview,
      tags: decodeEntities(p.tags || p.tag_string || ""),
      width: w,
      height: h,
      sourceId: sourceId,
    };
  }).filter(Boolean);
}

async function fetchPosts(state) {
  var source = sourceOf(state);
  var url = buildUrl(source.id, state.query || "", state.page || 0);
  if (!url) return { posts: [], error: "Fuente no soportada", hasMore: false };
  try {
    var res = await kino.fetch(url, {
      headers: {
        "User-Agent": "SusejingGallery/0.5 (Kino plugin)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { posts: [], error: "Error " + res.status + " · " + source.name, hasMore: false };
    }
    var data = await res.json();
    var posts = normalizePosts(source.id, data);
    return { posts: posts, error: null, hasMore: posts.length >= LIMIT - 4 };
  } catch (e) {
    return { posts: [], error: String((e && e.message) || e), hasMore: false };
  }
}

async function loadList(key) {
  try {
    var raw = await kino.storage.get(key);
    if (!raw) return [];
    var list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function saveList(key, list, max) {
  var trimmed = (list || []).slice(0, max);
  await kino.storage.set(key, JSON.stringify(trimmed));
  return trimmed;
}

async function loadCollections() {
  try {
    var raw = await kino.storage.get(COL_KEY);
    if (!raw) return [];
    var list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function saveCollections(cols) {
  var trimmed = (cols || []).slice(0, MAX_COL).map(function (c) {
    return {
      id: c.id,
      name: String(c.name || "Colección").slice(0, 40),
      items: (c.items || []).slice(0, MAX_COL_ITEMS),
    };
  });
  await kino.storage.set(COL_KEY, JSON.stringify(trimmed));
  return trimmed;
}

function isFav(favs, post) {
  if (!post || !Array.isArray(favs)) return false;
  var key = postKey(post);
  return favs.some(function (f) { return postKey(f) === key; });
}

function resLabel(p) {
  if (!p || !p.width || !p.height) return "";
  return p.width + "×" + p.height;
}

function filterList(list, q) {
  if (!q) return list || [];
  var t = String(q).toLowerCase().trim();
  if (!t) return list || [];
  return (list || []).filter(function (p) {
    var tags = (p.tags || "").toLowerCase();
    var id = String(p.id || "");
    return tags.indexOf(t) !== -1 || id.indexOf(t) !== -1;
  });
}

export async function screen({ state, lang }) {
  var isEs = lang !== "en";
  var section = sectionOf(state);
  var source = sourceOf(state);
  var sources = SOURCES[section];
  var posts = Array.isArray(state.posts) ? state.posts : [];
  var loading = state.loading === true;
  var loadingMore = state.loadingMore === true;
  var error = state.error || null;
  var query = state.query || "";
  var page = state.page || 0;
  var hasMore = state.hasMore !== false;
  var favs = Array.isArray(state.favorites) ? state.favorites : [];
  var history = Array.isArray(state.history) ? state.history : [];
  var collections = Array.isArray(state.collections) ? state.collections : [];
  var candidates = Array.isArray(state.candidates) ? state.candidates : [];
  var recentTags = Array.isArray(state.recentTags) ? state.recentTags : [];
  var tab = state.uiTab || "browse";
  var listFilter = state.listFilter || "";
  var activeCol = state.activeCol || null;

  // ---------- DETAIL VIEW ----------
  if (state.view === "detail" && state.detailPost) {
    var p = state.detailPost;
    var fav = isFav(favs, p);
    var tags = decodeEntities(p.tags || "");
    var fullUrl = p.file || p.sample || p.preview || "";
    var viewUrl = p.file || p.sample || p.preview || "";
    var showTags = state.showTags === true;
    var stretch = state.stretch === true;
    var res = resLabel(p);

    var actionChildren = [
      {
        type: "ElevatedButton",
        icon: "open_in_new",
        labelText: isEs ? "Abrir original" : "Open original",
        labelTextEn: "Open original",
        onPressed: fullUrl
          ? { go: { url: { href: fullUrl, title: isEs ? "Imagen original" : "Original image" } } }
          : "openOriginal",
        arg: fullUrl,
      },
      {
        type: "Button",
        variant: "secondary",
        icon: "download",
        labelText: isEs ? "Descargar" : "Download",
        labelTextEn: "Download",
        onPressed: "downloadImage",
        arg: fullUrl,
      },
      {
        type: "Button",
        variant: "secondary",
        icon: "share",
        labelText: isEs ? "Compartir" : "Share",
        labelTextEn: "Share",
        onPressed: "shareImage",
        arg: fullUrl,
      },
      {
        type: "Button",
        variant: "secondary",
        icon: "link",
        labelText: isEs ? "Copiar URL" : "Copy URL",
        labelTextEn: "Copy URL",
        onPressed: "copyUrl",
        arg: fullUrl,
      },
      {
        type: "Button",
        variant: "secondary",
        icon: "heart",
        labelText: fav ? (isEs ? "Quitar" : "Unfav") : (isEs ? "Favorito" : "Favorite"),
        labelTextEn: fav ? "Unfav" : "Favorite",
        onPressed: "toggleFav",
        arg: p.id,
      },
      {
        type: "Button",
        variant: "secondary",
        icon: "folder",
        labelText: isEs ? "A colección" : "To collection",
        labelTextEn: "To collection",
        onPressed: "addToCollection",
      },
      {
        type: "Button",
        variant: "secondary",
        icon: "copy",
        labelText: "Tags",
        labelTextEn: "Tags",
        onPressed: "copyTags",
      },
      {
        type: "Button",
        variant: "text",
        labelText: showTags ? (isEs ? "Ocultar tags" : "Hide tags") : (isEs ? "Ver tags" : "Show tags"),
        labelTextEn: showTags ? "Hide tags" : "Show tags",
        onPressed: "toggleTags",
      },
      {
        type: "Button",
        variant: stretch ? "primary" : "secondary",
        icon: "fullscreen",
        labelText: stretch ? "Normal" : (isEs ? "Estirar pantalla" : "Stretch screen"),
        labelTextEn: stretch ? "Normal" : "Stretch screen",
        onPressed: "toggleStretch",
      },
      {
        type: "Button",
        variant: "text",
        icon: "palette",
        labelText: isEs ? "Listo para tema" : "Theme ready",
        labelTextEn: "Theme ready",
        onPressed: "themeReady",
        arg: fullUrl,
      },
    ];

    var bottomChildren = [
      res
        ? { type: "Text", text: res, style: "caption", color: "muted" }
        : null,
      { type: "Row", wrap: true, gap: 8, children: actionChildren },
    ].filter(Boolean);

    if (showTags) {
      bottomChildren.push({
        type: "Text",
        text: tags || (isEs ? "(sin tags)" : "(no tags)"),
        style: "caption",
        color: "muted",
      });
    }

    bottomChildren.push({
      type: "Button",
      variant: "text",
      icon: "star",
      labelText: isEs ? "Temas de marca Susejing" : "Susejing brand themes",
      labelTextEn: "Susejing brand themes",
      onPressed: { go: { plugin: { repo: "Susejing/Susejing-Themes" } } },
    });

    return {
      type: "Scaffold",
      onBack: "closeDetail",
      appBar: {
        type: "AppBar",
        mergeWithKinoBar: true,
        dense: true,
        divider: false,
        title: source.name + (res ? " · " + res : ""),
        leading: {
          type: "IconButton",
          icon: "arrow_back",
          labelText: isEs ? "Volver" : "Back",
          labelTextEn: "Back",
          onPressed: "closeDetail",
        },
      },
      body: {
        type: "Column",
        children: [
          stretch
            ? {
                type: "Image",
                key: "detailImage",
                url: viewUrl,
                fit: "cover",
                flex: 1,
                alt: "image",
                onSwipeLeft: "swipeNext",
                onSwipeRight: "swipePrev",
              }
            : {
                type: "SingleChildScrollView",
                key: "photoView",
                flex: 1,
                zoom: true,
                children: [{ type: "Image", key: "detailImage", url: viewUrl, fit: "width", alt: "image" }],
                onSwipeLeft: "swipeNext",
                onSwipeRight: "swipePrev",
              },
          { type: "Column", padding: 12, gap: 8, children: bottomChildren },
        ],
      },
    };
  }

  // ---------- MAIN VIEW ----------
  var sourceButtons = sources.map(function (s) {
    return {
      type: "Button",
      key: "src_" + s.id,
      variant: s.id === source.id ? "primary" : "secondary",
      labelText: s.name,
      onPressed: "changeSource",
      arg: s.id,
    };
  });

  var tagChips = (POPULAR_TAGS[section] || []).map(function (tag) {
    return {
      type: "Button",
      key: "tag_" + tag,
      variant: query === tag ? "primary" : "secondary",
      labelText: tag,
      onPressed: "quickTag",
      arg: tag,
    };
  });

  var recentChips = (recentTags || []).slice(0, 8).map(function (tag) {
    return {
      type: "Button",
      key: "rtag_" + tag,
      variant: query === tag ? "primary" : "text",
      labelText: tag,
      onPressed: "quickTag",
      arg: tag,
    };
  });

  var body = [];

  // Tabs
  body.push({
    type: "Column",
    padding: 12,
    gap: 10,
    children: [
      {
        type: "Row",
        gap: 8,
        wrap: true,
        children: [
          {
            type: "Button",
            key: "tab_browse",
            variant: tab === "browse" ? "primary" : "secondary",
            labelText: isEs ? "Explorar" : "Browse",
            labelTextEn: "Browse",
            onPressed: "setTab",
            arg: "browse",
          },
          {
            type: "Button",
            key: "tab_fav",
            variant: tab === "favorites" ? "primary" : "secondary",
            labelText: (isEs ? "Favoritos" : "Favorites") + (favs.length ? " (" + favs.length + ")" : ""),
            labelTextEn: "Favorites",
            onPressed: "setTab",
            arg: "favorites",
          },
          {
            type: "Button",
            key: "tab_hist",
            variant: tab === "history" ? "primary" : "secondary",
            labelText: (isEs ? "Historial" : "History") + (history.length ? " (" + history.length + ")" : ""),
            labelTextEn: "History",
            onPressed: "setTab",
            arg: "history",
          },
          {
            type: "Button",
            key: "tab_col",
            variant: tab === "collections" ? "primary" : "secondary",
            labelText: (isEs ? "Colecciones" : "Collections") + (collections.length ? " (" + collections.length + ")" : ""),
            labelTextEn: "Collections",
            onPressed: "setTab",
            arg: "collections",
          },
          {
            type: "Button",
            key: "tab_cand",
            variant: tab === "candidates" ? "primary" : "secondary",
            labelText: (isEs ? "Para temas" : "Theme ready") + (candidates.length ? " (" + candidates.length + ")" : ""),
            labelTextEn: "Theme ready",
            onPressed: "setTab",
            arg: "candidates",
          },
        ],
      },
    ].concat(
      tab === "browse"
        ? [
            {
              type: "TextField",
              key: "search",
              kind: "search",
              labelText: isEs ? "Buscar tags..." : "Search tags...",
              labelTextEn: "Search tags...",
              value: query,
              onSubmitted: "search",
            },
            {
              type: "SingleChildScrollView",
              direction: "horizontal",
              children: [{ type: "Row", gap: 8, children: sourceButtons }],
            },
            recentChips.length
              ? {
                  type: "SingleChildScrollView",
                  direction: "horizontal",
                  children: [
                    {
                      type: "Row",
                      gap: 6,
                      children: [{ type: "Text", text: isEs ? "Recientes:" : "Recent:", style: "caption", color: "muted" }].concat(recentChips),
                    },
                  ],
                }
              : null,
            {
              type: "SingleChildScrollView",
              direction: "horizontal",
              children: [{ type: "Row", gap: 8, children: tagChips }],
            },
            {
              type: "Row",
              gap: 8,
              wrap: true,
              children: [
                {
                  type: "Button",
                  variant: "secondary",
                  icon: "shuffle",
                  labelText: isEs ? "Aleatorio" : "Random",
                  labelTextEn: "Random",
                  onPressed: "randomPage",
                },
                {
                  type: "Text",
                  text:
                    (isEs ? "Fuente: " : "Source: ") +
                    source.name +
                    (query ? " · " + query : ""),
                  style: "caption",
                  color: "muted",
                },
              ],
            },
            {
              type: "Button",
              variant: "text",
              labelText: isEs ? "Temas de marca Susejing" : "Susejing brand themes",
              labelTextEn: "Susejing brand themes",
              onPressed: { go: { plugin: { repo: "Susejing/Susejing-Themes" } } },
            },
          ].filter(Boolean)
        : tab === "favorites" || tab === "history"
          ? [
              {
                type: "TextField",
                key: "listFilter",
                kind: "search",
                labelText: isEs ? "Filtrar en esta lista..." : "Filter this list...",
                labelTextEn: "Filter this list...",
                value: listFilter,
                onSubmitted: "filterList",
                onChanged: "filterListLive",
              },
              {
                type: "Text",
                text:
                  tab === "favorites"
                    ? isEs
                      ? "Imágenes guardadas en este aparato"
                      : "Images saved on this device"
                    : isEs
                      ? "Últimas imágenes que abriste"
                      : "Recently opened images",
                style: "caption",
                color: "muted",
              },
              tab === "history"
                ? {
                    type: "Button",
                    variant: "text",
                    labelText: isEs ? "Vaciar historial" : "Clear history",
                    labelTextEn: "Clear history",
                    onPressed: "clearHistory",
                    enabled: history.length > 0,
                  }
                : null,
            ].filter(Boolean)
          : tab === "collections"
            ? [
                {
                  type: "Text",
                  text: isEs
                    ? "Crea colecciones y guarda imágenes dentro"
                    : "Create collections and save images inside",
                  style: "caption",
                  color: "muted",
                },
                {
                  type: "TextField",
                  key: "newColName",
                  labelText: isEs ? "Nombre de nueva colección" : "New collection name",
                  labelTextEn: "New collection name",
                  value: (state.inputs && state.inputs.newColName) || "",
                },
                {
                  type: "ElevatedButton",
                  icon: "add",
                  labelText: isEs ? "Crear colección" : "Create collection",
                  labelTextEn: "Create collection",
                  onPressed: "createCollection",
                },
              ]
            : [
                {
                  type: "Text",
                  text: isEs
                    ? "Candidatas a tema. Kino solo aplica fondos empaquetados en el plugin (api 26). Usa «Listo para tema» y luego Susejing Themes, o pide a Kino fondos online."
                    : "Theme candidates. Kino only applies packaged backgrounds (api 26). Use «Theme ready», then Susejing Themes, or ask Kino for online backgrounds.",
                  style: "caption",
                  color: "muted",
                },
                {
                  type: "Button",
                  variant: "text",
                  labelText: isEs ? "Vaciar candidatos" : "Clear candidates",
                  labelTextEn: "Clear candidates",
                  onPressed: "clearCandidates",
                  enabled: candidates.length > 0,
                },
                {
                  type: "Button",
                  variant: "text",
                  icon: "star",
                  labelText: isEs ? "Abrir Susejing Themes" : "Open Susejing Themes",
                  labelTextEn: "Open Susejing Themes",
                  onPressed: { go: { plugin: { repo: "Susejing/Susejing-Themes" } } },
                },
              ]
    ),
  });

  // Content per tab
  var showList = [];
  if (tab === "browse") showList = posts;
  else if (tab === "favorites") showList = filterList(favs, listFilter);
  else if (tab === "history") showList = filterList(history, listFilter);
  else if (tab === "candidates") {
    showList = candidates.map(function (c) {
      return {
        id: c.url,
        sourceId: "cand",
        preview: c.url,
        sample: c.url,
        file: c.url,
        tags: "",
      };
    });
  } else if (tab === "collections") {
    if (activeCol) {
      var col = collections.find(function (c) { return c.id === activeCol; });
      showList = (col && col.items) || [];
    } else {
      // list collections as cards
      if (collections.length === 0) {
        body.push({
          type: "emptyState",
          title: isEs ? "Sin colecciones" : "No collections",
          titleEn: "No collections",
          text: isEs ? "Crea una arriba y luego añade imágenes desde el detalle" : "Create one above, then add images from the detail view",
          textEn: "Create one above, then add images from the detail view",
          icon: "folder",
        });
      } else {
        var colCards = collections.map(function (c) {
          return {
            type: "Card",
            key: "col_" + c.id,
            onTap: "openCollection",
            arg: c.id,
            children: [
              {
                type: "ListTile",
                title: c.name,
                subtitle: (c.items || []).length + (isEs ? " imágenes" : " images"),
                leading: { type: "Icon", name: "folder" },
                trailing: {
                  type: "IconButton",
                  icon: "delete",
                  onPressed: "deleteCollection",
                  arg: c.id,
                },
              },
            ],
          };
        });
        body.push({
          type: "SingleChildScrollView",
          flex: 1,
          children: [{ type: "Column", padding: 8, gap: 8, children: colCards }],
        });
      }
      return {
        type: "Scaffold",
        appBar: {
          type: "AppBar",
          mergeWithKinoBar: true,
          dense: true,
          divider: false,
          title: "Susejing Gallery",
          leading: {
            type: "IconButton",
            icon: "close",
            labelText: isEs ? "Cerrar" : "Close",
            labelTextEn: "Close",
            onPressed: { close: true },
          },
          actions: [
            {
              type: "IconButton",
              icon: "shuffle",
              labelText: isEs ? "Aleatorio" : "Random",
              labelTextEn: "Random",
              onPressed: "randomPage",
            },
            {
              type: "IconButton",
              icon: "refresh",
              labelText: isEs ? "Recargar" : "Reload",
              labelTextEn: "Reload",
              onPressed: "reload",
            },
          ],
          bottom: {
            type: "TabBar",
            key: "sectionTabs",
            value: section,
            onChanged: "changeSection",
            tabs: [
              { value: "safe", label: "Safe", labelEn: "Safe" },
              { value: "nsfw", label: "18+", labelEn: "18+" },
            ],
          },
        },
        body: { type: "Column", children: body },
      };
    }
  }

  if (tab === "browse" && loading && posts.length === 0) {
    body.push({
      type: "Column",
      padding: 32,
      gap: 12,
      crossAxisAlignment: "center",
      children: [
        { type: "CircularProgressIndicator" },
        {
          type: "Text",
          text: isEs ? "Cargando imágenes..." : "Loading images...",
          color: "muted",
        },
        {
          type: "Text",
          text: source.name + (query ? " · " + query : ""),
          style: "caption",
          color: "muted",
        },
      ],
    });
  } else if (tab === "browse" && error && posts.length === 0) {
    body.push({
      type: "Column",
      padding: 24,
      gap: 12,
      crossAxisAlignment: "center",
      children: [
        { type: "Icon", name: "error", color: "error" },
        { type: "Text", text: error, color: "error" },
        {
          type: "ElevatedButton",
          labelText: isEs ? "Reintentar" : "Retry",
          labelTextEn: "Retry",
          onPressed: "reload",
        },
      ],
    });
  } else if (showList.length === 0 && tab !== "collections") {
    body.push({
      type: "emptyState",
      title:
        tab === "favorites"
          ? isEs ? "Sin favoritos" : "No favorites"
          : tab === "history"
            ? isEs ? "Sin historial" : "No history"
            : tab === "candidates"
              ? isEs ? "Sin candidatos" : "No candidates"
              : isEs ? "Sin resultados" : "No results",
      titleEn:
        tab === "favorites"
          ? "No favorites"
          : tab === "history"
            ? "No history"
            : tab === "candidates"
              ? "No candidates"
              : "No results",
      text:
        tab === "favorites"
          ? isEs ? "Marca imágenes con el corazón" : "Heart images to see them here"
          : tab === "history"
            ? isEs ? "Abre imágenes y aparecerán aquí" : "Open images and they will show up here"
            : tab === "candidates"
              ? isEs ? "Marca imágenes con «Listo para tema»" : "Mark images with «Theme ready»"
              : isEs ? "Prueba game_cg, official_art, key_visual, visual_novel, landscape… (galgames casi no existe como tag)" : "Try game_cg, official_art, key_visual, visual_novel, landscape… (galgames is rarely a tag)",
      textEn:
        tab === "favorites"
          ? "Heart images to see them here"
          : tab === "history"
            ? "Open images and they will show up here"
            : tab === "candidates"
              ? "Mark images with «Theme ready»"
              : "Try game_cg, official_art, key_visual, visual_novel, landscape…",
      icon: tab === "favorites" ? "heart" : tab === "history" ? "history" : tab === "candidates" ? "palette" : "image",
    });
  } else if (showList.length > 0) {
    var cards = showList.map(function (item, i) {
      var r = resLabel(item);
      return {
        type: "Card",
        key: "img_" + (item.sourceId || "") + "_" + item.id + "_" + i,
        flush: true,
        span: { compact: 6, medium: 4, expanded: 3 },
        onTap: "openImage",
        arg: (item.sourceId || source.id) + ":" + item.id,
        children: [
          {
            type: "Image",
            url: item.sample || item.preview || item.file,
            aspect: "1:1",
            alt: decodeEntities(item.tags || "image").slice(0, 60),
          },
          r
            ? {
                type: "Text",
                text: r,
                style: "caption",
                color: "muted",
                padding: 4,
              }
            : null,
        ].filter(Boolean),
      };
    });

    var bottom = [];
    if (tab === "browse") {
      bottom.push({
        type: "Column",
        padding: 16,
        gap: 10,
        crossAxisAlignment: "center",
        children: [
          {
            type: "Text",
            text:
              (isEs ? "Página " : "Page ") +
              (page + 1) +
              " · " +
              posts.length +
              (isEs ? " imágenes" : " images"),
            style: "caption",
            color: "muted",
          },
          {
            type: "Row",
            mainAxisAlignment: "center",
            gap: 10,
            wrap: true,
            children: [
              {
                type: "OutlinedButton",
                labelText: isEs ? "Anterior" : "Previous",
                labelTextEn: "Previous",
                onPressed: "prevPage",
                enabled: page > 0 && !loading && !loadingMore,
              },
              {
                type: "ElevatedButton",
                labelText: loadingMore
                  ? isEs ? "Cargando..." : "Loading..."
                  : isEs ? "Siguiente" : "Next",
                labelTextEn: "Next",
                onPressed: "nextPage",
                enabled: hasMore && !loading && !loadingMore,
              },
            ],
          },
          {
            type: "Button",
            variant: "text",
            labelText: isEs ? "Cargar más (añadir)" : "Load more (append)",
            labelTextEn: "Load more (append)",
            onPressed: "loadMore",
            enabled: hasMore && !loading && !loadingMore,
          },
        ],
      });
    } else if (tab === "collections" && activeCol) {
      bottom.push({
        type: "Column",
        padding: 12,
        children: [
          {
            type: "Button",
            variant: "text",
            icon: "arrow_back",
            labelText: isEs ? "Volver a colecciones" : "Back to collections",
            labelTextEn: "Back to collections",
            onPressed: "closeCollection",
          },
        ],
      });
    }

    body.push({
      type: "SingleChildScrollView",
      flex: 1,
      children: [{ type: "Row", wrap: true, gap: 6, padding: 8, children: cards }].concat(bottom),
    });
  }

  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      title: "Susejing Gallery",
      leading: {
        type: "IconButton",
        icon: "close",
        labelText: isEs ? "Cerrar" : "Close",
        labelTextEn: "Close",
        onPressed: { close: true },
      },
      actions: [
        {
          type: "IconButton",
          icon: "shuffle",
          labelText: isEs ? "Aleatorio" : "Random",
          labelTextEn: "Random",
          onPressed: "randomPage",
        },
        {
          type: "IconButton",
          icon: "refresh",
          labelText: isEs ? "Recargar" : "Reload",
          labelTextEn: "Reload",
          onPressed: "reload",
        },
      ],
      bottom: {
        type: "TabBar",
        key: "sectionTabs",
        value: section,
        onChanged: "changeSection",
        tabs: [
          { value: "safe", label: "Safe", labelEn: "Safe" },
          { value: "nsfw", label: "18+", labelEn: "18+" },
        ],
      },
    },
    body: { type: "Column", children: body },
  };
}

export async function screenEvent({ name, arg, value, state, lang }) {
  var isEs = lang !== "en";

  async function load(next, append) {
    var result = await fetchPosts(next);
    var prev = append && Array.isArray(state.posts) ? state.posts : [];
    var seen = {};
    prev.forEach(function (p) {
      seen[p.sourceId + ":" + p.id] = true;
    });
    var added = result.posts.filter(function (p) {
      var k = p.sourceId + ":" + p.id;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return {
      state: Object.assign({}, next, {
        loading: false,
        loadingMore: false,
        posts: append ? prev.concat(added) : result.posts,
        error: result.error,
        hasMore: result.hasMore,
      }),
    };
  }

  async function pushRecent(tag) {
    if (!tag || tag.length < 2) return state.recentTags || [];
    var list = Array.isArray(state.recentTags) ? state.recentTags.slice() : await loadList(RECENT_KEY);
    list = [tag].concat(list.filter(function (t) { return t !== tag; })).slice(0, MAX_RECENT);
    await saveList(RECENT_KEY, list, MAX_RECENT);
    return list;
  }

  if (name === "open") {
    var favorites = await loadList(FAV_KEY);
    var history = await loadList(HIST_KEY);
    var collections = await loadCollections();
    var candidates = await loadList(CAND_KEY);
    var recentTags = await loadList(RECENT_KEY);
    return load(
      {
        section: "safe",
        sourceId: SOURCES.safe[0].id,
        page: 0,
        query: "",
        loading: true,
        posts: [],
        error: null,
        favorites: favorites,
        history: history,
        collections: collections,
        candidates: candidates,
        recentTags: recentTags,
        uiTab: "browse",
        hasMore: true,
        listFilter: "",
        activeCol: null,
      },
      false
    );
  }

  if (name === "setTab") {
    var t = ["favorites", "history", "collections", "candidates"].indexOf(arg) >= 0 ? arg : "browse";
    return {
      state: Object.assign({}, state, {
        uiTab: t,
        view: null,
        detailPost: null,
        listFilter: "",
        activeCol: null,
      }),
    };
  }

  if (name === "changeSection") {
    var section = value === "nsfw" || arg === "nsfw" ? "nsfw" : "safe";
    return load(
      {
        section: section,
        sourceId: SOURCES[section][0].id,
        page: 0,
        query: state.query || "",
        loading: true,
        posts: [],
        error: null,
        view: null,
        detailPost: null,
        uiTab: "browse",
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: state.recentTags,
        hasMore: true,
        listFilter: "",
        activeCol: null,
      },
      false
    );
  }

  if (name === "changeSource") {
    return load(
      {
        section: sectionOf(state),
        sourceId: String(arg || ""),
        page: 0,
        query: state.query || "",
        loading: true,
        posts: [],
        error: null,
        view: null,
        uiTab: "browse",
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: state.recentTags,
        hasMore: true,
      },
      false
    );
  }

  if (name === "quickTag") {
    var tag = normalizeQuery(String(arg || "").trim());
    var rt = await pushRecent(tag);
    return load(
      {
        section: sectionOf(state),
        sourceId: sourceOf(state).id,
        page: 0,
        query: tag,
        loading: true,
        posts: [],
        error: null,
        uiTab: "browse",
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: rt,
        hasMore: true,
      },
      false
    );
  }

  if (name === "search") {
    var query = normalizeQuery(String((state.inputs && state.inputs.search) || state.query || "").trim());
    var rt2 = await pushRecent(query);
    return load(
      {
        section: sectionOf(state),
        sourceId: sourceOf(state).id,
        page: 0,
        query: query,
        loading: true,
        posts: [],
        error: null,
        uiTab: "browse",
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: rt2,
        hasMore: true,
      },
      false
    );
  }

  if (name === "filterList" || name === "filterListLive") {
    var fq = String(
      (state.inputs && (state.inputs.listFilter || state.inputs.search)) || arg || ""
    ).trim();
    return { state: Object.assign({}, state, { listFilter: fq }) };
  }

  if (name === "reload") {
    return load(
      {
        section: sectionOf(state),
        sourceId: sourceOf(state).id,
        page: 0,
        query: state.query || "",
        loading: true,
        posts: [],
        error: null,
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: state.recentTags,
        uiTab: state.uiTab || "browse",
        hasMore: true,
      },
      false
    );
  }

  if (name === "randomPage") {
    var rnd = Math.floor(Math.random() * 40);
    return load(
      {
        section: sectionOf(state),
        sourceId: sourceOf(state).id,
        page: rnd,
        query: state.query || "",
        loading: true,
        posts: [],
        error: null,
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: state.recentTags,
        uiTab: "browse",
        hasMore: true,
      },
      false
    );
  }

  if (name === "nextPage") {
    return load(
      {
        section: sectionOf(state),
        sourceId: sourceOf(state).id,
        page: (state.page || 0) + 1,
        query: state.query || "",
        loading: true,
        posts: [],
        error: null,
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: state.recentTags,
        uiTab: "browse",
        hasMore: true,
      },
      false
    );
  }

  if (name === "prevPage") {
    return load(
      {
        section: sectionOf(state),
        sourceId: sourceOf(state).id,
        page: Math.max(0, (state.page || 0) - 1),
        query: state.query || "",
        loading: true,
        posts: [],
        error: null,
        favorites: state.favorites,
        history: state.history,
        collections: state.collections,
        candidates: state.candidates,
        recentTags: state.recentTags,
        uiTab: "browse",
        hasMore: true,
      },
      false
    );
  }

  if (name === "loadMore") {
    var nextPage = (state.page || 0) + 1;
    var next = {
      section: sectionOf(state),
      sourceId: sourceOf(state).id,
      page: nextPage,
      query: state.query || "",
      loadingMore: true,
      error: null,
      favorites: state.favorites,
      history: state.history,
      collections: state.collections,
      candidates: state.candidates,
      recentTags: state.recentTags,
      uiTab: "browse",
      posts: state.posts,
    };
    var result = await fetchPosts(next);
    var prev = Array.isArray(state.posts) ? state.posts : [];
    var seen = {};
    prev.forEach(function (p) {
      seen[p.sourceId + ":" + p.id] = true;
    });
    var added = result.posts.filter(function (p) {
      var k = p.sourceId + ":" + p.id;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return {
      state: Object.assign({}, next, {
        loadingMore: false,
        posts: prev.concat(added),
        error: result.error,
        hasMore: result.hasMore,
      }),
      toast: result.error
        ? result.error
        : isEs
          ? "+" + added.length + " imágenes"
          : "+" + added.length + " images",
    };
  }

  if (name === "openImage") {
    var key = String(arg || "");
    var parts = key.split(":");
    var sid = parts[0];
    var id = parts.slice(1).join(":");
    var post =
      (state.posts || []).find(function (p) {
        return p.id === id && (p.sourceId || sourceOf(state).id) === sid;
      }) ||
      (state.favorites || []).find(function (p) {
        return p.id === id && p.sourceId === sid;
      }) ||
      (state.history || []).find(function (p) {
        return p.id === id && p.sourceId === sid;
      }) ||
      (function () {
        var cols = state.collections || [];
        for (var i = 0; i < cols.length; i++) {
          var found = (cols[i].items || []).find(function (p) {
            return p.id === id && p.sourceId === sid;
          });
          if (found) return found;
        }
        return null;
      })();

    if (!post && sid === "cand") {
      post = {
        id: id,
        sourceId: "cand",
        preview: id,
        sample: id,
        file: id,
        tags: "",
      };
    }
    if (!post) {
      post =
        (state.posts || []).find(function (p) { return p.id === id; }) ||
        (state.favorites || []).find(function (p) { return p.id === id; }) ||
        (state.history || []).find(function (p) { return p.id === id; });
    }
    if (!post) return null;

    var hist = Array.isArray(state.history) ? state.history.slice() : await loadList(HIST_KEY);
    var hk = postKey(post);
    hist = hist.filter(function (h) { return postKey(h) !== hk; });
    hist.unshift({
      id: post.id,
      sourceId: post.sourceId || sourceOf(state).id,
      preview: post.preview,
      sample: post.sample,
      file: post.file,
      tags: post.tags || "",
      width: post.width || null,
      height: post.height || null,
    });
    hist = await saveList(HIST_KEY, hist, MAX_HIST);
    return {
      state: Object.assign({}, state, {
        view: "detail",
        detailPost: post,
        showTags: false,
        stretch: false,
        history: hist,
      }),
      ui: [{ fullscreen: true }],
    };
  }

  if (name === "closeDetail") {
    return {
      state: Object.assign({}, state, {
        view: null,
        detailPost: null,
        showTags: false,
        stretch: false,
      }),
      ui: [{ fullscreen: false }],
    };
  }

  if (name === "toggleTags") {
    return { state: Object.assign({}, state, { showTags: state.showTags !== true }) };
  }
  if (name === "toggleStretch") {
    return { state: Object.assign({}, state, { stretch: state.stretch !== true }) };
  }

  if (name === "clearHistory") {
    await saveList(HIST_KEY, [], MAX_HIST);
    return {
      state: Object.assign({}, state, { history: [] }),
      toast: isEs ? "Historial vacío" : "History cleared",
    };
  }

  if (name === "clearCandidates") {
    await saveList(CAND_KEY, [], MAX_CAND);
    return {
      state: Object.assign({}, state, { candidates: [] }),
      toast: isEs ? "Candidatos vaciados" : "Candidates cleared",
    };
  }

  if (name === "downloadImage") {
    var dl = String(arg || "");
    if (!dl || dl.indexOf("https://") !== 0) {
      return { toast: isEs ? "No hay enlace de descarga" : "No download link" };
    }
    return {
      toast: isEs
        ? "Abriendo original. Mantén pulsada la imagen y elige Guardar."
        : "Opening original. Long-press the image and choose Save.",
      go: { url: { href: dl, title: isEs ? "Descargar imagen" : "Download image" } },
    };
  }

  if (name === "shareImage") {
    // Kino screen share: draws a node (by key) as image and opens the system share sheet.
    // Text/URL share is not supported; we also copy the URL as fallback.
    var su = String(arg || "");
    var out = {
      share: { key: "detailImage" },
    };
    if (su && su.indexOf("https://") === 0) {
      out.go = {
        copy: {
          text: su.slice(0, 500),
          label: isEs ? "URL de la imagen" : "Image URL",
        },
      };
      out.toast = isEs
        ? "Abriendo compartir… (la URL también se copió)"
        : "Opening share… (URL also copied)";
    }
    return out;
  }

  if (name === "copyUrl") {
    var cu = String(arg || "");
    if (!cu || cu.indexOf("https://") !== 0) {
      return { toast: isEs ? "No hay URL" : "No URL" };
    }
    return {
      go: { copy: { text: cu.slice(0, 500), label: isEs ? "URL de la imagen" : "Image URL" } },
    };
  }

  if (name === "openOriginal") {
    var url = String(arg || "");
    if (!url || url.indexOf("https://") !== 0) {
      return { toast: isEs ? "No hay enlace" : "No link" };
    }
    return {
      go: { url: { href: url, title: isEs ? "Imagen original" : "Original image" } },
    };
  }

  if (name === "copyTags") {
    var tags2 = decodeEntities((state.detailPost && state.detailPost.tags) || "");
    if (!tags2) return { toast: isEs ? "No hay tags" : "No tags" };
    return {
      go: { copy: { text: tags2.slice(0, 500), label: "Tags" } },
    };
  }

  if (name === "themeReady") {
    var tu = String(arg || "");
    var msg = isEs
      ? "URL guardada como candidata a tema. Cuando Kino soporte fondos online o empaquetes la imagen en Susejing Themes (api 26) podrás aplicarla."
      : "URL saved as theme candidate. When Kino supports online backgrounds or you pack the image in Susejing Themes (api 26) you can apply it.";
    var out = { toast: msg };
    if (tu && tu.indexOf("https://") === 0) {
      out.go = {
        copy: {
          text: tu.slice(0, 500),
          label: isEs ? "URL para tema" : "Theme URL",
        },
      };
    }
    try {
      var cands = await loadList(CAND_KEY);
      if (tu && tu.indexOf("https://") === 0) {
        cands = [{ url: tu, at: Date.now() }].concat(
          cands.filter(function (c) { return c.url !== tu; })
        );
        cands = await saveList(CAND_KEY, cands, MAX_CAND);
      }
      out.state = Object.assign({}, state, { candidates: cands });
    } catch (_) {}
    return out;
  }

  if (name === "toggleFav") {
    var dp = state.detailPost;
    if (!dp) return null;
    var favsList = Array.isArray(state.favorites)
      ? state.favorites.slice()
      : await loadList(FAV_KEY);
    var fkey = postKey(dp);
    var idx = -1;
    for (var i = 0; i < favsList.length; i++) {
      if (postKey(favsList[i]) === fkey) {
        idx = i;
        break;
      }
    }
    var toastMsg;
    if (idx >= 0) {
      favsList.splice(idx, 1);
      toastMsg = isEs ? "Quitado de favoritos" : "Removed from favorites";
    } else {
      favsList.unshift({
        id: dp.id,
        sourceId: dp.sourceId || sourceOf(state).id,
        preview: dp.preview,
        sample: dp.sample,
        file: dp.file,
        tags: dp.tags || "",
        width: dp.width || null,
        height: dp.height || null,
      });
      toastMsg = isEs ? "Guardado en favoritos" : "Saved to favorites";
    }
    favsList = await saveList(FAV_KEY, favsList, MAX_FAV);
    return {
      state: Object.assign({}, state, { favorites: favsList }),
      toast: toastMsg,
    };
  }

  // Collections
  if (name === "createCollection") {
    var name = String((state.inputs && state.inputs.newColName) || "").trim().slice(0, 40);
    if (!name) {
      return { toast: isEs ? "Escribe un nombre" : "Enter a name" };
    }
    var cols = Array.isArray(state.collections) ? state.collections.slice() : await loadCollections();
    if (cols.length >= MAX_COL) {
      return { toast: isEs ? "Máximo " + MAX_COL + " colecciones" : "Max " + MAX_COL + " collections" };
    }
    var nid = "c" + Date.now().toString(36);
    cols.unshift({ id: nid, name: name, items: [] });
    cols = await saveCollections(cols);
    return {
      state: Object.assign({}, state, {
        collections: cols,
        inputs: Object.assign({}, state.inputs || {}, { newColName: "" }),
      }),
      toast: isEs ? "Colección creada" : "Collection created",
    };
  }

  if (name === "openCollection") {
    return {
      state: Object.assign({}, state, { activeCol: String(arg || ""), uiTab: "collections" }),
    };
  }

  if (name === "closeCollection") {
    return { state: Object.assign({}, state, { activeCol: null }) };
  }

  if (name === "deleteCollection") {
    var did = String(arg || "");
    var cols2 = (Array.isArray(state.collections) ? state.collections : await loadCollections()).filter(
      function (c) { return c.id !== did; }
    );
    cols2 = await saveCollections(cols2);
    return {
      state: Object.assign({}, state, {
        collections: cols2,
        activeCol: state.activeCol === did ? null : state.activeCol,
      }),
      toast: isEs ? "Colección eliminada" : "Collection deleted",
    };
  }

  if (name === "addToCollection") {
    var dp2 = state.detailPost;
    if (!dp2) return null;
    var cols3 = Array.isArray(state.collections) ? state.collections.slice() : await loadCollections();
    if (cols3.length === 0) {
      return {
        toast: isEs
          ? "Crea primero una colección en la pestaña Colecciones"
          : "Create a collection first in the Collections tab",
      };
    }
    // Add to the first collection (or the active one if set)
    var targetId = state.activeCol || cols3[0].id;
    var changed = false;
    cols3 = cols3.map(function (c) {
      if (c.id !== targetId) return c;
      var items = (c.items || []).slice();
      var k = postKey(dp2);
      if (items.some(function (it) { return postKey(it) === k; })) {
        return c;
      }
      items.unshift({
        id: dp2.id,
        sourceId: dp2.sourceId || sourceOf(state).id,
        preview: dp2.preview,
        sample: dp2.sample,
        file: dp2.file,
        tags: dp2.tags || "",
        width: dp2.width || null,
        height: dp2.height || null,
      });
      changed = true;
      return { id: c.id, name: c.name, items: items.slice(0, MAX_COL_ITEMS) };
    });
    if (!changed) {
      return { toast: isEs ? "Ya está en la colección" : "Already in the collection" };
    }
    cols3 = await saveCollections(cols3);
    var colName = (cols3.find(function (c) { return c.id === targetId; }) || {}).name || "";
    return {
      state: Object.assign({}, state, { collections: cols3 }),
      toast: isEs ? "Añadida a «" + colName + "»" : "Added to «" + colName + "»",
    };
  }

  // Swipe next/prev in detail (best-effort within current list)
  if (name === "swipeNext" || name === "swipePrev") {
    var dp3 = state.detailPost;
    if (!dp3) return null;
    var list =
      state.uiTab === "favorites"
        ? state.favorites || []
        : state.uiTab === "history"
          ? state.history || []
          : state.posts || [];
    if (!list.length) return null;
    var idx2 = -1;
    var k2 = postKey(dp3);
    for (var j = 0; j < list.length; j++) {
      if (postKey(list[j]) === k2) {
        idx2 = j;
        break;
      }
    }
    if (idx2 < 0) return null;
    var nextIdx = name === "swipeNext" ? idx2 + 1 : idx2 - 1;
    if (nextIdx < 0 || nextIdx >= list.length) {
      return { toast: isEs ? "Fin de la lista" : "End of list" };
    }
    var np = list[nextIdx];
    return {
      state: Object.assign({}, state, {
        detailPost: np,
        showTags: false,
      }),
    };
  }

  return null;
}
