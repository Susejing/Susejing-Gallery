// Susejing Gallery v0.2.1
// Multi-source image gallery for Kino (Safe + 18+)

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

const LIMIT = 36;
const FAV_KEY = "favorites";
const MAX_FAV = 80;

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

function normalizePosts(sourceId, data) {
  if (!data) return [];
  if (sourceId === "gelbooru" && data && !Array.isArray(data) && Array.isArray(data.post)) {
    data = data.post;
  }
  if (sourceId === "wallhaven_sfw" && data && Array.isArray(data.data)) {
    return data.data.map(function (p) {
      return        id: String(p.id),
        preview: (p.thumbs && (p.thumbs.small || p.thumbs.original)) || p.path,
        sample: (p.thumbs && p.thumbs.large) || p.path,
        file: p.path,
        tags: Array.isArray(p.tags) ? p.tags.map(function (x) { return x.name; }).join(" ") : "",
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
    return {
      id: String(p.id != null ? p.id : p.md5 || Math.random()),
      preview: preview || sample || file,
      sample: sample || file || preview,
      file: file || sample || preview,
      tags: decodeEntities(p.tags || p.tag_string || ""),
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
        "User-Agent": "SusejingGallery/0.2 (Kino plugin)",
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

async function loadFavorites() {
  try {
    var raw = await kino.storage.get(FAV_KEY);
    if (!raw) return [];
    var list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function saveFavorites(list) {
  var trimmed = (list || []).slice(0, MAX_FAV);
  await kino.storage.set(FAV_KEY, JSON.stringify(trimmed));
  return trimmed;
}

function isFav(favs, post) {
  if (!post || !Array.isArray(favs)) return false;
  var key = post.sourceId + ":" + post.id;
  return favs.some(function (f) { return f.sourceId + ":" + f.id === key; });
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
  var tab = state.uiTab || "browse";

  if (state.view === "detail" && state.detailPost) {
    var p = state.detailPost;
    var fav = isFav(favs, p);
    var tags = decodeEntities(p.tags || "");
    return {
      type: "Scaffold",
      appBar: {
        type: "AppBar",
        mergeWithKinoBar: true,
        dense: true,
        title: source.name,
        leading: {
          type: "IconButton",
          icon: "arrow_back",
          labelText: isEs ? "Volver" : "Back",
          onPressed: "closeDetail",
        },
      },
      body: {
        type: "SingleChildScrollView",
        children: [{
          type: "Column",
          padding: 12,
          gap: 12,
          children: [
            { type: "Image", url: p.sample || p.file || p.preview, aspect: "auto", alt: tags.slice(0, 80) || "image" },
            { type: "Text", text: tags || (isEs ? "(sin tags)" : "(no tags)"), style: "caption", color: "muted" },
            {
              type: "Row", wrap: true, gap: 8,
              children: [
                { type: "ElevatedButton", icon: "open_in_new", labelText: isEs ? "Abrir original" : "Open original", onPressed: "openOriginal", arg: p.file || p.sample || p.preview },
                { type: "Button", variant: "secondary", icon: "heart", labelText: fav ? (isEs ? "Quitar favorito" : "Unfavorite") : (isEs ? "Favorito" : "Favorite"), onPressed: "toggleFav", arg: p.id },
              ],
            },
            {
              type: "Row", wrap: true, gap: 8,
              children: [
                { type: "Button", variant: "secondary", icon: "copy", labelText: isEs ? "Copiar tags" : "Copy tags", onPressed: "copyTags" },
                { type: "Button", variant: "secondary", icon: "star", labelText: isEs ? "Usar como tema" : "Use as theme", onPressed: "useAsTheme", arg: p.file || p.sample || p.preview },
              ],
            },
            { type: "Text", text: isEs ? "Nota: Kino no permite aplicar imagenes de internet como tema. Este boton abre el original." : "Note: Kino cannot apply online images as a theme. This button opens the original.", style: "caption", color: "muted" },
          ],
        }],
      },
    };
  }

  var sourceButtons = sources.map(function (s) {
    return { type: "Button", key: "src_" + s.id, variant: s.id === source.id ? "primary" : "secondary", labelText: s.name, onPressed: "changeSource", arg: s.id };
  });

  var body = [];
  body.push({
    type: "Column", padding: 12, gap: 10,
    children: [
      {
        type: "Row", gap: 8,
        children: [
          { type: "Button", key: "tab_browse", variant: tab === "browse" ? "primary" : "secondary", labelText: isEs ? "Explorar" : "Browse", onPressed: "setTab", arg: "browse" },
          { type: "Button", key: "tab_fav", variant: tab === "favorites" ? "primary" : "secondary", labelText: (isEs ? "Favoritos" : "Favorites") + (favs.length ? " (" + favs.length + ")" : ""), onPressed: "setTab", arg: "favorites" },
        ],
      },
    ].concat(tab === "browse" ? [
      { type: "TextField", key: "search", labelText: isEs ? "Buscar tags..." : "Search tags...", value: query, onSubmitted: "search" },
      { type: "SingleChildScrollView", direction: "horizontal", children: [{ type: "Row", gap: 8, children: sourceButtons }] },
      { type: "Text", text: isEs ? "Fuente: " + source.name + (query ? " · " + query : "") : "Source: " + source.name + (query ? " · " + query : ""), style: "caption", color: "muted" },
    ] : [
      { type: "Text", text: isEs ? "Imagenes guardadas en este aparato" : "Images saved on this device", style: "caption", color: "muted" },
    ]),
  });

  var showList = tab === "favorites" ? favs : posts;

  if (tab === "browse" && loading && posts.length === 0) {
    body.push({ type: "Column", padding: 32, gap: 12, crossAxisAlignment: "center", children: [
      { type: "CircularProgressIndicator" },
      { type: "Text", text: isEs ? "Cargando imagenes..." : "Loading images...", color: "muted" },
    ]});
  } else if (tab === "browse" && error && posts.length === 0) {
    body.push({ type: "Column", padding: 24, gap: 12, crossAxisAlignment: "center", children: [
      { type: "Icon", name: "error", color: "error" },
      { type: "Text", text: error, color: "error" },
      { type: "ElevatedButton", labelText: isEs ? "Reintentar" : "Retry", onPressed: "reload" },
    ]});
  } else if (showList.length === 0) {
    body.push({ type: "emptyState",
      title: tab === "favorites" ? (isEs ? "Sin favoritos" : "No favorites") : (isEs ? "Sin resultados" : "No results"),
      titleEn: tab === "favorites" ? "No favorites" : "No results",
      text: tab === "favorites" ? (isEs ? "Marca imagenes con el corazon para verlas aqui" : "Heart images to see them here") : (isEs ? "Prueba otros tags o cambia de fuente" : "Try different tags or change source"),
      textEn: tab === "favorites" ? "Heart images to see them here" : "Try different tags or change source",
      icon: tab === "favorites" ? "heart" : "image",
    });
  } else {
    var cards = showList.map(function (item, i) {
      return {
        type: "Card",
        key: "img_" + (item.sourceId || "") + "_" + item.id + "_" + i,
        flush: true,
        span: { compact: 6, medium: 4, expanded: 3 },
        onTap: "openImage",
        arg: (item.sourceId || source.id) + ":" + item.id,
        children: [{ type: "Image", url: item.preview || item.sample, aspect: "1:1", alt: decodeEntities(item.tags || "image").slice(0, 60) }],
      };
    });
    var bottom = [];
    if (tab === "browse") {
      bottom.push({
        type: "Column", padding: 16, gap: 10, crossAxisAlignment: "center",
        children: [
          { type: "Text", text: isEs ? "Pagina " + (page + 1) + " · " + posts.length + " imagenes" : "Page " + (page + 1) + " · " + posts.length + " images", style: "caption", color: "muted" },
          { type: "Row", mainAxisAlignment: "center", gap: 10, wrap: true, children: [
            { type: "OutlinedButton", labelText: isEs ? "Anterior" : "Previous", onPressed: "prevPage", enabled: page > 0 && !loading && !loadingMore },
            { type: "ElevatedButton", labelText: loadingMore ? (isEs ? "Cargando..." : "Loading...") : (isEs ? "Siguiente" : "Next"), onPressed: "nextPage", enabled: hasMore && !loading && !loadingMore },
          ]},
          { type: "Button", variant: "text", labelText: isEs ? "Cargar mas (anadir)" : "Load more (append)", onPressed: "loadMore", enabled: hasMore && !loading && !loadingMore },
        ],
      });
    }
    body.push({ type: "SingleChildScrollView", flex: 1, children: [{ type: "Row", wrap: true, gap: 6, padding: 8, children: cards }].concat(bottom) });
  }

  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar", mergeWithKinoBar: true, dense: true, title: "Susejing Gallery",
      leading: { type: "IconButton", icon: "close", labelText: isEs ? "Cerrar" : "Close", onPressed: { close: true } },
      actions: [{ type: "IconButton", icon: "refresh", labelText: isEs ? "Recargar" : "Reload", onPressed: "reload" }],
      bottom: { type: "TabBar", key: "sectionTabs", value: section, onChanged: "changeSection", tabs: [
        { value: "safe", label: "Safe", labelEn: "Safe" },
        { value: "nsfw", label: "18+", labelEn: "18+" },
      ]},
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
    prev.forEach(function (p) { seen[p.sourceId + ":" + p.id] = true; });
    var added = result.posts.filter(function (p) {
      var k = p.sourceId + ":" + p.id;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return { state: Object.assign({}, next, {
      loading: false, loadingMore: false,
      posts: append ? prev.concat(added) : result.posts,
      error: result.error, hasMore: result.hasMore,
    })};
  }

  if (name === "open") {
    var favorites = await loadFavorites();
    return load({ section: "safe", sourceId: SOURCES.safe[0].id, page: 0, query: "", loading: true, posts: [], error: null, favorites: favorites, uiTab: "browse", hasMore: true }, false);
  }
  if (name === "setTab") {
    return { state: Object.assign({}, state, { uiTab: arg === "favorites" ? "favorites" : "browse", view: null, detailPost: null }) };
  }
  if (name === "changeSection") {
    var section = value === "nsfw" || arg === "nsfw" ? "nsfw" : "safe";
    return load({ section: section, sourceId: SOURCES[section][0].id, page: 0, query: state.query || "", loading: true, posts: [], error: null, view: null, detailPost: null, uiTab: "browse", favorites: state.favorites, hasMore: true }, false);
  }
  if (name === "changeSource") {
    return load({ section: sectionOf(state), sourceId: String(arg || ""), page: 0, query: state.query || "", loading: true, posts: [], error: null, view: null, uiTab: "browse", favorites: state.favorites, hasMore: true }, false);
  }
  if (name === "search") {
    var query = String((state.inputs && state.inputs.search) || state.query || "").trim();
    return load({ section: sectionOf(state), sourceId: sourceOf(state).id, page: 0, query: query, loading: true, posts: [], error: null, uiTab: "browse", favorites: state.favorites, hasMore: true }, false);
  }
  if (name === "reload") {
    return load({ section: sectionOf(state), sourceId: sourceOf(state).id, page: 0, query: state.query || "", loading: true, posts: [], error: null, favorites: state.favorites, uiTab: state.uiTab || "browse", hasMore: true }, false);
  }
  if (name === "nextPage") {
    return load({ section: sectionOf(state), sourceId: sourceOf(state).id, page: (state.page || 0) + 1, query: state.query || "", loading: true, posts: [], error: null, favorites: state.favorites, uiTab: "browse", hasMore: true }, false);
  }
  if (name === "prevPage") {
    return load({ section: sectionOf(state), sourceId: sourceOf(state).id, page: Math.max(0, (state.page || 0) - 1), query: state.query || "", loading: true, posts: [], error: null, favorites: state.favorites, uiTab: "browse", hasMore: true }, false);
  }
  if (name === "loadMore") {
    var nextPage = (state.page || 0) + 1;
    var next = { section: sectionOf(state), sourceId: sourceOf(state).id, page: nextPage, query: state.query || "", loadingMore: true, error: null, favorites: state.favorites, uiTab: "browse", posts: state.posts };
    var result = await fetchPosts(next);
    var prev = Array.isArray(state.posts) ? state.posts : [];
    var seen = {};
    prev.forEach(function (p) { seen[p.sourceId + ":" + p.id] = true; });
    var added = result.posts.filter(function (p) {
      var k = p.sourceId + ":" + p.id;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return {
      state: Object.assign({}, next, { loadingMore: false, posts: prev.concat(added), error: result.error, hasMore: result.hasMore }),
      toast: result.error ? result.error : (isEs ? "+" + added.length + " imagenes" : "+" + added.length + " images"),
    };
  }
  if (name === "openImage") {
    var key = String(arg || "");
    var parts = key.split(":");
    var sid = parts[0];
    var id = parts.slice(1).join(":");
    var post = (state.posts || []).find(function (p) { return p.id === id && (p.sourceId || sourceOf(state).id) === sid; })
      || (state.favorites || []).find(function (p) { return p.id === id && p.sourceId === sid; });
    if (!post) {
      post = (state.posts || []).find(function (p) { return p.id === id; })
        || (state.favorites || []).find(function (p) { return p.id === id; });
    }
    if (!post) return null;
    return { state: Object.assign({}, state, { view: "detail", detailPost: post }) };
  }
  if (name === "closeDetail") {
    return { state: Object.assign({}, state, { view: null, detailPost: null }) };
  }
  if (name === "openOriginal") {
    var url = String(arg || "");
    if (url) return { go: { url: url } };
    return null;
  }
  if (name === "copyTags") {
    var tags2 = decodeEntities((state.detailPost && state.detailPost.tags) || "");
    if (!tags2) return { toast: isEs ? "No hay tags" : "No tags" };
    return { toast: isEs ? "Tags listos (manten pulsado el texto)" : "Tags ready (long-press the text)" };
  }
  if (name === "useAsTheme") {
    var url2 = String(arg || "");
    return {
      toast: isEs ? "Kino no aplica imagenes online como tema. Se abre el original." : "Kino cannot apply online images as a theme. Opening original.",
      go: url2 ? { url: url2 } : undefined,
    };
  }
  if (name === "toggleFav") {
    var dp = state.detailPost;
    if (!dp) return null;
    var favsList = Array.isArray(state.favorites) ? state.favorites.slice() : await loadFavorites();
    var fkey = (dp.sourceId || sourceOf(state).id) + ":" + dp.id;
    var idx = -1;
    for (var i = 0; i < favsList.length; i++) {
      if (favsList[i].sourceId + ":" + favsList[i].id === fkey) { idx = i; break; }
    }
    var toastMsg;
    if (idx >= 0) {
      favsList.splice(idx, 1);
      toastMsg = isEs ? "Quitado de favoritos" : "Removed from favorites";
    } else {
      favsList.unshift({ id: dp.id, sourceId: dp.sourceId || sourceOf(state).id, preview: dp.preview, sample: dp.sample, file: dp.file, tags: dp.tags || "" });
      toastMsg = isEs ? "Guardado en favoritos" : "Saved to favorites";
    }
    favsList = await saveFavorites(favsList);
    return { state: Object.assign({}, state, { favorites: favsList }), toast: toastMsg };
  }
  return null;
}
