// Susejing Gallery v0.2.0
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
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'");
}

function buildUrl(sourceId, tags, page) {
  const t = (tags || "").trim().replace(/\s+/g, "+");
  const p = Math.max(0, page | 0);

  switch (sourceId) {
    case "safebooru":
      return (
        "https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1" +
        `&limit=${LIMIT}&pid=${p}&tags=${encodeURIComponent(t || "rating:safe")}`
      );
    case "konachan_safe":
      return (
        `https://konachan.net/post.json?limit=${LIMIT}&page=${p + 1}` +
        `&tags=${encodeURIComponent((t ? t + "+" : "") + "rating:s")}`
      );
    case "konachan_r18":
      return `https://konachan.com/post.json?limit=${LIMIT}&page=${p + 1}&tags=${encodeURIComponent(t || "")}`;
    case "yandere":
      return `https://yande.re/post.json?limit=${LIMIT}&page=${p + 1}&tags=${encodeURIComponent(t || "")}`;
    case "danbooru":
      return `https://danbooru.donmai.us/posts.json?limit=${LIMIT}&page=${p + 1}&tags=${encodeURIComponent(t || "")}`;
    case "gelbooru":
      return (
        "https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1" +
        `&limit=${LIMIT}&pid=${p}&tags=${encodeURIComponent(t || "")}`
      );
    case "wallhaven_sfw":
      return (
        `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(t || "")}` +
        `&purity=100&categories=111&page=${p + 1}&per_page=${Math.min(LIMIT, 24)}`
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
    return data.data.map((p) => ({
      id: String(p.id),
      preview: (p.thumbs && (p.thumbs.small || p.thumbs.original)) || p.path,
      sample: (p.thumbs && p.thumbs.large) || p.path,
      file: p.path,
      tags: Array.isArray(p.tags) ? p.tags.map((x) => x.name).join(" ") : "",
      sourceId,
    }));
  }

  if (!Array.isArray(data)) return [];

  return data
    .map((p) => {
      let preview =
        p.preview_url ||
        p.preview_file_url ||
        p.sample_url ||
        p.large_file_url ||
        p.file_url ||
        "";
      let sample = p.sample_url || p.large_file_url || p.file_url || preview;
      let file = p.file_url || p.large_file_url || sample;

      if (!file && p.directory && p.image) {
        const base =
          sourceId === "safebooru"
            ? "https://safebooru.org/images"
            : "https://gelbooru.com/images";
        file = `${base}/${p.directory}/${p.image}`;
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
        sourceId,
      };
    })
    .filter(Boolean);
}

async function fetchPosts(state) {
  const source = sourceOf(state);
  const url = buildUrl(source.id, state.query || "", state.page || 0);
  if (!url) return { posts: [], error: "Fuente no soportada", hasMore: false };

  try {
    const res = await kino.fetch(url, {
      headers: {
        "User-Agent": "SusejingGallery/0.2 (Kino plugin)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return {
        posts<｜tool_call_begin｜>:
        [],
        error: `Error ${res.status} · ${source.name}`,
        hasMore: false,
      };
    }
    const data = await res.json();
    const posts = normalizePosts(source.id, data);
    return { posts, error: null, hasMore: posts.length >= LIMIT - 4 };
  } catch (e) {
    return {
      posts: [],
      error: String((e && e.message) || e),
      hasMore: false,
    };
  }
}

async function loadFavorites() {
  try {
    const raw = await kino.storage.get(FAV_KEY);
    if (!raw) return [];
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function saveFavorites(list) {
  const trimmed = (list || []).slice(0, MAX_FAV);
  await kino.storage.set(FAV_KEY, JSON.stringify(trimmed));
  return trimmed;
}

function isFav(favs, post) {
  if (!post || !Array.isArray(favs)) return false;
  const key = post.sourceId + ":" + post.id;
  return favs.some((f) => f.sourceId + ":" + f.id === key);
}

export async function screen({ state, lang }) {
  const isEs = lang !== "en";
  const section = sectionOf(state);
  const source = sourceOf(state);
  const sources = SOURCES[section];
  const posts = Array.isArray(state.posts) ? state.posts : [];
  const loading = state.loading === true;
  const loadingMore = state.loadingMore === true;
  const error = state.error || null;
  const query = state.query || "";
  const page = state.page || 0;
  const hasMore = state.hasMore !== false;
  const favs = Array.isArray(state.favorites) ? state.favorites : [];
  const tab = state.uiTab || "browse";

  if (state.view === "detail" && state.detailPost) {
    const p = state.detailPost;
    const fav = isFav(favs, p);
    const tags = decodeEntities(p.tags || "");
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
        children: [
          {
            type: "Column",
            padding: 12,
            gap: 12,
            children: [
              {
                type: "Image",
                url: p.sample || p.file || p.preview,
                aspect: "auto",
                alt: tags.slice(0, 80) || "image",
              },
              {
                type: "Text",
                text: tags || (isEs ? "(sin tags)" : "(no tags)"),
                style: "caption",
                color: "muted",
              },
              {
                type: "Row",
                wrap: true,
                gap: 8,
                children: [
                  {
                    type: "ElevatedButton",
                    icon: "open_in_new",
                    labelText: isEs ? "Abrir original" : "Open original",
                    onPressed: "openOriginal",
                    arg: p.file || p.sample || p.preview,
                  },
                  {
                    type: "Button",
                    variant: "secondary",
                    icon: fav ? "favorite" : "heart",
                    labelText: fav
                      ? isEs
                        ? "Quitar favorito"
                        : "Unfavorite"
                      : isEs
                        ? "Favorito"
                        : "Favorite",
                    onPressed: "toggleFav",
                    arg: p.id,
                  },
                ],
              },
              {
                type: "Row",
                wrap: true,
                gap: 8,
                children: [
                  {
                    type: "Button",
                    variant: "secondary",
                    icon: "copy",
                    labelText: isEs ? "Copiar tags" : "Copy tags",
                    onPressed: "copyTags",
                  },
                  {
                    type: "Button",
                    variant: "secondary",
                    icon: "star",
                    labelText: isEs ? "Usar como tema" : "Use as theme",
                    onPressed: "useAsTheme",
                    arg: p.file || p.sample || p.preview,
                  },
                ],
              },
              {
                type: "Text",
                text: isEs
                  ? "Nota: Kino no permite aplicar imágenes de internet como tema de la app. «Usar como tema» abre la imagen y te explica el límite."
                  : "Note: Kino cannot apply online images as an app theme. “Use as theme” opens the image and explains the limit.",
                style: "caption",
                color: "muted",
              },
            ],
          },
        ],
      },
    };
  }

  const sourceButtons = sources.map((s) => ({
    type: "Button",
    key: "src_" + s.id,
    variant: s.id === source.id ? "primary" : "secondary",
    labelText: s.name,
    onPressed: "changeSource",
    arg: s.id,
  }));

  const body = [];

  body.push({
    type: "Column",
    padding: 12,
    gap: 10,
    children: [
      {
        type: "Row",
        gap: 8,
        children: [
          {
            type: "Button",
            key: "tab_browse",
            variant: tab === "browse" ? "primary" : "secondary",
            labelText: isEs ? "Explorar" : "Browse",
            onPressed: "setTab",
            arg: "browse",
          },
          {
            type: "Button",
            key: "tab_fav",
            variant: tab === "favorites" ? "primary" : "secondary",
            labelText:
              (isEs ? "Favoritos" : "Favorites") +
              (favs.length ? ` (${favs.length})` : ""),
            onPressed: "setTab",
            arg: "favorites",
          },
        ],
      },
      ...(tab === "browse"
        ? [
            {
              type: "TextField",
              key: "search",
              labelText: isEs ? "Buscar tags…" : "Search tags…",
              value: query,
              onSubmitted: "search",
            },
            {
              type: "SingleChildScrollView",
              direction: "horizontal",
              children: [
                {
                  type: "Row",
                  gap: 8,
                  children: sourceButtons,
                },
              ],
            },
            {
              type: "Text",
              text: isEs
                ? `Fuente: ${source.name}${query ? " · " + query : ""}`
                : `Source: ${source.name}${query ? " · " + query : ""}`,
              style: "caption",
              color: "muted",
            },
          ]
        : [
            {
              type: "Text",
              text: isEs
                ? "Imágenes guardadas en este aparato"
                : "Images saved on this device",
              style: "caption",
              color: "muted",
            },
          ]),
    ],
  });

  const showList = tab === "favorites" ? favs : posts;

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
          text: isEs ? "Cargando imágenes…" : "Loading images…",
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
          : isEs
            ? "Sin resultados"
            : "No results",
      titleEn: tab === "favorites" ? "No favorites" : "No results",
      text:
        tab === "favorites"
          ? isEs
            ? "Marca imágenes con el corazón para verlas aquí"
            : "Heart images to see them here"
          : isEs
            ? "Prueba otros tags o cambia de fuente"
            : "Try different tags or change source",
      textEn:
        tab === "favorites"
          ? "Heart images to see them here"
          : "Try different tags or change source",
      icon: tab === "favorites" ? "heart" : "image",
    });
  } else {
    const cards = showList.map((p, i) => ({
      type: "Card",
      key: "img_" + (p.sourceId || "") + "_" + p.id + "_" + i,
      flush: true,
      span: { compact: 6, medium: 4, expanded: 3 },
      onTap: "openImage",
      arg: (p.sourceId || source.id) + ":" + p.id,
      children: [
        {
          type: "Image",
          url: p.preview || p.sample,
          aspect: "1:1",
          alt: decodeEntities(p.tags || "image").slice(0, 60),
        },
      ],
    }));

    body.push({
      type: "SingleChildScrollView",
      flex: 1,
      children: [
        {
          type: "Row",
          wrap: true,
          gap: 6,
          padding: 8,
          children: cards,
        },
        ...(tab === "browse"
          ? [
              {
                type: "Column",
                padding: 16,
                gap: 10,
                crossAxisAlignment: "center",
                children: [
                  {
                    type: "Text",
                    text: isEs
                      ? `Página ${page + 1} · ${posts.length} imágenes`
                      : `Page ${page + 1} · ${posts.length} images`,
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
                        labelText: isEs ? "← Anterior" : "← Previous",
                        onPressed: "prevPage",
                        enabled: page > 0 && !loading && !loadingMore,
                      },
                      {
                        type: "ElevatedButton",
                        labelText: loadingMore
                          ? isEs
                            ? "Cargando…"
                            : "Loading…"
                          : isEs
                            ? "Siguiente →"
                            : "Next →",
                        onPressed: "nextPage",
                        enabled: hasMore && !loading && !loadingMore,
                      },
                    ],
                  },
                  {
                    type: "Button",
                    variant: "text",
                    labelText: isEs ? "Cargar más (añadir)" : "Load more (append)",
                    onPressed: "loadMore",
                    enabled: hasMore && !loading && !loadingMore,
                  },
                ],
              },
            ]
          : []),
      ],
    });
  }

  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      title: "Susejing Gallery",
      leading: {
        type: "IconButton",
        icon: "close",
        labelText: isEs ? "Cerrar" : "Close",
        onPressed: { close: true },
      },
      actions: [
        {
          type: "IconButton",
          icon: "refresh",
          labelText: isEs ? "Recargar" : "Reload",
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
    body: {
      type: "Column",
      children: body,
    },
  };
}

