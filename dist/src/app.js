import { parseTopArticlePriority, parseTopArticles } from "./types/browser-data.js";
function requiredElement(id, elementType) {
    const element = document.getElementById(id);
    if (!(element instanceof elementType)) {
        throw new Error(`Vereist pagina-element ontbreekt: #${id}`);
    }
    return element;
}
function formatBuildNumber(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return "onbekend";
    }
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}
function registerServiceWorker() {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) {
        return;
    }
    void navigator.serviceWorker.register("service-worker.js").catch(() => undefined);
}
registerServiceWorker();
(function () {
    "use strict";
    const data = parseTopArticles(window.TOP_ARTICLES);
    const priorityData = parseTopArticlePriority(window.TOP_ARTICLE_PRIORITY);
    const priorityAvailable = priorityData !== null;
    const priorityItems = priorityData?.items ?? {};
    const families = data?.families ?? [];
    const catalogItems = data?.catalog?.items ?? [];
    const derivedLists = data?.derivedLists ?? {};
    const tabsEl = requiredElement("family-tabs", HTMLElement);
    const mobileMenuToggleEl = requiredElement("mobile-menu-toggle", HTMLButtonElement);
    const mobileMenuLabelEl = requiredElement("mobile-menu-label", HTMLElement);
    const sizeToggleEl = requiredElement("size-toggle", HTMLElement);
    const discoverControlsEl = requiredElement("discover-controls", HTMLElement);
    const discoverListChipsEl = requiredElement("discover-list-chips", HTMLElement);
    const priorityControlsEl = requiredElement("priority-controls", HTMLElement);
    const prioritySequenceChipsEl = requiredElement("priority-sequence-chips", HTMLElement);
    const coreInterestPrioritiesEl = requiredElement("core-interest-priorities", HTMLElement);
    const priorityErrorEl = requiredElement("priority-error", HTMLElement);
    const readingTimeFilterEl = requiredElement("reading-time-filter", HTMLSelectElement);
    const listEl = requiredElement("item-list", HTMLOListElement);
    const listCountEl = requiredElement("list-count", HTMLElement);
    const emptyEl = requiredElement("empty-state", HTMLElement);
    const searchEl = requiredElement("search", HTMLInputElement);
    const generatedAtEl = requiredElement("generated-at", HTMLElement);
    const pwaBuildEl = requiredElement("pwa-build", HTMLElement);
    const sortChipListEl = requiredElement("sort-chip-list", HTMLElement);
    const sortSelectEl = requiredElement("sort-select", HTMLSelectElement);
    const sortDirectionEl = requiredElement("sort-direction", HTMLButtonElement);
    const sortFieldEl = requiredElement("sort-field", HTMLElement);
    const languageFilterEl = requiredElement("language-filter", HTMLSelectElement);
    const categoryFilterEl = requiredElement("category-filter", HTMLSelectElement);
    const moodFilterEl = requiredElement("mood-filter", HTMLSelectElement);
    const tagFilterListEl = requiredElement("tag-filter-list", HTMLElement);
    const searchScopeNoteEl = requiredElement("search-scope-note", HTMLElement);
    const searchFiltersPanelEl = requiredElement("search-filters-panel", HTMLElement);
    const toggleSearchFiltersEl = requiredElement("toggle-search-filters", HTMLButtonElement);
    const filterCountBadgeEl = requiredElement("filter-count-badge", HTMLElement);
    const activeFiltersEl = requiredElement("active-filters", HTMLElement);
    const activeFilterChipListEl = requiredElement("active-filter-chip-list", HTMLElement);
    const clearFiltersBtnEl = requiredElement("clear-filters-btn", HTMLButtonElement);
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
    const PRIORITY_SEQUENCE_LABELS = {
        lees: "Lezen",
        boek: "Boeken",
        pdf: "PDF's",
        video: "Video",
        dutch: "Nederlands",
        short: "Kort",
        "short-dutch": "Kort NL",
        luchtig: "Luchtig",
        "luchtig-nederlands": "Luchtig NL",
        scrum: "Agile",
        "software-development": "Software development",
        "front-end-development": "Front-end development",
        "social-studies": "Sociale studies & samenwerking",
        adhd: "ADHD",
    };
    const PRIORITY_SEQUENCE_DISPLAY_ORDER = [
        "lees", "boek", "pdf", "video", "dutch", "short", "short-dutch", "luchtig", "luchtig-nederlands", "scrum",
        "software-development", "front-end-development", "social-studies", "adhd",
    ];
    const PRIORITY_SEQUENCES = PRIORITY_SEQUENCE_DISPLAY_ORDER.map((id) => ({ id, label: PRIORITY_SEQUENCE_LABELS[id] }));
    const PRIORITY_COMPONENT_LABELS = {
        kerninteresse: "Kerninteresses",
        relevantie: "Inhoudelijke relevantie",
        substantie: "Substantie",
        duurzaamheid: "Duurzaamheid",
        bruikbaarheid: "Bruikbaarheid",
        leeskans: "Leeskans",
        onderscheidende_duurzame_waarde: "Duurzame waarde",
        nederlandse_taal: "Nederlandse taal",
        aftrek: "Aftrek",
    };
    const PRIORITY_COMPONENT_KEYS = [
        "kerninteresse", "relevantie", "substantie", "duurzaamheid", "bruikbaarheid", "leeskans", "nederlandse_taal", "aftrek",
    ];
    const DEFAULT_SORT_DIR = { score: "desc", position: "asc", saved: "desc", published: "desc", title: "asc" };
    const SORT_FIELDS = ["score", "position", "saved", "published", "title"];
    const SORT_LABELS = { score: "Prioriteitsscore", position: "Positie", saved: "Toegevoegd", published: "Gepubliceerd", title: "Titel" };
    const state = {
        familyId: families[0]?.id ?? "",
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
    // Nodig om over alle toplijsten heen te kunnen zoeken/filteren, ook buiten
    // de op dit moment actieve tab/grootte.
    const GLOBAL_INDEX = new Map();
    const LIST_SIZES = ["top-10", "top-100"];
    for (const family of families) {
        for (const size of LIST_SIZES) {
            const list = family.lists[size];
            for (const item of list.items) {
                let entry = GLOBAL_INDEX.get(item.id);
                if (!entry) {
                    entry = { item, tagPositions: new Map() };
                    GLOBAL_INDEX.set(item.id, entry);
                }
                entry.tagPositions.set(list.tag, item.position ?? Number.MAX_SAFE_INTEGER);
            }
        }
    }
    const CATALOG_INDEX = new Map(catalogItems.map((item) => [item.id, item]));
    function priorityFor(item) {
        return priorityItems[item.id] ?? null;
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
        if (!bucket) {
            return true;
        }
        const minutes = item.readingMinutes;
        if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
            return false;
        }
        if (bucket === "up-to-5") {
            return minutes <= 5;
        }
        if (bucket === "6-to-10") {
            return minutes >= 6 && minutes <= 10;
        }
        if (bucket === "11-to-20") {
            return minutes >= 11 && minutes <= 20;
        }
        if (bucket === "21-to-60") {
            return minutes >= 21 && minutes <= 60;
        }
        return minutes > 60;
    }
    // Alleen http(s)-links worden ooit als href/src gebruikt — voorkomt javascript:-URI's
    // in data die oorspronkelijk van willekeurige, opgeslagen webpagina's afkomstig is.
    function safeUrl(url) {
        if (typeof url !== "string") {
            return null;
        }
        try {
            const parsed = new URL(url, location.href);
            return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
        }
        catch {
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
        }
        catch {
            return iso;
        }
    }
    // Handmatige parsing i.p.v. toLocaleDateString: voorkomt dat een datum-only
    // ISO-string ("2023-08-16") door tijdzone-conversie een dag verschuift.
    function formatDateOnly(dateStr) {
        if (typeof dateStr !== "string") {
            return null;
        }
        const match = dateStr.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return null;
        }
        const [, y, m, d] = match;
        const month = MONTHS_NL[Number(m) - 1];
        if (!month) {
            return null;
        }
        return `${Number(d)} ${month} ${y}`;
    }
    function timeValue(dateStr) {
        if (!dateStr) {
            return Number.NEGATIVE_INFINITY;
        }
        const t = new Date(dateStr).getTime();
        return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
    }
    function findFamily(id) {
        const family = families.find((candidate) => candidate.id === id) ?? families[0];
        if (!family) {
            throw new Error("De artikelgegevens bevatten geen familielijst.");
        }
        return family;
    }
    function findList(family, size) {
        return family.lists[size];
    }
    // Filters worden als query params bewaard zodat ze de hash-navigatie
    // overleven (top-10/top-100-wissel, andere lijst/tab, refresh, gedeelde link).
    function filtersToParams() {
        const params = new URLSearchParams();
        const query = state.query.trim();
        if (query) {
            params.set("q", query);
        }
        if (state.language) {
            params.set("lang", state.language);
        }
        if (state.category) {
            params.set("cat", state.category);
        }
        if (state.mood) {
            params.set("mood", state.mood);
        }
        if (state.readingTime) {
            params.set("time", state.readingTime);
        }
        for (const tag of state.tags) {
            params.append("tags", tag);
        }
        return params;
    }
    function paramsToFilters(params) {
        state.query = params.get("q") ?? "";
        state.language = params.get("lang") ?? "";
        state.category = params.get("cat") ?? "";
        state.mood = params.get("mood") ?? "";
        const time = params.get("time") ?? "";
        state.readingTime = isReadingTimeBucket(time) ? time : "";
        state.tags = new Set(params.getAll("tags").filter(Boolean));
    }
    function isReadingTimeBucket(value) {
        return value === "up-to-5" || value === "6-to-10" || value === "11-to-20" || value === "21-to-60" || value === "over-60";
    }
    function isListSize(value) {
        return value === "top-10" || value === "top-100";
    }
    function isSortField(value) {
        return value === "score" || value === "position" || value === "saved" || value === "published" || value === "title";
    }
    function hashToState() {
        const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
        const [familyId, size] = parts;
        paramsToFilters(new URLSearchParams(location.search));
        if (familyId === "ontdek") {
            state.view = "discover";
            if (size && (size === "catalogus" || derivedLists[size])) {
                state.discoverListId = size;
            }
            return;
        }
        if (familyId === "leesvolgorde") {
            state.view = "priority";
            const matchedSequence = PRIORITY_SEQUENCES.find(({ id }) => id === size);
            if (matchedSequence) {
                state.prioritySequence = matchedSequence.id;
            }
            return;
        }
        state.view = "toplists";
        if (familyId && families.some((f) => f.id === familyId)) {
            state.familyId = familyId;
        }
        if (isListSize(size)) {
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
        // Expliciet location.pathname meesturen is nodig: een pad-loze referentie
        // als "#/..." resolveert relatief aan de HUIDIGE url (RFC 3986 §5.3) en
        // erft dan de bestaande querystring over, ook als search hier leeg is —
        // zonder pathname blijft een net gewist filter dus in de URL staan.
        const next = location.pathname + (search ? `?${search}` : "") + hashPart;
        if (location.pathname + location.search + location.hash !== next) {
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
        if (state.view === "priority") {
            return "Leesvolgorde";
        }
        if (state.view === "discover") {
            return "Ontdek";
        }
        return findFamily(state.familyId)?.label ?? "Menu";
    }
    function setMobileMenuOpen(open, { restoreFocus = false } = {}) {
        mobileMenuToggleEl.setAttribute("aria-expanded", String(open));
        mobileMenuToggleEl.setAttribute("aria-label", `Menu ${activeMenuLabel()}: ${open ? "sluiten" : "openen"}`);
        tabsEl.classList.toggle("mobile-open", open);
        if (restoreFocus) {
            mobileMenuToggleEl.focus();
        }
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
                const selectedSize = btn.dataset.size;
                if (!isListSize(selectedSize)) {
                    return;
                }
                state.size = selectedSize;
                stateToHash();
                render();
            };
        }
    }
    function renderDiscoverControls() {
        const active = state.view === "discover";
        discoverControlsEl.hidden = !active;
        discoverListChipsEl.textContent = "";
        if (!active) {
            return;
        }
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
    function renderCoreInterestPriorities() {
        coreInterestPrioritiesEl.textContent = "";
        const active = state.view === "priority";
        const ranking = priorityData?.coreInterestPriority;
        coreInterestPrioritiesEl.hidden = !active || ranking === undefined;
        if (!active || !ranking) {
            return;
        }
        const heading = document.createElement("h3");
        heading.className = "core-interest-heading";
        heading.textContent = "Kerninteresses";
        coreInterestPrioritiesEl.appendChild(heading);
        const intro = document.createElement("p");
        intro.className = "core-interest-intro";
        intro.textContent = "Deze rangorde bepaalt hoeveel bonus elk afzonderlijk aangetoond kerninteressegebied toevoegt. Meerdere interesses stapelen.";
        coreInterestPrioritiesEl.appendChild(intro);
        const list = document.createElement("ol");
        list.className = "core-interest-list";
        for (const entry of ranking.entries) {
            const row = document.createElement("li");
            row.className = "core-interest-row";
            const rank = document.createElement("span");
            rank.className = "core-interest-rank";
            rank.textContent = String(entry.rank);
            row.appendChild(rank);
            const content = document.createElement("span");
            content.className = "core-interest-content";
            const label = document.createElement("strong");
            label.textContent = entry.label;
            content.appendChild(label);
            const details = document.createElement("span");
            details.className = "core-interest-meta";
            const source = entry.source === "manual" ? "Handmatig" : "Afgeleid";
            const articleWord = entry.evidenceDocumentCount === 1 ? "artikel" : "artikelen";
            details.textContent = `${source} · ${entry.evidenceDocumentCount} ${articleWord} met bewijs · bewijsscore ${entry.evidenceScore}`;
            content.appendChild(details);
            row.appendChild(content);
            const weight = document.createElement("span");
            weight.className = "core-interest-weight";
            weight.textContent = `+${entry.weight}`;
            weight.setAttribute("aria-label", `${entry.weight} bonuspunten`);
            row.appendChild(weight);
            list.appendChild(row);
        }
        coreInterestPrioritiesEl.appendChild(list);
    }
    function renderPriorityControls() {
        const active = state.view === "priority";
        priorityControlsEl.hidden = !active;
        sortFieldEl.hidden = active;
        renderCoreInterestPriorities();
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
        if (!priorityAvailable) {
            return;
        }
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
        if (state.view === "priority") {
            return getPriorityItems();
        }
        if (query.length > 0) {
            return catalogOrTopItems();
        }
        if (state.view === "discover") {
            return getDiscoverItems();
        }
        const family = findFamily(state.familyId);
        const list = findList(family, state.size);
        return list.items;
    }
    function getDiscoverItems() {
        if (state.discoverListId === "catalogus") {
            return catalogOrTopItems();
        }
        const list = derivedLists[state.discoverListId];
        if (!list) {
            return [];
        }
        return list.items.flatMap((entry) => {
            const catalogItem = CATALOG_INDEX.get(entry.id);
            return catalogItem ? [{ ...catalogItem, ...entry }] : [];
        });
    }
    function getPriorityItems() {
        if (!priorityAvailable) {
            return [];
        }
        return Object.entries(priorityItems)
            .filter(([, priority]) => Number.isInteger(priority.positions[state.prioritySequence]))
            .map(([id, priority]) => {
            const catalogItem = CATALOG_INDEX.get(id) ?? GLOBAL_INDEX.get(id)?.item;
            return catalogItem ? {
                ...catalogItem,
                priority,
                priorityPosition: priority.positions[state.prioritySequence],
            } : null;
        })
            .filter((item) => item !== null && item.priorityPosition !== undefined)
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
            if (item.language) {
                languages.add(item.language);
            }
            if (item.category) {
                categories.add(item.category);
            }
            if (item.bestMoment) {
                moods.add(item.bestMoment);
            }
            for (const tag of item.tags ?? []) {
                tags.add(tag);
            }
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
        if (state.language && !languages.has(state.language)) {
            state.language = "";
        }
        if (state.category && !categories.has(state.category)) {
            state.category = "";
        }
        if (state.mood && !moods.has(state.mood)) {
            state.mood = "";
        }
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
        }
        else {
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
            btn.addEventListener("click", () => { toggleTagFilter(tag); });
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
                }
                else {
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
            activeFilterChipListEl.appendChild(buildActiveFilterChip(`Zoeken: "${query}"`, () => {
                state.query = "";
                searchEl.value = "";
                stateToHash();
                renderList();
            }));
        }
        if (state.language) {
            count++;
            activeFilterChipListEl.appendChild(buildActiveFilterChip(`Taal: ${state.language}`, () => {
                state.language = "";
                languageFilterEl.value = "";
                stateToHash();
                renderList();
            }));
        }
        if (state.category) {
            count++;
            const label = CATEGORY_LABELS[state.category] ?? state.category;
            activeFilterChipListEl.appendChild(buildActiveFilterChip(`Type: ${label}`, () => {
                state.category = "";
                categoryFilterEl.value = "";
                stateToHash();
                renderList();
            }));
        }
        if (state.mood) {
            count++;
            const label = state.mood.charAt(0).toUpperCase() + state.mood.slice(1);
            activeFilterChipListEl.appendChild(buildActiveFilterChip(`Moment: ${label}`, () => {
                state.mood = "";
                moodFilterEl.value = "";
                stateToHash();
                renderList();
            }));
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
            activeFilterChipListEl.appendChild(buildActiveFilterChip(`Leestijd: ${labels[state.readingTime]}`, () => {
                state.readingTime = "";
                readingTimeFilterEl.value = "";
                stateToHash();
                renderList();
            }));
        }
        for (const tag of state.tags) {
            count++;
            activeFilterChipListEl.appendChild(buildActiveFilterChip(`#${tag}`, () => {
                state.tags.delete(tag);
                renderTagFilterChips();
                stateToHash();
                renderList();
            }));
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
        if (item.author) {
            parts.push(item.author);
        }
        if (item.siteName) {
            parts.push(item.siteName);
        }
        if (item.language) {
            parts.push(item.language);
        }
        if (item.readingTime) {
            parts.push(item.readingTime);
        }
        const published = formatDateOnly(item.publishedDate);
        if (published) {
            parts.push(`gepubliceerd ${published}`);
        }
        const saved = formatDateOnly(item.savedDate);
        if (saved) {
            parts.push(`toegevoegd ${saved}`);
        }
        return parts.join(" · ");
    }
    function familyLabelFor(tag) {
        for (const family of families) {
            for (const size of LIST_SIZES) {
                if (family.lists[size].tag === tag) {
                    return `${family.label} ${SIZE_LABEL[size]}`;
                }
            }
        }
        return tag;
    }
    function buildThumb(item) {
        const emoji = item.category ? CATEGORY_EMOJI[item.category] ?? "📄" : "📄";
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
        img.addEventListener("error", () => { img.replaceWith(buildPlaceholder()); }, { once: true });
        return img;
    }
    // In gewone (niet-zoekende) weergave: badges voor de overige lijsten waar het
    // item ook in staat. In zoekweergave: badges voor alle lijsten, met positie.
    function buildBadges(item, isSearchMode) {
        const wrap = document.createElement("div");
        wrap.className = "badges";
        let hasBadges = false;
        const priority = priorityFor(item);
        if (priority) {
            const span = document.createElement("span");
            span.className = `badge priority-badge priority-${priority.tier}`;
            span.textContent = `Prioriteit: ${priority.tier} · ${priority.score}`;
            wrap.appendChild(span);
            hasBadges = true;
        }
        if (isSearchMode) {
            const entry = GLOBAL_INDEX.get(item.id);
            const positions = entry ? entry.tagPositions : new Map();
            for (const tag of positions.keys()) {
                const span = document.createElement("span");
                span.className = "badge";
                span.textContent = `${familyLabelFor(tag)} · #${positions.get(tag)}`;
                wrap.appendChild(span);
                hasBadges = true;
            }
        }
        else if (item.alsoIn && item.alsoIn.length > 0) {
            for (const tag of item.alsoIn) {
                const span = document.createElement("span");
                span.className = "badge";
                span.textContent = familyLabelFor(tag);
                wrap.appendChild(span);
                hasBadges = true;
            }
        }
        return hasBadges ? wrap : null;
    }
    function prioritySequenceLabel(sequenceId) {
        return PRIORITY_SEQUENCES.find(({ id }) => id === sequenceId)?.label ?? sequenceId;
    }
    const CORE_INTEREST_LABELS = {
        ai_ethiek: "AI & ethiek",
        filosofie: "Filosofie",
        ideologie: "Ideologie",
        geschiedenis: "Geschiedenis",
        sociologie: "Sociologie",
        schrijven: "Schrijven",
        speculatieve_fictie: "Speculatieve fictie",
        cultuur_games_film: "Cultuur, games & film",
        pkm: "PKM",
        zorgouderschap: "Zorg & ouderschap",
        adhd: "ADHD",
        agile: "Agile",
    };
    const PRIORITY_CONFIDENCE_LABELS = {
        high: "Veel vertrouwen",
        medium: "Redelijk vertrouwen",
        low: "Laag vertrouwen",
    };
    function priorityComponentExplanation(key, value, priority, item) {
        if (key === "kerninteresse") {
            const matches = priority.coreInterestMatches.map((match) => {
                const label = CORE_INTEREST_LABELS[match.interest] ?? match.interest;
                const evidence = match.evidence.map(({ label: evidenceLabel }) => evidenceLabel).join(", ");
                return `${label} +${match.weight}${evidence ? ` (${evidence})` : ""}`;
            });
            return matches.length > 0
                ? `Afzonderlijk aangetoonde interesses: ${matches.join("; ")}.`
                : "Er is kerninteressebewijs meegeteld.";
        }
        if (key === "relevantie") {
            const interests = priority.coreInterestMatches.map((match) => CORE_INTEREST_LABELS[match.interest] ?? match.interest);
            return interests.length > 0
                ? `Sterke aansluiting op je interesses: ${interests.join(", ")}.`
                : "Inhoudelijke aansluiting op de geselecteerde interessegebieden.";
        }
        if (key === "substantie") {
            return "De inhoudelijke diepgang is meegewogen in de beoordeling.";
        }
        if (key === "duurzaamheid") {
            return "De houdbaarheid van de inzichten is meegewogen in de beoordeling.";
        }
        if (key === "bruikbaarheid") {
            return "De praktische bruikbaarheid is meegewogen in de beoordeling.";
        }
        if (key === "leeskans") {
            return typeof item.readingMinutes === "number"
                ? `Geschatte leestijd: ${item.readingMinutes} minuten.`
                : "De geschatte leestijd is meegewogen in de beoordeling.";
        }
        if (key === "nederlandse_taal") {
            return "Dit is een Nederlandstalig document.";
        }
        if (key === "aftrek" && value < 0) {
            return "Automatische aftrek vanwege een inhouds- of formatkenmerk.";
        }
        return "Geen afzonderlijke bijdrage aan de score.";
    }
    function priorityJudgmentDescription(priority) {
        const source = priority.judgmentSource === "label"
            ? "Semantisch beoordeeld"
            : priority.judgmentSource === "fallback"
                ? "Voorlopige automatische inschatting"
                : "Automatische score";
        const confidence = PRIORITY_CONFIDENCE_LABELS[priority.judgmentConfidence ?? ""] ?? "Vertrouwen niet opgegeven";
        const basis = priority.judgmentSource === "label"
            ? "Gebaseerd op titel, samenvatting, notities, highlights en volledige tekst."
            : "Gebaseerd op de beschikbare metadata; een semantische beoordeling ontbreekt nog.";
        return `${source} · ${confidence}. ${basis}`;
    }
    function priorityTierLabel(tier) {
        if (tier === "hoog") {
            return "hoge prioriteit";
        }
        if (tier === "midden") {
            return "gemiddelde prioriteit";
        }
        if (tier === "laag") {
            return "lage prioriteit";
        }
        return tier;
    }
    function buildPriorityDetails(item) {
        const priority = priorityFor(item);
        if (!priority) {
            return null;
        }
        const details = document.createElement("details");
        details.className = "priority-breakdown";
        const summary = document.createElement("summary");
        summary.textContent = `Prioriteitsscore ${priority.score} · ${priorityTierLabel(priority.tier)}`;
        details.appendChild(summary);
        const intro = document.createElement("p");
        intro.className = "priority-order-note";
        intro.textContent = "Deze score bepaalt de volgorde binnen de lijst. Bij gelijke scores staat het oudste opgeslagen artikel eerst.";
        details.appendChild(intro);
        const total = document.createElement("p");
        total.className = "priority-total";
        const correction = priority.adjustment > 0 ? `+${priority.adjustment}` : String(priority.adjustment ?? 0);
        total.textContent = priority.adjustment
            ? `Basisscore vóór persoonlijke correctie: ${priority.baseScore}. Correctie: ${correction}${priority.adjustmentReason ? ` (${priority.adjustmentReason})` : ""}. Eindscore: ${priority.score}.`
            : `Basisscore: ${priority.baseScore}. Geen persoonlijke correctie. Eindscore: ${priority.score}.`;
        details.appendChild(total);
        const componentsHeading = document.createElement("h4");
        componentsHeading.className = "priority-section-title";
        componentsHeading.textContent = "Waar komt de score vandaan?";
        details.appendChild(componentsHeading);
        const components = document.createElement("dl");
        components.className = "priority-components";
        for (const key of PRIORITY_COMPONENT_KEYS) {
            const value = priority.components[key] ?? 0;
            if (value === 0) {
                continue;
            }
            const term = document.createElement("dt");
            term.textContent = PRIORITY_COMPONENT_LABELS[key];
            const description = document.createElement("dd");
            const score = document.createElement("span");
            score.className = "priority-component-score";
            score.textContent = value > 0 ? `+${value}` : String(value);
            const explanation = document.createElement("span");
            explanation.className = key === "kerninteresse"
                ? "priority-component-description priority-core-interest-match"
                : "priority-component-description";
            explanation.textContent = priorityComponentExplanation(key, value, priority, item);
            description.append(score, explanation);
            components.append(term, description);
        }
        if (components.childElementCount === 0) {
            const empty = document.createElement("p");
            empty.className = "priority-order-note";
            empty.textContent = "Er zijn geen afzonderlijke positieve scorecomponenten.";
            details.appendChild(empty);
        }
        else {
            details.appendChild(components);
        }
        const judgmentHeading = document.createElement("h4");
        judgmentHeading.className = "priority-section-title";
        judgmentHeading.textContent = "Inhoudelijke beoordeling";
        details.appendChild(judgmentHeading);
        const judgment = document.createElement("p");
        judgment.className = "priority-judgment";
        judgment.textContent = priorityJudgmentDescription(priority);
        details.appendChild(judgment);
        const positions = Object.entries(priority.positions ?? {});
        if (positions.length > 0) {
            const positionsHeading = document.createElement("h4");
            positionsHeading.className = "priority-section-title";
            positionsHeading.textContent = "Positie in Readwise-lijsten";
            details.appendChild(positionsHeading);
            const list = document.createElement("ul");
            list.className = "priority-positions";
            for (const [sequence, desired] of positions) {
                const actual = priority.actualPositions?.[sequence];
                const entry = document.createElement("li");
                entry.textContent = Number.isInteger(actual) && actual === desired
                    ? `${prioritySequenceLabel(sequence)}: volgens de score én Readwise #${desired}.`
                    : `${prioritySequenceLabel(sequence)}: volgens de score #${desired}; huidige Readwise-positie ${Number.isInteger(actual) ? `#${actual}` : "geen positie"}.`;
                list.appendChild(entry);
            }
            details.appendChild(list);
            const drift = positions.filter(([sequence, position]) => priority.actualPositions?.[sequence] !== position);
            const status = document.createElement("p");
            status.className = drift.length > 0 ? "priority-sync-status priority-sync-warning" : "priority-sync-status priority-sync-ok";
            status.textContent = drift.length > 0
                ? "De Readwise-tags lopen nog achter op deze berekende volgorde."
                : "De berekende volgorde is gesynchroniseerd met Readwise.";
            details.appendChild(status);
        }
        return details;
    }
    function buildNote(item) {
        if (!item.whyRead && !item.bestMoment) {
            return null;
        }
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
        if (!item.tags || item.tags.length === 0) {
            return null;
        }
        const wrap = document.createElement("div");
        wrap.className = "item-tags";
        for (const tag of item.tags) {
            const btn = document.createElement("button");
            btn.type = "button";
            const active = state.tags.has(tag);
            btn.className = active ? "tag-chip tag-chip-sm active" : "tag-chip tag-chip-sm";
            btn.setAttribute("aria-pressed", String(active));
            btn.textContent = tag;
            btn.addEventListener("click", () => { toggleTagFilter(tag); });
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
        if (priorityDetails) {
            body.appendChild(priorityDetails);
        }
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
        if (note) {
            body.appendChild(note);
        }
        const tagBadges = buildTagBadges(item);
        if (tagBadges) {
            body.appendChild(tagBadges);
        }
        const badges = buildBadges(item, isSearchMode);
        if (badges) {
            body.appendChild(badges);
        }
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
        if (!query) {
            return true;
        }
        const haystack = [item.title, item.author, item.siteName, ...(item.tags ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(query);
    }
    function compareEntries(sortKey) {
        switch (sortKey) {
            case "score":
                return (a, b) => (priorityFor(a.item)?.score ?? Number.NEGATIVE_INFINITY) - (priorityFor(b.item)?.score ?? Number.NEGATIVE_INFINITY) ||
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
        }
        else if (isSearchMode) {
            normalized = catalogOrTopItems()
                .filter((item) => itemMatchesQuery(item, query))
                .map((item) => {
                const entry = GLOBAL_INDEX.get(item.id);
                return { item, sortPosition: entry ? bestPosition(entry) : Number.MAX_SAFE_INTEGER };
            });
        }
        else if (state.view === "discover") {
            normalized = getDiscoverItems().map((item, index) => ({
                item,
                sortPosition: item.position ?? index + 1,
            }));
        }
        else {
            const family = findFamily(state.familyId);
            const list = findList(family, state.size);
            normalized = list.items.map((item, index) => ({ item, sortPosition: item.position ?? index + 1 }));
        }
        const filtered = normalized.filter(({ item }) => {
            if (state.language && item.language !== state.language) {
                return false;
            }
            if (state.category && item.category !== state.category) {
                return false;
            }
            if (state.mood && item.bestMoment !== state.mood) {
                return false;
            }
            if (!readingTimeMatches(item, state.readingTime)) {
                return false;
            }
            if (state.tags.size > 0 && !(item.tags ?? []).some((t) => state.tags.has(t))) {
                return false;
            }
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
        if (!isSortField(sortSelectEl.value)) {
            return;
        }
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
        if (!expanded) {
            searchEl.focus();
        }
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
        state.readingTime = isReadingTimeBucket(readingTimeFilterEl.value) ? readingTimeFilterEl.value : "";
        stateToHash();
        renderList();
    });
    window.addEventListener("hashchange", () => {
        hashToState();
        render();
    });
    generatedAtEl.textContent = `bijgewerkt op ${formatGeneratedAt(data.generatedAt)}`;
    pwaBuildEl.textContent = `PWA-build ${formatBuildNumber(data.generatedAt)}`;
    renderSortChips();
    hashToState();
    stateToHash();
    render();
})();
