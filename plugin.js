// Susejing Gallery v0.1.1
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

const LIMIT = 30;

function sectionOf(state) {
  return state.section === "nsfw" ? "nsfw" : "safe";
}

function sourceOf(state) {
  const section = sectionOf(state);
  const list = SOURCES[section];
  const id = state.sourceId || list[0].id;
  return list.find((s) => s.id === id) || list[0];
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
        `&purity=100&categories=111&page=${p + 1}&per_page=${LIMIT}`
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
        tags: p.tags || p.tag_string || "",
      };
    })
    .filter(Boolean);
}

async function fetchPosts(state) {
  const source = sourceOf(state);
  const url = buildUrl(source.id, state.query || "", state.page || 0);
  if (!url) return { posts: [], error: "Fuente no soportada" };

  try {
    const res = await kino.fetch(url, {
      headers: {
        "User-Agent": "SusejingGallery/0.1 (Kino plugin)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { posts: [], error: `Error ${res.status} · ${source.name}` };
    }
    const data = await res.json();
    return { posts: normalizePosts(source.id, data), error: null };
  } catch (e) {
    return { posts: [], error: String((e && e.message) || e) };
  }
}

export async function screen({ state, lang }) {
  const isEs = lang !== "en";
  const section = sectionOf(state);
  const source = sourceOf(state);
  const sources = SOURCES[section];
  const posts = Array.isArray(state.posts) ? state.posts : [];
  const loading = state.loading === true;
  const error = state.error || null;
  const query = state.query || "";
  const page = state.page || 0;

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
            padding: 12,
            gap: 12,
            children: [
              {
                type: "Image",
                url: p.sample || p.file || p.preview,
                aspect: "auto",
                alt: (p.tags || "image").slice(0, 80),
              },
              {
                type: "Text",
                text: p.tags || "",
                style: "caption",
                color: "muted",
              },
              {
                type: "ElevatedButton",
                icon: "open_in_new",
                labelText: isEs ? "Abrir original" : "Open original",
                onPressed: "openOriginal",
                arg: p.file || p.sample || p.preview,
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
    ],
  });

  if (loading) {
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
  } else if (error) {
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
  } else if (posts.length === 0) {
    body.push({
      type: "emptyState",
      title: isEs ? "Sin resultados" : "No results",
      titleEn: "No results",
      text: isEs
        ? "Prueba otros tags o cambia de fuente"
        : "Try different tags or change source",
      textEn: "Try different tags or change source",
      icon: "image",
    });
  } else {
    const cards = posts.map((p, i) => ({
      type: "Card",
      key: "img_" + p.id + "_" + i,
      flush: true,
      span: { compact: 6, medium: 4, expanded: 3 },
      onTap: "openImage",
      arg: p.id,
      children: [
        {
          type: "Image",
          url: p.preview || p.sample,
          aspect: "1:1",
          alt: (p.tags || "image").slice(0, 60),
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
              enabled: page > 0,
            },
            {
              type: "Text",
              text: isEs ? `Pág. ${page + 1}` : `Page ${page + 1}`,
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

export async function screenEvent({ name, arg, value, state }) {
  async function load(next) {
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

  if (name === "open") {
    return load({
      section: "safe",
      sourceId: SOURCES.safe[0].id,
      page: 0,
      query: "",
      loading: true,
      posts: [],
      error: null,
    });
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
    });
  }

  if (name === "reload") {
    return load({ ...state, loading: true, error: null });
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

  if (name === "openImage") {
    const id = String(arg || "");
    const post = (state.posts || []).find((p) => p.id === id);
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

  return null;
}
