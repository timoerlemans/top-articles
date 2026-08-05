(function () {
  "use strict";

  const data = window.TOP_ARTICLES;

  const families = data ? data.families : [];
  const tabsEl = document.getElementById("family-tabs");
  const sizeToggleEl = document.getElementById("size-toggle");
  const listEl = document.getElementById("item-list");
  const emptyEl = document.getElementById("empty-state");
  const searchEl = document.getElementById("search");
  const generatedAtEl = document.getElementById("generated-at");

  if (!data) {
    const li = document.createElement("li");
    li.className = "error";
    li.textContent = "Kon data.js niet laden.";
    listEl.appendChild(li);
    return;
  }

  const CATEGORY_EMOJI = {
    article: "📄",
    email: "✉️",
    rss: "📰",
    highlight: "✏️",
    note: "🗒️",
    pdf: "📑",
    epub: "📚",
    tweet: "🐦",
    video: "🎬",
    podcast: "🎙️",
    audiobook: "🎧",
  };

  const state = {
    familyId: families[0]?.id ?? null,
    size: "top-10",
    query: "",
  };

  // Alleen http(s)-links worden ooit als href/src gebruikt — voorkomt javascript:-URI's
  // in data die oorspronkelijk van willekeurige, opgeslagen webpagina's afkomstig is.
  function safeUrl(url) {
    if (typeof url !== "string") return null;
    try {
      const parsed = new URL(url, location.href);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function formatGeneratedAt(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function findFamily(id) {
    return families.find((f) => f.id === id) ?? families[0];
  }

  function findList(family, size) {
    return family.lists[size] ?? family.lists["top-10"];
  }

  function hashToState() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const [familyId, size] = parts;
    if (familyId && families.some((f) => f.id === familyId)) {
      state.familyId = familyId;
    }
    if (size === "top-10" || size === "top-100") {
      state.size = size;
    }
  }

  function stateToHash() {
    const next = `#/${state.familyId}/${state.size}`;
    if (location.hash !== next) {
      history.replaceState(null, "", next);
    }
  }

  function renderTabs() {
    tabsEl.textContent = "";
    for (const family of families) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.textContent = family.label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(family.id === state.familyId));
      btn.addEventListener("click", () => {
        state.familyId = family.id;
        stateToHash();
        render();
      });
      tabsEl.appendChild(btn);
    }
  }

  function renderSizeToggle() {
    for (const btn of sizeToggleEl.querySelectorAll("button")) {
      const isActive = btn.dataset.size === state.size;
      btn.setAttribute("aria-selected", String(isActive));
      btn.onclick = () => {
        state.size = btn.dataset.size;
        stateToHash();
        render();
      };
    }
  }

  function hashHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 360;
  }

  function applyPlaceholderStyle(el, title) {
    const hue = hashHue(title || "readwise");
    el.style.background = `linear-gradient(135deg, hsl(${hue}, 55%, 88%), hsl(${(hue + 40) % 360}, 55%, 78%))`;
  }

  function metaLine(item) {
    const parts = [];
    if (item.author) parts.push(item.author);
    if (item.siteName) parts.push(item.siteName);
    if (item.readingTime) parts.push(item.readingTime);
    if (item.publishedDate) parts.push(item.publishedDate);
    return parts.join(" · ");
  }

  function familyLabelFor(tag) {
    for (const family of families) {
      for (const size of ["top-10", "top-100"]) {
        if (family.lists[size].tag === tag) {
          const sizeLabel = size === "top-10" ? "Top 10" : "Top 100";
          return `${family.label} ${sizeLabel}`;
        }
      }
    }
    return tag;
  }

  function buildThumb(item) {
    const emoji = CATEGORY_EMOJI[item.category] ?? "📄";
    const imgSrc = safeUrl(item.imageUrl);

    function buildPlaceholder() {
      const div = document.createElement("div");
      div.className = "thumb thumb-placeholder";
      applyPlaceholderStyle(div, item.title);
      div.textContent = emoji;
      return div;
    }

    if (!imgSrc) {
      return buildPlaceholder();
    }

    const img = document.createElement("img");
    img.className = "thumb";
    img.loading = "lazy";
    img.alt = "";
    img.src = imgSrc;
    img.addEventListener("error", () => img.replaceWith(buildPlaceholder()), { once: true });
    return img;
  }

  function buildBadges(item) {
    if (!item.alsoIn || item.alsoIn.length === 0) return null;
    const wrap = document.createElement("div");
    wrap.className = "badges";
    for (const tag of item.alsoIn) {
      const span = document.createElement("span");
      span.className = "badge";
      span.textContent = familyLabelFor(tag);
      wrap.appendChild(span);
    }
    return wrap;
  }

  function buildItem(item) {
    const li = document.createElement("li");
    li.className = "item";

    const position = document.createElement("span");
    position.className = "position";
    position.textContent = String(item.position);
    li.appendChild(position);

    li.appendChild(buildThumb(item));

    const body = document.createElement("div");
    body.className = "item-body";

    const titleLink = document.createElement("a");
    titleLink.className = "item-title";
    const readwiseHref = safeUrl(item.readwiseUrl);
    if (readwiseHref) {
      titleLink.href = readwiseHref;
      titleLink.target = "_blank";
      titleLink.rel = "noopener";
    }
    titleLink.textContent = item.title;
    body.appendChild(titleLink);

    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = metaLine(item);
    body.appendChild(meta);

    if (item.summary) {
      const summary = document.createElement("p");
      summary.className = "item-summary";
      summary.textContent = item.summary;
      body.appendChild(summary);
    }

    const badges = buildBadges(item);
    if (badges) body.appendChild(badges);

    const sourceHref = safeUrl(item.sourceUrl);
    if (sourceHref) {
      const sourceLink = document.createElement("a");
      sourceLink.className = "item-source";
      sourceLink.href = sourceHref;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener";
      sourceLink.textContent = "Origineel bekijken ↗";
      body.appendChild(sourceLink);
    }

    li.appendChild(body);
    return li;
  }

  function itemMatchesQuery(item, query) {
    if (!query) return true;
    const haystack = [item.title, item.author, item.siteName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  }

  function renderList() {
    const family = findFamily(state.familyId);
    const list = findList(family, state.size);
    const query = state.query.trim().toLowerCase();
    const items = list.items.filter((item) => itemMatchesQuery(item, query));

    listEl.textContent = "";
    emptyEl.hidden = items.length > 0;

    const fragment = document.createDocumentFragment();
    for (const item of items) {
      fragment.appendChild(buildItem(item));
    }
    listEl.appendChild(fragment);
  }

  function render() {
    renderTabs();
    renderSizeToggle();
    renderList();
  }

  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    renderList();
  });

  window.addEventListener("hashchange", () => {
    hashToState();
    render();
  });

  generatedAtEl.textContent = `bijgewerkt op ${formatGeneratedAt(data.generatedAt)}`;

  hashToState();
  stateToHash();
  render();
})();
