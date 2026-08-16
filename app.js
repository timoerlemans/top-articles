(function () {
  "use strict";

  const data = window.TOP_ARTICLES;
  const priorityData = window.TOP_ARTICLE_PRIORITY;
  const priorityAvailable = priorityData?.model === "readwise-priority-v3" &&
    priorityData?.scope === "later" && priorityData?.items && typeof priorityData.items === "object";
  const priorityItems = priorityAvailable ? priorityData.items : {};

  const families = data ? data.families : [];
  const catalogItems = data?.catalog?.items ?? [];
  const derivedLists = data?.derivedLists ?? {};
  const tabsEl = document.getElementById("family-tabs");
  const mobileMenuToggleEl = document.getElementById("mobile-menu-toggle");
  const mobileMenuLabelEl = document.getElementById("mobile-menu-label");
  const sizeToggleEl = document.getElementById("size-toggle");
  const discoverControlsEl = document.getElementById("discover-controls");
  const discoverListChipsEl = document.getElementById("discover-list-chips");
  const priorityControlsEl = document.getElementById("priority-controls");
  const prioritySequenceChipsEl = document.getElementById("priority-sequence-chips");
  const priorityErrorEl = document.getElementById("priority-error");
  const readingTimeFilterEl = document.getElementById("reading-time-filter");
  const listEl = document.getElementById("item-list");
  const listCountEl = document.getElementById("list-count");
  const emptyEl = document.getElementById("empty-state");
  const searchEl = document.getElementById("search");
  const generatedAtEl = document.getElementById("generated-at");
  const sortChipListEl = document.getElementById("sort-chip-list");
  const sortSelectEl = document.getElementById("sort-select");
  const sortDirectionEl = document.getElementById("sort-direction");
  const sortFieldEl = document.getElementById("sort-field");
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

  const PRIORITY_SEQUENCES = [
    { id: "lees", label: "Lezen" },
    { id: "boek", label: "Boeken" },
    { id: "pdf", label: "PDF's" },
    { id: "video", label: "Video" },
    { id: "dutch", label: "Nederlands" },
    { id: "short", label: "Kort" },
    { id: "short-dutch", label: "Kort NL" },
    { id: "luchtig", label: "Luchtig" },
    { id: "luchtig-nederlands", label: "Luchtig NL" },
  ];

  const PRIORITY_COMPONENT_LABELS = {
    kerninteresse: "Kerninteresse",
    diepgang: "Diepgang",
    persoonlijke_bruikbaarheid: "Persoonlijke bruikbaarheid",
    leeskans: "Leeskans",
    onderscheidende_duurzame_waarde: "Duurzame waarde",
    aftrek: "Aftrek",
  };

  const DEFAULT_SORT_DIR = { score: "desc", position: "asc", saved: "desc", published: "desc", title: "asc" };

  const SORT_FIELDS = ["score", "position", "saved", "published", "title"];
  const SORT_LABELS = { score: "Prioriteitsscore", position: "Positie", saved: "Toegevoegd", published: "Gepubliceerd", title: "Titel" };

  const READING_TIME_BUCKETS = ["up-to-5", "6-to-10", "11-to-20", "21-to-60", "over-60"];

  const state = {
    familyId: families[0]?.id ?? null,
    size: "top-10",
    view: "toplists",
    discoverListId: "consensus",
    prioritySequence: "lees",
    query: "",
    sort: "score",
    sortDir: DEFAULT_SORT_DIR.score,
    language: "",
    category: "",
    mood: "",
    readingTime: "",
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

  const CATALOG_INDEX = new Map(catalogItems.map((item) => [item.id, item]));

  function priorityFor(item) {
    return item?.priority ?? priorityItems[item?.id] ?? null;
  }

  function catalogOrTopItems() {
    return catalogItems.length > 0
      ? catalogItems
      : [...GLOBAL_INDEX.values()].map((entry) => entry.item);
  }

  function bestPosition(entry) {
    return Math.min(...entry.tagPositions.values());
  }

  function readingTimeMatches(item, bucket) {
    if (!bucket) return true;
    const minutes = item.readingMinutes;
    if (!Number.isFinite(minutes)) return false;
    if (bucket === "up-to-5") return minutes <= 5;
    if (bucket === "6-to-10") return minutes >= 6 && minutes <= 10;
    if (bucket === "11-to-20") return minutes >= 11 && minutes <= 20;
    if (bucket === "21-to-60") return minutes >= 21 && minutes <= 60;
    return minutes > 60;
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

  // Filters worden als query params bewaard zodat ze de hash-navigatie
  // overleven (top-10/top-100-wissel, andere lijst/tab, refresh, gedeelde link).
  function filtersToParams() {
    const params = new URLSearchParams();
    const query = state.query.trim();
    if (query) params.set("q", query);
    if (state.language) params.set("lang", state.language);
    if (state.category) params.set("cat", state.category);
    if (state.mood) params.set("mood", state.mood);
    if (state.readingTime) params.set("time", state.readingTime);
    for (const tag of state.tags) params.append("tags", tag);
    return params;
  }

  function paramsToFilters(params) {
    state.query = params.get("q") ?? "";
    state.language = params.get("lang") ?? "";
    state.category = params.get("cat") ?? "";
    state.mood = params.get("mood") ?? "";
    const time = params.get("time") ?? "";
    state.readingTime = READING_TIME_BUCKETS.includes(time) ? time : "";
    state.tags = new Set(params.getAll("tags").filter(Boolean));
  }

  function hashToState() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const [familyId, size] = parts;
    paramsToFilters(new URLSearchParams(location.search));
    if (familyId === "ontdek") {
      state.view = "discover";
      if (size === "catalogus" || derivedLists[size]) state.discoverListId = size;
      return;
    }
    if (familyId === "leesvolgorde") {
      state.view = "priority";
      if (PRIORITY_SEQUENCES.some(({ id }) => id === size)) state.prioritySequence = size;
      return;
    }
    state.view = "toplists";
    if (familyId && families.some((f) => f.id === familyId)) {
      state.familyId = familyId;
    }
    if (size === "top-10" || size === "top-100") {
      state.size = size;
    }
  }

  function stateToHash() {
    const hashPart = state.view === "discover"
      ? `#/ontdek/${state.discoverListId}`
      : state.view === "priority"
        ? `#/leesvolgorde/${state.prioritySequence}`
        : `#/${state.familyId}/${state.size}`;
    const search = filtersToParams().toString();
    const next = (search ? `?${search}` : "") + hashPart;
    if (location.search + location.hash !== next) {
      history.replaceState(null, "", next);
    }
  }

  function clearAllFilters() {
    state.query = "";
    searchEl.value = "";
    state.language = "";
    state.category = "";
    state.mood = "";
    state.readingTime = "";
    state.tags.clear();
    languageFilterEl.value = "";
    categoryFilterEl.value = "";
    moodFilterEl.value = "";
    readingTimeFilterEl.value = "";
  }

  function activeMenuLabel() {
    if (state.view === "priority") return "Leesvolgorde";
    if (state.view === "discover") return "Ontdek";
    return findFamily(state.familyId)?.label ?? "Menu";
  }

  function setMobileMenuOpen(open, { restoreFocus = false } = {}) {
    mobileMenuToggleEl.setAttribute("aria-expanded", String(open));
    mobileMenuToggleEl.setAttribute("aria-label", `Menu ${activeMenuLabel()}: ${open ? "sluiten" : "openen"}`);
    tabsEl.classList.toggle("mobile-open", open);
    if (restoreFocus) mobileMenuToggleEl.focus();
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function renderTabs() {
    tabsEl.textContent = "";
    mobileMenuLabelEl.textContent = activeMenuLabel();
    const menuOpen = mobileMenuToggleEl.getAttribute("aria-expanded") === "true";
    mobileMenuToggleEl.setAttribute("aria-label", `Menu ${activeMenuLabel()}: ${menuOpen ? "sluiten" : "openen"}`);
    for (const family of families) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.textContent = family.label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(state.view === "toplists" && family.id === state.familyId));
      btn.addEventListener("click", () => {
        state.view = "toplists";
        state.familyId = family.id;
        closeMobileMenu();
        stateToHash();
        render();
      });
      tabsEl.appendChild(btn);
    }

    const priorityBtn = document.createElement("button");
    priorityBtn.type = "button";
    priorityBtn.className = "tab";
    priorityBtn.textContent = "Leesvolgorde";
    priorityBtn.setAttribute("role", "tab");
    priorityBtn.setAttribute("aria-selected", String(state.view === "priority"));
    priorityBtn.addEventListener("click", () => {
      state.view = "priority";
      closeMobileMenu();
      stateToHash();
      render();
    });
    tabsEl.appendChild(priorityBtn);

    const discoverBtn = document.createElement("button");
    discoverBtn.type = "button";
    discoverBtn.className = "tab";
    discoverBtn.textContent = "Ontdek";
    discoverBtn.setAttribute("role", "tab");
    discoverBtn.setAttribute("aria-selected", String(state.view === "discover"));
    discoverBtn.addEventListener("click", () => {
      state.view = "discover";
      closeMobileMenu();
      stateToHash();
      render();
    });
    tabsEl.appendChild(discoverBtn);
  }

  function renderSizeToggle() {
    sizeToggleEl.hidden = state.view === "discover" || state.view === "priority";
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

  function renderDiscoverControls() {
    const active = state.view === "discover";
    discoverControlsEl.hidden = !active;
    if (!active) return;

    discoverListChipsEl.textContent = "";
    const choices = [
      { id: "catalogus", label: "Catalogus" },
      ...Object.values(derivedLists).map((list) => ({ id: list.id, label: list.label })),
    ];
    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = choice.id === state.discoverListId ? "sort-chip active" : "sort-chip";
      btn.setAttribute("aria-pressed", String(choice.id === state.discoverListId));
      btn.textContent = choice.label;
      btn.addEventListener("click", () => {
        state.discoverListId = choice.id;
        stateToHash();
        render();
      });
      discoverListChipsEl.appendChild(btn);
    }
  }

  function priorityCount(sequence) {
    return Object.values(priorityItems).filter((item) => item.sequences?.includes(sequence)).length;
  }

  function renderPriorityControls() {
    const active = state.view === "priority";
    priorityControlsEl.hidden = !active;
    sortFieldEl.hidden = active;
    if (!active) {
      searchEl.placeholder = "Zoek in alle lijsten…";
      searchEl.setAttribute("aria-label", "Zoek in alle toplijsten");
      return;
    }

    const activeSequence = prioritySequenceLabel(state.prioritySequence).toLowerCase();
    searchEl.placeholder = `Zoek binnen ${activeSequence}…`;
    searchEl.setAttribute("aria-label", `Zoek binnen de reeks ${activeSequence}`);

    priorityErrorEl.hidden = priorityAvailable;
    prioritySequenceChipsEl.textContent = "";
    if (!priorityAvailable) return;

    for (const sequence of PRIORITY_SEQUENCES) {
      const button = document.createElement("button");
      button.type = "button";
      const selected = state.prioritySequence === sequence.id;
      button.className = selected ? "sort-chip active" : "sort-chip";
      button.setAttribute("aria-pressed", String(selected));
      button.textContent = `${sequence.label} (${priorityCount(sequence.id)})`;
      button.addEventListener("click", () => {
        state.prioritySequence = sequence.id;
        lastScopeKey = null;
        stateToHash();
        render();
      });
      prioritySequenceChipsEl.appendChild(button);
    }
  }

  let allTags = [];
  let lastScopeKey = null;

  // Levert de items die de basis vormen voor filteropties: bij een actieve
  // zoekopdracht is dat de volledige dataset (zoeken werkt over alle lijsten
  // heen), anders alleen de items van de actieve tab + Top10/100.
  function getScopeItems() {
    const query = state.query.trim().toLowerCase();
    if (state.view === "priority") return getPriorityItems();
    if (query.length > 0) {
      return catalogOrTopItems();
    }
    if (state.view === "discover") return getDiscoverItems();
    const family = findFamily(state.familyId);
    const list = findList(family, state.size);
    return list.items;
  }

  function getDiscoverItems() {
    if (state.discoverListId === "catalogus") return catalogOrTopItems();
    const list = derivedLists[state.discoverListId];
    if (!list) return [];
    return list.items.map((entry) => ({ ...CATALOG_INDEX.get(entry.id), ...entry })).filter((item) => item.id);
  }

  function getPriorityItems() {
    if (!priorityAvailable) return [];
    return Object.entries(priorityItems)
      .filter(([, priority]) => Number.isInteger(priority.positions?.[state.prioritySequence]))
      .map(([id, priority]) => {
        const catalogItem = CATALOG_INDEX.get(id) ?? GLOBAL_INDEX.get(id)?.item;
        return catalogItem ? {
          ...catalogItem,
          priority,
          priorityPosition: priority.positions[state.prioritySequence],
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.priorityPosition - b.priorityPosition);
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
    if (state.readingTime && !items.some((item) => readingTimeMatches(item, state.readingTime))) {
      state.readingTime = "";
    }

    languageFilterEl.value = state.language;
    categoryFilterEl.value = state.category;
    moodFilterEl.value = state.mood;
    readingTimeFilterEl.value = state.readingTime;

    renderTagFilterChips();
    stateToHash();
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
    stateToHash();
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

    if (sortSelectEl.options.length === 0) {
      for (const field of SORT_FIELDS) {
        const option = document.createElement("option");
        option.value = field;
        option.textContent = SORT_LABELS[field];
        sortSelectEl.appendChild(option);
      }
    }
    sortSelectEl.value = state.sort;
    sortDirectionEl.textContent = state.sortDir === "desc" ? "↓" : "↑";
    const directionLabel = state.sortDir === "desc" ? "aflopend" : "oplopend";
    sortDirectionEl.setAttribute("aria-label", `Sorteerrichting ${directionLabel}; klik om te wijzigen`);
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
          stateToHash();
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
          stateToHash();
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
          stateToHash();
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
          stateToHash();
          renderList();
        })
      );
    }

    if (state.readingTime) {
      count++;
      const labels = {
        "up-to-5": "Tot 5 min",
        "6-to-10": "6–10 min",
        "11-to-20": "11–20 min",
        "21-to-60": "21–60 min",
        "over-60": "Meer dan 60 min",
      };
      activeFilterChipListEl.appendChild(
        buildActiveFilterChip(`Leestijd: ${labels[state.readingTime]}`, () => {
          state.readingTime = "";
          readingTimeFilterEl.value = "";
          stateToHash();
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
          stateToHash();
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

    const priority = priorityFor(item);
    if (priority) {
      const span = document.createElement("span");
      span.className = `badge priority-badge priority-${priority.tier}`;
      span.textContent = `Prioriteit: ${priority.tier} · ${priority.score}`;
      wrap.appendChild(span);
      any = true;
    }

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

  function prioritySequenceLabel(sequenceId) {
    return PRIORITY_SEQUENCES.find(({ id }) => id === sequenceId)?.label ?? sequenceId;
  }

  function buildPriorityDetails(item) {
    const priority = priorityFor(item);
    if (!priority) return null;

    const details = document.createElement("details");
    details.className = "priority-breakdown";

    const summary = document.createElement("summary");
    summary.textContent = `Prioriteitsscore ${priority.score}/100 · tier ${priority.tier}`;
    details.appendChild(summary);

    const intro = document.createElement("p");
    intro.className = "priority-order-note";
    intro.textContent = "Een hogere score staat altijd hoger. Alleen bij exact gelijke score staat het oudste opgeslagen artikel vooraan.";
    details.appendChild(intro);

    const total = document.createElement("p");
    total.className = "priority-total";
    const correction = priority.adjustment > 0 ? `+${priority.adjustment}` : String(priority.adjustment ?? 0);
    total.textContent = priority.adjustment
      ? `Basisscore ${priority.baseScore} · handmatige correctie ${correction} (${priority.adjustmentReason}) · eindscore ${priority.score}`
      : `Basisscore en eindscore ${priority.score}`;
    details.appendChild(total);

    const components = document.createElement("dl");
    components.className = "priority-components";
    for (const [key, label] of Object.entries(PRIORITY_COMPONENT_LABELS)) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      const value = priority.components[key];
      const scoreText = value > 0 ? `+${value}` : String(value);
      const reasons = priority.rationale[key] ?? [];
      description.textContent = reasons.length > 0 ? `${scoreText} — ${reasons.join(" ")}` : `${scoreText} — niet van toepassing`;
      components.append(term, description);
    }
    details.appendChild(components);

    const positions = Object.entries(priority.positions ?? {});
    if (positions.length > 0) {
      const p = document.createElement("p");
      p.className = "priority-positions";
      p.textContent = `Aanbevolen posities: ${positions.map(([sequence, position]) => `${prioritySequenceLabel(sequence)} #${position}`).join(" · ")}`;
      details.appendChild(p);
    }
    const drift = positions.filter(([sequence, position]) => priority.actualPositions?.[sequence] !== position);
    if (drift.length > 0) {
      const p = document.createElement("p");
      p.className = "priority-sync-warning";
      p.textContent = `Niet gesynchroniseerd: ${drift.map(([sequence, desired]) => {
        const actual = priority.actualPositions?.[sequence];
        return `${prioritySequenceLabel(sequence)} gewenst #${desired}, actueel ${Number.isInteger(actual) ? `#${actual}` : "geen tag"}`;
      }).join(" · ")}`;
      details.appendChild(p);
    }
    return details;
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

  function buildItem(item, { isSearchMode, isPriorityView = false }) {
    const li = document.createElement("li");
    li.className = "item";

    const media = document.createElement("div");
    media.className = "item-media";
    media.appendChild(buildThumb(item));

    const position = document.createElement("span");
    position.className = "position-badge";
    position.textContent = isPriorityView
      ? String(item.priorityPosition ?? "•")
      : isSearchMode ? "•" : String(item.position ?? "•");
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

    const priorityDetails = buildPriorityDetails(item);
    if (priorityDetails) body.appendChild(priorityDetails);

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
      case "score":
        return (a, b) =>
          (priorityFor(a.item)?.score ?? Number.NEGATIVE_INFINITY) - (priorityFor(b.item)?.score ?? Number.NEGATIVE_INFINITY) ||
          timeValue(b.item.savedDate) - timeValue(a.item.savedDate) ||
          (b.item.id ?? "").localeCompare(a.item.id ?? "");
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
    const isPriorityView = state.view === "priority";
    const isSearchMode = query.length > 0 && !isPriorityView;

    // Filteropties (taal/type/moment/tags) alleen herberekenen wanneer de
    // scope daadwerkelijk wijzigt (andere tab/grootte, of overgang
    // zoeken-aan/uit) — niet bij elke toetsaanslag in het zoekveld.
    const scopeKey = isPriorityView
      ? `priority|${state.prioritySequence}`
      : isSearchMode ? "search" : state.view === "discover"
        ? `discover|${state.discoverListId}`
        : `${state.familyId}|${state.size}`;
    if (scopeKey !== lastScopeKey) {
      lastScopeKey = scopeKey;
      populateFilterOptions();
    }

    searchScopeNoteEl.hidden = !isSearchMode;

    let normalized;
    if (isPriorityView) {
      normalized = getPriorityItems()
        .filter((item) => itemMatchesQuery(item, query))
        .map((item) => ({ item, sortPosition: item.priorityPosition }));
    } else if (isSearchMode) {
      normalized = catalogOrTopItems()
        .filter((item) => itemMatchesQuery(item, query))
        .map((item) => ({ item, sortPosition: bestPosition(GLOBAL_INDEX.get(item.id) ?? { tagPositions: new Map([['fallback', Number.MAX_SAFE_INTEGER]]) }) }));
    } else if (state.view === "discover") {
      normalized = getDiscoverItems().map((item, index) => ({
        item,
        sortPosition: item.position ?? index + 1,
      }));
    } else {
      const family = findFamily(state.familyId);
      const list = findList(family, state.size);
      normalized = list.items.map((item) => ({ item, sortPosition: item.position }));
    }

    const filtered = normalized.filter(({ item }) => {
      if (state.language && item.language !== state.language) return false;
      if (state.category && item.category !== state.category) return false;
      if (state.mood && item.bestMoment !== state.mood) return false;
      if (!readingTimeMatches(item, state.readingTime)) return false;
      if (state.tags.size > 0 && !(item.tags ?? []).some((t) => state.tags.has(t))) return false;
      return true;
    });

    const sorted = isPriorityView ? filtered : sortNormalized(filtered);

    listCountEl.textContent = sorted.length === 1 ? "1 item" : `${sorted.length} items`;

    listEl.textContent = "";
    emptyEl.hidden = sorted.length > 0;

    const fragment = document.createDocumentFragment();
    for (const { item } of sorted) {
      fragment.appendChild(buildItem(item, { isSearchMode, isPriorityView }));
    }
    listEl.appendChild(fragment);

    renderActiveFilters();
  }

  function render() {
    renderTabs();
    renderSizeToggle();
    renderDiscoverControls();
    renderPriorityControls();
    renderList();
  }

  mobileMenuToggleEl.addEventListener("click", () => {
    const open = mobileMenuToggleEl.getAttribute("aria-expanded") !== "true";
    setMobileMenuOpen(open);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenuToggleEl.getAttribute("aria-expanded") === "true") {
      setMobileMenuOpen(false, { restoreFocus: true });
    }
  });

  sortSelectEl.addEventListener("change", () => {
    state.sort = sortSelectEl.value;
    state.sortDir = DEFAULT_SORT_DIR[state.sort] ?? "asc";
    renderSortChips();
    renderList();
  });

  sortDirectionEl.addEventListener("click", () => {
    state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
    renderSortChips();
    renderList();
  });

  toggleSearchFiltersEl.addEventListener("click", () => {
    const expanded = toggleSearchFiltersEl.getAttribute("aria-expanded") === "true";
    toggleSearchFiltersEl.setAttribute("aria-expanded", String(!expanded));
    searchFiltersPanelEl.hidden = expanded;
    if (!expanded) searchEl.focus();
  });

  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    stateToHash();
    render();
  });

  clearFiltersBtnEl.addEventListener("click", () => {
    clearAllFilters();
    renderTagFilterChips();
    stateToHash();
    renderList();
  });

  languageFilterEl.addEventListener("change", () => {
    state.language = languageFilterEl.value;
    stateToHash();
    renderList();
  });

  categoryFilterEl.addEventListener("change", () => {
    state.category = categoryFilterEl.value;
    stateToHash();
    renderList();
  });

  moodFilterEl.addEventListener("change", () => {
    state.mood = moodFilterEl.value;
    stateToHash();
    renderList();
  });

  readingTimeFilterEl.addEventListener("change", () => {
    state.readingTime = readingTimeFilterEl.value;
    stateToHash();
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
