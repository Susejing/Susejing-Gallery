// Susejing Gallery v0.1.0
// Multi-source image gallery for Kino (Safe + 18+)

const SOURCES = {
  safe: [
    { id: "safebooru", name: "Safebooru", host: "safebooru.org" },
    { id: "konachan_safe", name: "Konachan (safe)", host: "konachan.net" },
    { id: "zerochan", name: "Zerochan", host: "www.zerochan.net" },
    { id: "wallhaven_sfw", name: "Wallhaven", host: "wallhaven.cc" },
  ],
  nsfw: [
    { id: "yandere", name: "Yande.re", host: "yande.re" },
    { id: "konachan_r18", name: "Konachan (r18)", host: "konachan.com" },
    { id: "danbooru", name: "Danbooru", host: "danbooru.donmai.us" },
    { id: "gelbooru", name: "Gelbooru", host: "gelbooru.com" },
  ],
};

const LIMIT = 40;

// ---------- helpers ----------

function currentSection(state) {
  return state.section === "nsfw" ? "nsfw" : "safe";
}

function currentSourceId(state) {
  const section = currentSection(state);
  const list = SOURCES[section];
  const id = state.sourceId || list[0].id;
  return list.some((s) => s.id === id) ? id : list[0].id;
}

function currentSource(state) {
  const section = currentSection(state);
  const id = currentSourceId(state);
  return SOURCES[section].find((s) => s.id === id) || SOURCES[section][0];
}

function buildUrl(sourceId, tags, page) {
  const t = (tags || "").trim().replace(/\s+/g, "+");
  const p = Math.max(0, page | 0);

  switch (sourceId) {
    case "safebooru":
      return `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=${LIMIT}&pid=${p}&tags=${encodeURIComponent(t || "rating:safe")}`;
    case "konachan_safe":
      return `https://konachan.net/post.json?limit=${LIMIT}&page=${p + 1}&tags=${encodeURIComponent((t ? t + "+" : "") + "rating:s")}`;
    case "konachan_r18":
      return `https://konachan.com/post.json?limit=${LIMIT}&page=${p + 1}&tags=${encodeURIComponent(t || "")}`;
    case "yandere":
      return `https://yande.re/post.json?limit=${LIMIT}&page=${p + 1}&tags=${encodeURIComponent(t || "")}`;
    case "danbooru":
      return `https://danbooru.donmai.us/posts.json?limit=${LIMIT}&page=${p + 1}&tags=${encodeURIComponent(t || "")}`;
    case "gelbooru":
      return `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=${LIMIT}&pid=${p}&tags=${encodeURIComponent(t || "")}`;
    case "zerochan":
      return `https://www.zerochan.net/${encodeURIComponent(t || "anime")}?json`;
    case "wallhaven_sfw":
      return `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(t || "")}&purity=100&categories=111&page=${p + 1}&per_page=${LIMIT}`;
    default:
      return null;
  }
}

