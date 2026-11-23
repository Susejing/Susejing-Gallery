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
      var base = sourceId === "safebooru" ? "https://safebooru.org/images" : "https://gelbo.com/images";
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
        "User-Agent": "SusejingGallery/0.4 (Kino plugin)",
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

function isFav(favs, post) {
  if (!post || !Array.isArray(favs)) return false;
  var key = post.sourceId + ":" + post.id;
  return favs.some(function (f) { return f.sourceId + ":" + f.id === key; });
}

function postKey(p) {
  return (p.sourceId || "") + ":" + p.id;
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
  var tab = state.uiTab || "browse";

  if (state.view === "detail" && state.detailPost) {
    var p = state.detailPost;
    var fav = isFav(favs, p);
    var tags = decodeEntities(p.tags || "");
    var fullUrl = p.file || p.sample || p.preview || "";
    var viewUrl = p.file || p.sample || p.preview || "";
    var showTags = state.showTags === true;
    var stretch = state.stretch === true;
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
      { type: "Row", wrap: true, gap: 8, children: actionChildren },
    ];
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
        title: source.name,
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
            ? { type: "Image", url: viewUrl, fit: "cover", flex: 1, alt: "image" }
            : {
                type: "SingleChildScrollView",
                key: "photoView",
                flex: 1,
                zoom: true,
                children: [{ type: "Image", url: viewUrl, fit: "width", alt: "image" }],
              },
          { type: "Column", padding: 12, gap: 8, children: bottomChildren },
        ],
      },
    };
  }

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

  var body = [];
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
          ]
        : tab === "favorites"
          ? [
              {
                type: "Text",
                text: isEs
                  ? "Imágenes guardadas en este aparato"
                  : "Images saved on this device",
                style: "caption",
                color: "muted",
              },
            ]
          : [
              {
                type: "Text",
                text: isEs
                  ? "Últimas imágenes que abriste"
                  : "Recently opened images",
                style: "caption",
                color: "muted",
              },
              {
                type: "Button",
                variant: "text",
                labelText: isEs ? "Vaciar historial" : "Clear history",
                labelTextEn: "Clear history",
                onPressed: "clearHistory",
                enabled: history.length > 0,
              },
            ]
    ),
  });

  var showList = tab === "favorites" ? favs : tab === "history" ? history : posts;

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
  } else if (showList.length === 0) {
    body.push({
      type: "emptyState",
      title:
        tab === "favorites"
          ? isEs
            ? "Sin favoritos"
            : "No favorites"
          : tab === "history"
            ? isEs
              ? "Sin historial"
              : "No history"
            : isEs
              ? "Sin resultados"
              : "No results",
      titleEn:
        tab === "favorites"
          ? "No favorites"
          : tab === "history"
            ? "No history"
            : "No results",
      text:
        tab === "favorites"
          ? isEs
            ? "Marca imágenes con el corazón"
            : "Heart images to see them here"
          : tab === "history"
            ? isEs
              ? "Abre imágenes y aparecerán aquí"
              : "Open images and they will show up here"
            : isEs
              ? "Prueba otros tags o cambia de fuente"
              : "Try different tags or change source",
      textEn:
        tab === "favorites"
          ? "Heart images to see them here"
          : tab === "history"
            ? "Open images and they will show up here"
            : "Try different tags or change source",
      icon: tab === "favorites" ? "heart" : tab === "history" ? "history" : "image",
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
        children: [
          {
            type: "Image",
            url: item.sample || item.preview,
            aspect: "1:1",
            alt: decodeEntities(item.tags || "image").slice(0, 60),
          },
        ],
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
                  ? isEs
                    ? "Cargando..."
                    : "Loading..."
                  : isEs
                    ? "Siguiente"
                    : "Next",
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

  if (name === "open") {
    var favorites = await loadList(FAV_KEY);
    var history = await loadList(HIST_KEY);
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
        uiTab: "browse",
        hasMore: true,
      },
      false
    );
  }
  if (name === "setTab") {
    var t = arg === "favorites" ? "favorites" : arg === "history" ? "history" : "browse";
    return {
      state: Object.assign({}, state, {
        uiTab: t,
        view: null,
        detailPost: null,
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
        hasMore: true,
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
        hasMore: true,
      },
      false
    );
  }
  if (name === "quickTag") {
    var tag = String(arg || "").trim();
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
        hasMore: true,
      },
      false
    );
  }
  if (name === "search") {
    var query = String((state.inputs && state.inputs.search) || state.query || "").trim();
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
        hasMore: true,
      },
      false
    );
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
      });
    if (!post) {
      post =
        (state.posts || []).find(function (p) {
          return p.id === id;
        }) ||
        (state.favorites || []).find(function (p) {
          return p.id === id;
        }) ||
        (state.history || []).find(function (p) {
          return p.id === id;
        });
    }
    if (!post) return null;
    var hist = Array.isArray(state.history) ? state.history.slice() : await loadList(HIST_KEY);
    var hk = postKey(post);
    hist = hist.filter(function (h) {
      return postKey(h) !== hk;
    });
    hist.unshift({
      id: post.id,
      sourceId: post.sourceId || sourceOf(state).id,
      preview: post.preview,
      sample: post.sample,
      file: post.file,
      tags: post.tags || "",
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
    var su = String(arg || "");
    if (!su || su.indexOf("https://") !== 0) {
      return { toast: isEs ? "No hay enlace" : "No link" };
    }
    return {
      share: {
        text: su,
        title: isEs ? "Imagen · Susejing Gallery" : "Image · Susejing Gallery",
      },
    };
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
      ? "Kino solo aplica fondos empaquetados en el plugin (api 26). Se copia la URL para cuando haya soporte online o la empaquetes en Susejing Themes."
      : "Kino only applies packaged backgrounds (api 26). URL copied for when online support lands or you pack it in Susejing Themes.";
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
      var cands = await loadList("themeCandidates");
      if (tu && tu.indexOf("https://") === 0) {
        cands = [{ url: tu, at: Date.now() }].concat(
          cands.filter(function (c) {
            return c.url !== tu;
          })
        );
        await saveList("themeCandidates", cands, 20);
      }
    } catch (_) {}
    return out;
  }
  if (name === "useAsTheme") {
    var url2 = String(arg || "");
    return {
      toast: isEs
        ? "Kino no aplica imágenes online como tema todavía."
        : "Kino cannot apply online images as a theme yet.",
      go:
        url2 && url2.indexOf("https://") === 0
          ? { url: { href: url2, title: isEs ? "Imagen original" : "Original image" } }
          : undefined,
    };
  }
  if (name === "toggleFav") {
    var dp = state.detailPost;
    if (!dp) return null;
    var favsList = Array.isArray(state.favorites)
      ? state.favorites.slice()
      : await loadList(FAV_KEY);
    var fkey = (dp.sourceId || sourceOf(state).id) + ":" + dp.id;
    var idx = -1;
    for (var i = 0; i < favsList.length; i++) {
      if (favsList[i].sourceId + ":" + favsList[i].id === fkey) {
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
      });
      toastMsg = isEs ? "Guardado en favoritos" : "Saved to favorites";
    }
    favsList = await saveList(FAV_KEY, favsList, MAX_FAV);
    return {
      state: Object.assign({}, state, { favorites: favsList }),
      toast: toastMsg,
    };
  }
  return null;
}
