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
  const sortChipListEl = document.getElementById("sort-chip-list");
  const languageFilterEl = document.getElementById("language-filter");
  const categoryFilterEl = document.getElementById("category-filter");
  const moodFilterEl = document.getElementById("mood-filter");
  const tagFilterListEl = document.getElementById("tag-filter-list");
  const searchScopeNoteEl = document.getElementById("search-scope-note");
  const searchFiltersPanelEl = document.getElementById("search-filters-panel");
  const toggleSearchFiltersEl = document.getElementById("toggle-search-filters");
  const filterCountBadgeEl = document.getElementById("filter-count-badge");
  const activeFiltersEl = document.getElementById("active-filters");
  const activeFilterChipListEl = document.getElementById("active-filter-chip-list");
  const clearFiltersBtnEl = document.getElementById("clear-filters-btn");

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

  const CATEGORY_LABELS = {
    article: "Artikel",
    email: "E-mail",
    rss: "RSS",
    highlight: "Highlight",
    note: "Notitie",
    pdf: "PDF",
    epub: "E-book",
    tweet: "Tweet",
    video: "Video",
    podcast: "Podcast",
    audiobook: "Luisterboek",
  };

  const MONTHS_NL = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
  ];

  const SIZE_LABEL = { "top-10": "Top 10", "top-100": "Top 100" };

  const DEFAULT_SORT_DIR = { position: "asc", saved: "desc", published: "desc", title: "asc" };

  const SORT_FIELDS = ["position", "saved", "published", "title"];
  const SORT_LABELS = { position: "Positie", saved: "Toegevoegd", published: "Gepubliceerd", title: "Titel" };

  const state = {
    familyId: families[0]?.id ?? null,
    size: "top-10",
    query: "",
    sort: "position",
    sortDir: DEFAULT_SORT_DIR.position,
    language: "",
    category: "",
    mood: "",
    tags: new Set(),
  };

  // --- Globale index: elk document eenmaal, met per toplijst-tag zijn positie. ---
  // Nodig om over alle acht toplijsten heen te kunnen zoeken/filteren, ook buiten
  // de op dit moment actieve tab/grootte.
  const GLOBAL_INDEX = new Map();
  for (const family of families) {
    for (const size of ["top-10", "top-100"]) {
      const list = family.lists[size];
      for (const item of list.items) {
        let entry = GLOBAL_INDEX.get(item.id);
        if (!entry) {
          entry = { item, tagPositions: new Map() };
          GLOBAL_INDEX.set(item.id, entry);
        }
        entry.tagPositions.set(list.tag, item.position);
      }
    }
  }

  function bestPosition(entry) {
    return Math.min(...entry.tagPositions.values());
  }

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

  // Handmatige parsing i.p.v. toLocaleDateString: voorkomt dat een datum-only
  // ISO-string ("2023-08-16") door tijdzone-conversie een dag verschuift.
  function formatDateOnly(dateStr) {
    if (typeof dateStr !== "string") return null;
    const match = dateStr.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, y, m, d] = match;
    const month = MONTHS_NL[Number(m) - 1];
    if (!month) return null;
    return `${Number(d)} ${month} ${y}`;
  }

  function timeValue(dateStr) {
    if (!dateStr) return Number.NEGATIVE_INFINITY;
    const t = new Date(dateStr).getTime();
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
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

  function clearAllFilters() {
    state.query = "";
    searchEl.value = "";
    state.language = "";
    state.category = "";
    state.mood = "";
    state.tags.clear();
    languageFilterEl.value = "";
    categoryFilterEl.value = "";
    moodFilterEl.value = "";
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
        clearAllFilters();
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
        clearAllFilters();
        stateToHash();
        render();
      };
    }
  }

  let allTags = [];
  let lastScopeKey = null;

  // Levert de items die de basis vormen voor filteropties: bij een actieve
  // zoekopdracht is dat de volledige dataset (zoeken werkt over alle lijsten
  // heen), anders alleen de items van de actieve tab + Top10/100.
  function getScopeItems() {
    const query = state.query.trim().toLowerCase();
    if (query.length > 0) {
      return [...GLOBAL_INDEX.values()].map((entry) => entry.item);
    }
    const family = findFamily(state.familyId);
    const list = findList(family, state.size);
    return list.items;
  }

  function resetSelectOptions(selectEl) {
    while (selectEl.options.length > 1) {
      selectEl.remove(1);
    }
  }

  // Bouwt taal/type/moment/tag-filteropties uitsluitend uit items die in de
  // huidige scope daadwerkelijk voorkomen — nooit "dode" opties die tot 0
  // resultaten leiden. Laat ook actieve filterselecties los zodra ze buiten
  // de nieuwe scope vallen.
  function populateFilterOptions() {
    const items = getScopeItems();
    const languages = new Set();
    const categories = new Set();
    const moods = new Set();
    const tags = new Set();
    for (const item of items) {
      if (item.language) languages.add(item.language);
      if (item.category) categories.add(item.category);
      if (item.bestMoment) moods.add(item.bestMoment);
      for (const tag of item.tags ?? []) tags.add(tag);
    }

    resetSelectOptions(languageFilterEl);
    for (const lang of [...languages].sort((a, b) => a.localeCompare(b, "nl"))) {
      const opt = document.createElement("option");
      opt.value = lang;
      opt.textContent = lang;
      languageFilterEl.appendChild(opt);
    }

    resetSelectOptions(categoryFilterEl);
    for (const cat of [...categories].sort((a, b) => a.localeCompare(b, "nl"))) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = CATEGORY_LABELS[cat] ?? cat;
      categoryFilterEl.appendChild(opt);
    }

    resetSelectOptions(moodFilterEl);
    for (const mood of [...moods].sort((a, b) => a.localeCompare(b, "nl"))) {
      const opt = document.createElement("option");
      opt.value = mood;
      opt.textContent = mood.charAt(0).toUpperCase() + mood.slice(1);
      moodFilterEl.appendChild(opt);
    }

    allTags = [...tags].sort((a, b) => a.localeCompare(b, "nl"));

    if (state.language && !languages.has(state.language)) state.language = "";
    if (state.category && !categories.has(state.category)) state.category = "";
    if (state.mood && !moods.has(state.mood)) state.mood = "";
    if (state.tags.size > 0) {
      state.tags = new Set([...state.tags].filter((t) => tags.has(t)));
    }

    languageFilterEl.value = state.language;
    categoryFilterEl.value = state.category;
    moodFilterEl.value = state.mood;

    renderTagFilterChips();
  }

  // Klikken op een tag — in het filterpaneel of op een item — schakelt hem in de
  // OR-filterselectie (item matcht als hij minstens één geselecteerde tag heeft).
  function toggleTagFilter(tag) {
    if (state.tags.has(tag)) {
      state.tags.delete(tag);
    } else {
      state.tags.add(tag);
    }
    renderTagFilterChips();
    renderList();
  }

  function renderTagFilterChips() {
    tagFilterListEl.textContent = "";
    for (const tag of allTags) {
      const btn = document.createElement("button");
      btn.type = "button";
      const active = state.tags.has(tag);
      btn.className = active ? "tag-chip active" : "tag-chip";
      btn.setAttribute("aria-pressed", String(active));
      btn.textContent = tag;
      btn.addEventListener("click", () => toggleTagFilter(tag));
      tagFilterListEl.appendChild(btn);
    }
  }

  // Eén rij tikbare chips i.p.v. een native <select> + apart richting-knopje:
  // tikken op een niet-actief veld selecteert het met de default-richting,
  // tikken op het al-actieve veld draait de richting om.
  function renderSortChips() {
    sortChipListEl.textContent = "";
    for (const field of SORT_FIELDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      const active = state.sort === field;
      btn.className = active ? "sort-chip active" : "sort-chip";
      btn.setAttribute("aria-pressed", String(active));

      const label = document.createElement("span");
      label.textContent = SORT_LABELS[field];
      btn.appendChild(label);

      if (active) {
        const arrow = document.createElement("span");
        arrow.className = "sort-chip-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = state.sortDir === "desc" ? "↓" : "↑";
        btn.appendChild(arrow);
      }

      btn.addEventListener("click", () => {
        if (state.sort === field) {
          state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
        } else {
          state.sort = field;
          state.sortDir = DEFAULT_SORT_DIR[field] ?? "asc";
        }
        renderSortChips();
        renderList();
      });

      sortChipListEl.appendChild(btn);
    }
  }

  function buildActiveFilterChip(label, onRemove) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "active-filter-chip";

    const text = document.createElement("span");
    text.textContent = label;
    btn.appendChild(text);

    const icon = document.createElement("span");
    icon.className = "remove-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "×";
    btn.appendChild(icon);

    btn.setAttribute("aria-label", `${label} verwijderen`);
    btn.addEventListener("click", onRemove);
    return btn;
  }

  // Toont alle actief toegepaste filters als verwijderbare chips, plus een
  // teller op de "Zoeken & filteren"-knop, zodat de status ook zichtbaar is
  // zonder het paneel te openen.
  function renderActiveFilters() {
    activeFilterChipListEl.textContent = "";
    let count = 0;

    const query = state.query.trim();
    if (query) {
      count++;
      activeFilterChipListEl.appendChild(
        buildActiveFilterChip(`Zoeken: "${query}"`, () => {
          state.query = "";
          searchEl.value = "";
          renderList();
        })
      );
    }

    if (state.language) {
      count++;
      activeFilterChipListEl.appendChild(
        buildActiveFilterChip(`Taal: ${state.language}`, () => {
          state.language = "";
          languageFilterEl.value = "";
          renderList();
        })
      );
    }

    if (state.category) {
      count++;
      const label = CATEGORY_LABELS[state.category] ?? state.category;
      activeFilterChipListEl.appendChild(
        buildActiveFilterChip(`Type: ${label}`, () => {
          state.category = "";
          categoryFilterEl.value = "";
          renderList();
        })
      );
    }

    if (state.mood) {
      count++;
      const label = state.mood.charAt(0).toUpperCase() + state.mood.slice(1);
      activeFilterChipListEl.appendChild(
        buildActiveFilterChip(`Moment: ${label}`, () => {
          state.mood = "";
          moodFilterEl.value = "";
          renderList();
        })
      );
    }

    for (const tag of state.tags) {
      count++;
      activeFilterChipListEl.appendChild(
        buildActiveFilterChip(`#${tag}`, () => {
          state.tags.delete(tag);
          renderTagFilterChips();
          renderList();
        })
      );
    }

    activeFiltersEl.hidden = count === 0;
    filterCountBadgeEl.hidden = count === 0;
    filterCountBadgeEl.textContent = String(count);
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
    if (item.language) parts.push(item.language);
    if (item.readingTime) parts.push(item.readingTime);
    const published = formatDateOnly(item.publishedDate);
    if (published) parts.push(`gepubliceerd ${published}`);
    const saved = formatDateOnly(item.savedDate);
    if (saved) parts.push(`toegevoegd ${saved}`);
    return parts.join(" · ");
  }

  function familyLabelFor(tag) {
    for (const family of families) {
      for (const size of ["top-10", "top-100"]) {
        if (family.lists[size].tag === tag) {
          return `${family.label} ${SIZE_LABEL[size]}`;
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

  // In gewone (niet-zoekende) weergave: badges voor de overige lijsten waar het
  // item ook in staat. In zoekweergave: badges voor alle lijsten, met positie.
  function buildBadges(item, isSearchMode) {
    const wrap = document.createElement("div");
    wrap.className = "badges";
    let any = false;

    if (isSearchMode) {
      const entry = GLOBAL_INDEX.get(item.id);
      const positions = entry ? entry.tagPositions : new Map();
      for (const tag of positions.keys()) {
        const span = document.createElement("span");
        span.className = "badge";
        span.textContent = `${familyLabelFor(tag)} · #${positions.get(tag)}`;
        wrap.appendChild(span);
        any = true;
      }
    } else if (item.alsoIn && item.alsoIn.length > 0) {
      for (const tag of item.alsoIn) {
        const span = document.createElement("span");
        span.className = "badge";
        span.textContent = familyLabelFor(tag);
        wrap.appendChild(span);
        any = true;
      }
    }

    return any ? wrap : null;
  }

  function buildNote(item) {
    if (!item.whyRead && !item.bestMoment) return null;
    const wrap = document.createElement("div");
    wrap.className = "note";

    if (item.whyRead) {
      const p = document.createElement("p");
      p.className = "note-line";
      const strong = document.createElement("strong");
      strong.textContent = "Waarom lezen: ";
      p.appendChild(strong);
      p.appendChild(document.createTextNode(item.whyRead));
      wrap.appendChild(p);
    }

    if (item.bestMoment) {
      const p = document.createElement("p");
      p.className = "note-line";
      const strong = document.createElement("strong");
      strong.textContent = "Beste moment: ";
      p.appendChild(strong);
      p.appendChild(document.createTextNode(item.bestMoment));
      wrap.appendChild(p);
    }

    return wrap;
  }

  function buildTagBadges(item) {
    if (!item.tags || item.tags.length === 0) return null;
    const wrap = document.createElement("div");
    wrap.className = "item-tags";
    for (const tag of item.tags) {
      const btn = document.createElement("button");
      btn.type = "button";
      const active = state.tags.has(tag);
      btn.className = active ? "tag-chip tag-chip-sm active" : "tag-chip tag-chip-sm";
      btn.setAttribute("aria-pressed", String(active));
      btn.textContent = tag;
      btn.addEventListener("click", () => toggleTagFilter(tag));
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function buildItem(item, { isSearchMode }) {
    const li = document.createElement("li");
    li.className = "item";

    const media = document.createElement("div");
    media.className = "item-media";
    media.appendChild(buildThumb(item));

    const position = document.createElement("span");
    position.className = "position-badge";
    position.textContent = isSearchMode ? "•" : String(item.position);
    media.appendChild(position);

    li.appendChild(media);

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

      const summaryToggle = document.createElement("button");
      summaryToggle.type = "button";
      summaryToggle.className = "summary-toggle";
      summaryToggle.textContent = "Toon meer";
      summaryToggle.hidden = true;
      summaryToggle.addEventListener("click", () => {
        const expanded = summary.classList.toggle("expanded");
        summaryToggle.textContent = expanded ? "Toon minder" : "Toon meer";
      });
      body.appendChild(summaryToggle);

      // Alleen tonen als de tekst daadwerkelijk is afgekapt door line-clamp —
      // pas meetbaar nadat het element daadwerkelijk is gelayout.
      requestAnimationFrame(() => {
        if (summary.scrollHeight > summary.clientHeight + 1) {
          summaryToggle.hidden = false;
        }
      });
    }

    const note = buildNote(item);
    if (note) body.appendChild(note);

    const tagBadges = buildTagBadges(item);
    if (tagBadges) body.appendChild(tagBadges);

    const badges = buildBadges(item, isSearchMode);
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
    const haystack = [item.title, item.author, item.siteName, ...(item.tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  }

  function compareEntries(sortKey) {
    switch (sortKey) {
      case "saved":
        return (a, b) => timeValue(a.item.savedDate) - timeValue(b.item.savedDate);
      case "published":
        return (a, b) => timeValue(a.item.publishedDate) - timeValue(b.item.publishedDate);
      case "title":
        return (a, b) => (a.item.title ?? "").localeCompare(b.item.title ?? "", "nl");
      case "position":
      default:
        return (a, b) => a.sortPosition - b.sortPosition;
    }
  }

  // Werkt op een genormaliseerde vorm { item, sortPosition } zodat zoek- en
  // lijstweergave dezelfde sorteerlogica delen zonder vormonderscheid.
  function sortNormalized(entries) {
    const sorted = entries.slice();
    const compare = compareEntries(state.sort);
    sorted.sort((a, b) => (state.sortDir === "desc" ? -compare(a, b) : compare(a, b)));
    return sorted;
  }

  function renderList() {
    const query = state.query.trim().toLowerCase();
    const isSearchMode = query.length > 0;

    // Filteropties (taal/type/moment/tags) alleen herberekenen wanneer de
    // scope daadwerkelijk wijzigt (andere tab/grootte, of overgang
    // zoeken-aan/uit) — niet bij elke toetsaanslag in het zoekveld.
    const scopeKey = isSearchMode ? "search" : `${state.familyId}|${state.size}`;
    if (scopeKey !== lastScopeKey) {
      lastScopeKey = scopeKey;
      populateFilterOptions();
    }

    searchScopeNoteEl.hidden = !isSearchMode;

    let normalized;
    if (isSearchMode) {
      normalized = [...GLOBAL_INDEX.values()]
        .filter((entry) => itemMatchesQuery(entry.item, query))
        .map((entry) => ({ item: entry.item, sortPosition: bestPosition(entry) }));
    } else {
      const family = findFamily(state.familyId);
      const list = findList(family, state.size);
      normalized = list.items.map((item) => ({ item, sortPosition: item.position }));
    }

    const filtered = normalized.filter(({ item }) => {
      if (state.language && item.language !== state.language) return false;
      if (state.category && item.category !== state.category) return false;
      if (state.mood && item.bestMoment !== state.mood) return false;
      if (state.tags.size > 0 && !(item.tags ?? []).some((t) => state.tags.has(t))) return false;
      return true;
    });

    const sorted = sortNormalized(filtered);

    listEl.textContent = "";
    emptyEl.hidden = sorted.length > 0;

    const fragment = document.createDocumentFragment();
    for (const { item } of sorted) {
      fragment.appendChild(buildItem(item, { isSearchMode }));
    }
    listEl.appendChild(fragment);

    renderActiveFilters();
  }

  function render() {
    renderTabs();
    renderSizeToggle();
    renderList();
  }

  toggleSearchFiltersEl.addEventListener("click", () => {
    const expanded = toggleSearchFiltersEl.getAttribute("aria-expanded") === "true";
    toggleSearchFiltersEl.setAttribute("aria-expanded", String(!expanded));
    searchFiltersPanelEl.hidden = expanded;
    if (!expanded) searchEl.focus();
  });

  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    render();
  });

  clearFiltersBtnEl.addEventListener("click", () => {
    clearAllFilters();
    renderTagFilterChips();
    renderList();
  });

  languageFilterEl.addEventListener("change", () => {
    state.language = languageFilterEl.value;
    renderList();
  });

  categoryFilterEl.addEventListener("change", () => {
    state.category = categoryFilterEl.value;
    renderList();
  });

  moodFilterEl.addEventListener("change", () => {
    state.mood = moodFilterEl.value;
    renderList();
  });

  window.addEventListener("hashchange", () => {
    hashToState();
    render();
  });

  generatedAtEl.textContent = `bijgewerkt op ${formatGeneratedAt(data.generatedAt)}`;

  renderSortChips();
  hashToState();
  stateToHash();
  render();
})();