function normalizePosts(sourceId, data) {
  if (!data) return [];

  if (sourceId === "gelbooru" && data && !Array.isArray(data) && Array.isArray(data.post)) {
    data = data.post;
  }

  if (sourceId === "wallhaven_sfw" && data && data.data) {
    return data.data.map((p) => ({
      id: String(p.id),
      preview: p.thumbs?.small || p.thumbs?.original || p.path,
      sample: p.thumbs?.large || p.path,
      file: p.path,
      width: p.dimension_x || 0,
      height: p.dimension_y || 0,
      score: p.favorites || 0,
      tags: (p.tags || []).map((t) => t.name).join(" "),
      rating: "s",
      source: "wallhaven",
      postUrl: p.url,
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
        preview = p.preview_file_url || p.media_asset?.variants?.find((v) => v.type === "180")?.url || preview;
        sample = p.large_file_url || p.media_asset?.variants?.find((v) => v.type === "sample")?.url || sample;
        file = p.file_url || file;
      }

      if (!preview && !sample && !file) return null;

      return {
        id: String(p.id || p.md5 || Math.random()),
        preview: preview || sample || file,
        sample: sample || file || preview,
        file: file || sample || preview,
        width: p.width || p.image_width || 0,
        height: p.height || p.image_height || 0,
        score: p.score || p.fav_count || 0,
        tags: p.tags || p.tag_string || "",
        rating: p.rating || "s",
        source: sourceId,
        postUrl: null,
      };
    })
    .filter(Boolean);
}

async function fetchPosts(state) {
  const source = currentSource(state);
  const tags = state.query || "";
  const page = state.page || 0;
  const url = buildUrl(source.id, tags, page);
  if (!url) return { posts: [], error: "Fuente no soportada aún" };

  try {
    const res = await kino.fetch(url, {
      headers: {
        "User-Agent": "SusejingGallery/0.1 (Kino plugin)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { posts: [], error: `Error ${res.status} al contactar ${source.name}` };
    }
    const data = await res.json();
    const posts = normalizePosts(source.id, data);
    return { posts, error: null };
  } catch (e) {
    return { posts: [], error: String(e.message || e) };
  }
}

// ---------- screen ----------

export async function screen({ state, lang, device }) {
  const section = currentSection(state);
  const source = currentSource(state);
  const sources = SOURCES[section];
  const posts = state.posts || [];
  const loading = state.loading === true;
  const error = state.error || null;
  const query = state.query || "";

  const isEs = lang === "es";

  const sourceChips = sources.map((s) => ({
    type: "Chip",
    key: "src_" + s.id,
    labelText: s.name,
    selected: s.id === source.id,
    onPressed: "changeSource",
    arg: s.id,
  }));

  let bodyChildren = [];

  bodyChildren.push({
    type: "Column",
    padding: { compact: 12, expanded: 16 },
    gap: 10,
    children: [
      {
        type: "TextField",
        key: "search",
        labelText: isEs ? "Buscar tags…" : "Search tags…",
        value: query,
        onSubmitted: "search",
      },
      {
        type: "SingleChildScrollView",
        scrollDirection: "horizontal",
        children: [
          {
            type: "Row",
            gap: 8,
            children: sourceChips,
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
    ],
  });

  if (loading) {
    bodyChildren.push({
      type: "Column",
      padding: 24,
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
  } else if (error) {
    bodyChildren.push({
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
  } else if (posts.length === 0) {
    bodyChildren.push({
      type: "Column",
      padding: 32,
      gap: 8,
      crossAxisAlignment: "center",
      children: [
        { type: "Icon", name: "image", color: "muted" },
        {
          type: "Text",
          text: isEs ? "No hay resultados" : "No results",
          style: "h3",
        },
        {
          type: "Text",
          text: isEs
            ? "Prueba otros tags o cambia de fuente"
            : "Try different tags or change source",
          color: "muted",
        },
      ],
    });
  } else {
    const cards = posts.map((p, i) => ({
      type: "Card",
      key: "img_" + p.id + "_" + i,
      flush: true,
      onTap: "openImage",
      arg: p.id,
      children: [
        {
          type: "Image",
          url: p.preview || p.sample,
          aspect: "1:1",
          alt: p.tags ? p.tags.slice(0, 80) : "image",
          fallback: {
            type: "Container",
            color: "surfaceVariant",
            child: {
              type: "Center",
              child: { type: "Icon", name: "broken_image", color: "muted" },
            },
          },
        },
      ],
    }));

    bodyChildren.push({
      type: "SingleChildScrollView",
      children: [
        {
          type: "Row",
          wrap: true,
          gap: 6,
          padding: { compact: 8, expanded: 12 },
          children: cards.map((c) => ({
            ...c,
            span: { compact: 6, medium: 4, expanded: 3 },
          })),
        },
        {
          type: "Row",
          mainAxisAlignment: "center",
          padding: 16,
          gap: 12,
          children: [
            {
              type: "OutlinedButton",
              labelText: isEs ? "Anterior" : "Previous",
              onPressed: "prevPage",
              enabled: (state.page || 0) > 0,
            },
            {
              type: "Text",
              text: `Pág. ${(state.page || 0) + 1}`,
              style: "caption",
            },
            {
              type: "OutlinedButton",
              labelText: isEs ? "Siguiente" : "Next",
              onPressed: "nextPage",
            },
          ],
        },
      ],
    });
  }

  if (state.view === "detail" && state.detailPost) {
    const p = state.detailPost;
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
            gap: 12,
            padding: 12,
            children: [
              {
                type: "Image",
                url: p.sample || p.file || p.preview,
                aspect: "auto",
                alt: p.tags || "image",
              },
              {
                type: "Text",
                text: p.tags || "",
                style: "caption",
                color: "muted",
              },
              {
                type: "Row",
                gap: 8,
                children: [
                  {
                    type: "ElevatedButton",
                    icon: "open_in_new",
                    labelText: isEs ? "Abrir original" : "Open original",
                    onPressed: "openOriginal",
                    arg: p.file || p.sample,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
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
    },
    body: {
      type: "Column",
      children: [
        {
          type: "TabBar",
          key: "sectionTabs",
          tabs: [
            { text: "Safe", textEn: "Safe" },
            { text: "18+", textEn: "18+" },
          ],
          index: section === "nsfw" ? 1 : 0,
          onChanged: "changeSection",
        },
        {
          type: "Expanded",
          child: {
            type: "Column",
            children: bodyChildren,
          },
        },
      ],
    },
  };
}

export async function screenEvent({ name, arg, state, lang }) {
  if (name === "open") {
    const next = {
      section: "safe",
      sourceId: SOURCES.safe[0].id,
      page: 0,
      query: "",
      loading: true,
      posts: [],
      error: null,
    };
    const result = await fetchPosts(next);
    return {
      state: {
        ...next,
        loading: false,
        posts: result.posts,
        error: result.error,
      },
    };
  }

  if (name === "changeSection") {
    const idx = typeof arg === "number" ? arg : 0;
    const section = idx === 1 ? "nsfw" : "safe";
    const sourceId = SOURCES[section][0].id;
    const next = {
      ...state,
      section,
      sourceId,
      page: 0,
      loading: true,
      posts: [],
      error: null,
      view: null,
      detailPost: null,
    };
    const result = await fetchPosts(next);
    return {
      state: {
        ...next,
        loading: false,
        posts: result.posts,
        error: result.error,
      },
    };
  }

  if (name === "changeSource") {
    const sourceId = String(arg || "");
    const next = {
      ...state,
      sourceId,
      page: 0,
      loading: true,
      posts: [],
      error: null,
      view: null,
    };
    const result = await fetchPosts(next);
    return {
      state: {
        ...next,
        loading: false,
        posts: result.posts,
        error: result.error,
      },
    };
  }

  if (name === "search") {
    const query = String((state.inputs && state.inputs.search) || state.query || "").trim();
    const next = {
      ...state,
      query,
      page: 0,
      loading: true,
      posts: [],
      error: null,
    };
    const result = await fetchPosts(next);
    return {
      state: {
        ...next,
        loading: false,
        posts: result.posts,
        error: result.error,
      },
    };
  }

  if (name === "reload") {
    const next = { ...state, loading: true, error: null };
    const result = await fetchPosts(next);
    return {
      state: {
        ...next,
        loading: false,
        posts: result.posts,
        error: result.error,
      },
    };
  }

  if (name === "nextPage") {
    const next = {
      ...state,
      page: (state.page || 0) + 1,
      loading: true,
      error: null,
    };
    const result = await fetchPosts(next);
    return {
      state: {
        ...next,
        loading: false,
        posts: result.posts,
        error: result.error,
      },
    };
  }

  if (name === "prevPage") {
    const page = Math.max(0, (state.page || 0) - 1);
    const next = { ...state, page, loading: true, error: null };
    const result = await fetchPosts(next);
    return {
      state: {
        ...next,
        loading: false,
        posts: result.posts,
        error: result.error,
      },
    };
  }

  if (name === "openImage") {
    const id = String(arg || "");
    const post = (state.posts || []).find((p) => p.id === id);
    if (!post) return null;
    return {
      state: {
        ...state,
        view: "detail",
        detailPost: post,
      },
    };
  }

  if (name === "closeDetail") {
    return {
      state: {
        ...state,
        view: null,
        detailPost: null,
      },
    };
  }

  if (name === "openOriginal") {
    const url = String(arg || "");
    if (url) return { go: { url } };
    return null;
  }

  return null;
}