export async function screenEvent({ name, arg, value, state, lang }) {
  const isEs = lang !== "en";

  async function load(next, { append } = {}) {
    const result = await fetchPosts(next);
    const prev = append && Array.isArray(state.posts) ? state.posts : [];
    const seen = new Set(prev.map((p) => p.sourceId + ":" + p.id));
    const added = result.posts.filter((p) => {
      const k = p.sourceId + ":" + p.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return {
      state: {
        ...next,
        loading: false,
        loadingMore: false,
        posts: append ? prev.concat(added) : result.posts,
        error: result.error,
        hasMore: result.hasMore,
      },
    };
  }

  if (name === "open") {
    const favorites = await loadFavorites();
    return load({
      section: "safe",
      sourceId: SOURCES.safe[0].id,
      page: 0,
      query: "",
      loading: true,
      posts: [],
      error: null,
      favorites,
      uiTab: "browse",
      hasMore: true,
    });
  }

  if (name === "setTab") {
    return {
      state: {
        ...state,
        uiTab: arg === "favorites" ? "favorites" : "browse",
        view: null,
        detailPost: null,
      },
    };
  }

  if (name === "changeSection") {
    const section = value === "nsfw" || arg === "nsfw" ? "nsfw" : "safe";
    return load({
      ...state,
      section,
      sourceId: SOURCES[section][0].id,
      page: 0,
      loading: true,
      posts: [],
      error: null,
      view: null,
      detailPost: null,
      uiTab: "browse",
    });
  }

  if (name === "changeSource") {
    return load({
      ...state,
      sourceId: String(arg || ""),
      page: 0,
      loading: true,
      posts: [],
      error: null,
      view: null,
      uiTab: "browse",
    });
  }

  if (name === "search") {
    const query = String(
      (state.inputs && state.inputs.search) || state.query || ""
    ).trim();
    return load({
      ...state,
      query,
      page: 0,
      loading: true,
      posts: [],
      error: null,
      uiTab: "browse",
    });
  }

  if (name === "reload") {
    return load({
      ...state,
      page: 0,
      loading: true,
      error: null,
      posts: [],
    });
  }

  if (name === "nextPage") {
    return load({
      ...state,
      page: (state.page || 0) + 1,
      loading: true,
      error: null,
    });
  }

  if (name === "prevPage") {
    return load({
      ...state,
      page: Math.max(0, (state.page || 0) - 1),
      loading: true,
      error: null,
    });
  }

  if (name === "loadMore") {
    const nextPage = (state.page || 0) + 1;
    const next = {
      ...state,
      page: nextPage,
      loadingMore: true,
      error: null,
    };
    const result = await fetchPosts(next);
    const prev = Array.isArray(state.posts) ? state.posts : [];
    const seen = new Set(prev.map((p) => p.sourceId + ":" + p.id));
    const added = result.posts.filter((p) => {
      const k = p.sourceId + ":" + p.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return {
      state: {
        ...next,
        loadingMore: false,
        posts: prev.concat(added),
        error: result.error,
        hasMore: result.hasMore,
      },
      toast: result.error
        ? result.error
        : isEs
          ? `+${added.length} imágenes`
          : `+${added.length} images`,
    };
  }

  if (name === "openImage") {
    const key = String(arg || "");
    const [sid, ...rest] = key.split(":");
    const id = rest.join(":");
    let post =
      (state.posts || []).find(
        (p) => p.id === id && (p.sourceId || sourceOf(state).id) === sid
      ) ||
      (state.favorites || []).find((p) => p.id === id && p.sourceId === sid);
    if (!post) {
      post =
        (state.posts || []).find((p) => p.id === id) ||
        (state.favorites || []).find((p) => p.id === id);
    }
    if (!post) return null;
    return { state: { ...state, view: "detail", detailPost: post } };
  }

  if (name === "closeDetail") {
    return { state: { ...state, view: null, detailPost: null } };
  }

  if (name === "openOriginal") {
    const url = String(arg || "");
    if (url) return { go: { url } };
    return null;
  }

  if (name === "copyTags") {
    const tags = decodeEntities((state.detailPost && state.detailPost.tags) || "");
    if (!tags) {
      return { toast: isEs ? "No hay tags" : "No tags" };
    }
    return {
      toast: isEs
        ? "Tags listos (mantén pulsado el texto de tags)"
        : "Tags ready (long-press the tags text)",
    };
  }

  if (name === "useAsTheme") {
    const url = String(arg || "");
    return {
      toast: isEs
        ? "Kino no aplica imágenes online como tema. Se abre el original."
        : "Kino can’t apply online images as a theme. Opening original.",
      go: url ? { url } : undefined,
    };
  }

  if (name === "toggleFav") {
    const p = state.detailPost;
    if (!p) return null;
    let favs = Array.isArray(state.favorites)
      ? state.favorites.slice()
      : await loadFavorites();
    const key = (p.sourceId || sourceOf(state).id) + ":" + p.id;
    const idx = favs.findIndex((f) => f.sourceId + ":" + f.id === key);
    let toast;
    if (idx >= 0) {
      favs.splice(idx, 1);
      toast = isEs ? "Quitado de favoritos" : "Removed from favorites";
    } else {
      favs.unshift({
        id: p.id,
        sourceId: p.sourceId || sourceOf(state).id,
        preview: p.preview,
        sample: p.sample,
        file: p.file,
        tags: p.tags || "",
      });
      toast = isEs ? "Guardado en favoritos" : "Saved to favorites";
    }
    favs = await saveFavorites(favs);
    return {
      state: { ...state, favorites: favs },
      toast,
    };
  }

  return null;
}
