import { startSession, refreshSession, transitionSession, planMenu, READING_MOODS } from "./reading-menu.js";
import { parseHistory, parseSession, reconcileHistory, readStored, writeStored, latestHistory } from "./reading-storage.js";
const HISTORY_KEY = "top-articles-reading-history-v1";
const SESSION_KEY = "top-articles-reading-session-v1";
const DEFAULT_MOMENT = { mood: null, energy: "gemiddeld", need: "ontspannen", budget: 15 };
const TIME_CHOICES = [5, 10, 15, 20, 30].map((value) => ({ value, label: `${value} min`, description: `Stel je totale leestijd in op ${value} minuten.` }));
const NEED_CHOICES = [
    { value: "ontspannen", label: "Licht & luchtig", description: "Een korte, toegankelijke start die niet meteen veel vraagt." },
    { value: "afleiding", label: "Even iets anders", description: "Een prettige afleiding om je gedachten te verzetten." },
    { value: "herkenning", label: "Herkenning", description: "Iets over mensen, gedrag of situaties die vertrouwd voelen." },
    { value: "verkennen", label: "Een frisse invalshoek", description: "Nieuwe ideeën over mensen en de wereld om je heen." },
    { value: "verdieping", label: "Iets om over na te denken", description: "Een filosofische vraag of een inzicht dat blijft hangen." },
];
const ENERGY_CHOICES = [
    { value: "weinig", label: "Weinig", description: "Kies iets toegankelijk waar je weinig concentratie voor nodig hebt." },
    { value: "gemiddeld", label: "Gemiddeld", description: "Er is ruimte voor een beetje aandacht en reflectie." },
    { value: "veel", label: "Veel", description: "Je kunt best iets prikkelends of inhoudelijks aan." },
];
const MOOD_LABELS = {
    neutraal: { label: "Neutraal", description: "Je staat open voor verschillende soorten artikelen." },
    rustig: { label: "Rustig", description: "Liever iets kalms en warms." },
    nieuwsgierig: { label: "Nieuwsgierig", description: "Een nieuwe gedachte of invalshoek trekt je." },
    vrolijk: { label: "Vrolijk", description: "Iets speels of lichts past goed." },
    somber: { label: "Somber", description: "Iets zachts of herkenbaars mag." },
    gespannen: { label: "Gespannen", description: "Liever rustig, zonder onnodig zware kost." },
    "vol-hoofd": { label: "Vol hoofd", description: "Houd het overzichtelijk en makkelijk om in te stappen." },
};
const MOOD_CHOICES = [
    { value: null, label: "Geen voorkeur", description: "Laat de toon vooral passen bij waar je zin in hebt." },
    ...READING_MOODS.map((value) => ({ value, ...MOOD_LABELS[value] })),
];
const COURSE_COPY = {
    voorgerecht: { label: "Voorgerecht", subtitle: "Kort en licht beginnen" },
    hoofdgerecht: { label: "Hoofdgerecht", subtitle: "Lees verder als je wilt" },
    nagerecht: { label: "Nagerecht", subtitle: "Een klein slot" },
};
function storage(kind) {
    try {
        return window[kind];
    }
    catch {
        return null;
    }
}
function node(tag, text = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}
function button(text, action, className = "") {
    const element = node("button", text);
    element.type = "button";
    element.className = className;
    element.addEventListener("click", action);
    return element;
}
function safeReaderUrl(value) {
    try {
        const url = new URL(value ?? "");
        return url.protocol === "https:" && url.hostname === "read.readwise.io" && url.pathname.startsWith("/read/") ? url.href : null;
    }
    catch {
        return null;
    }
}
function summaryFor(item) {
    return item.summary?.trim() || item.whyRead?.trim() || "Een passend artikel uit je leeslijst.";
}
function choiceGroup(name, label, choices, selected, onSelect) {
    const fieldset = node("fieldset");
    fieldset.className = `reading-choice reading-choice-${name}`;
    const legend = node("legend", label);
    legend.id = `reading-choice-${name}-label`;
    const options = node("div");
    options.className = "reading-choice-options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-labelledby", legend.id);
    const description = node("p");
    description.id = `reading-choice-${name}-description`;
    description.className = "reading-choice-description";
    description.setAttribute("aria-live", "polite");
    fieldset.setAttribute("aria-describedby", description.id);
    const buttons = choices.map((choice) => {
        const option = button(choice.label, () => { onSelect(choice.value); }, "reading-menu-option");
        const focusKey = `${name}:${String(choice.value ?? "none")}`;
        option.setAttribute("data-reading-choice", focusKey);
        option.setAttribute("aria-label", `${choice.label}. ${choice.description}`);
        option.setAttribute("aria-pressed", String(choice.value === selected));
        return { value: choice.value, button: option };
    });
    options.append(...buttons.map(({ button: option }) => option));
    fieldset.append(legend, options, description);
    const group = {
        element: fieldset,
        description,
        choices,
        buttons,
        update(value) {
            for (const option of buttons) {
                const active = option.value === value;
                option.button.setAttribute("aria-pressed", String(active));
                option.button.className = active ? "reading-menu-option is-selected" : "reading-menu-option";
            }
            description.textContent = choices.find((choice) => choice.value === value)?.description ?? "";
        },
    };
    group.update(selected);
    return group;
}
export function mountReadingMenu(root, data, priority) {
    const local = storage("localStorage");
    const tab = storage("sessionStorage");
    const ids = data.catalog.items.map((item) => item.id);
    const consistent = priority !== null && data.generatedAt === priority.generatedAt && new Set(ids).size === ids.length
        && ids.length === Object.keys(priority.items).length && ids.every((id) => Object.hasOwn(priority.items, id));
    const available = consistent && !!data.readingMenu;
    let history = reconcileHistory(parseHistory(readStored(local, HISTORY_KEY)), ids, data.generatedAt, available);
    let durable = writeStored(local, HISTORY_KEY, history);
    let session = parseSession(readStored(tab, SESSION_KEY));
    const inputs = () => ({ catalog: data.catalog.items, profiles: data.readingMenu?.profiles ?? {}, scores: priority?.items ?? {}, readIds: history.ids });
    if (session && available) {
        session = refreshSession(inputs(), session);
    }
    else if (available) {
        session = startSession(inputs(), DEFAULT_MOMENT);
    }
    function syncHistory() {
        if (durable) {
            history = latestHistory(history, parseHistory(readStored(local, HISTORY_KEY)));
        }
        history = reconcileHistory(history, ids, data.generatedAt, available);
    }
    function save() {
        durable = writeStored(local, HISTORY_KEY, history) && durable;
        writeStored(tab, SESSION_KEY, session);
    }
    function act(action, id) {
        if (!session) {
            return;
        }
        const before = session.completed.length;
        syncHistory();
        session = transitionSession(inputs(), session, action, id);
        if (session.completed.length > before && id) {
            history = { ...history, ids: [...new Set([...history.ids, id])] };
        }
        save();
        updateUI(true);
    }
    const intro = node("header");
    intro.className = "reading-menu-intro";
    intro.append(node("p", "JOUW LEESMOMENT"), node("h2", "Wat past bij nu?"), node("p", "Begin klein. Kijk daarna of je nog een gang wilt."));
    root.replaceChildren(intro);
    if (!available) {
        const warning = node("p", "De menugegevens zijn nog niet beschikbaar of worden bijgewerkt. Je toplijsten blijven bereikbaar via het menu.");
        warning.setAttribute("role", "status");
        root.append(warning);
        return { render: () => undefined };
    }
    const storageWarning = node("p", "Je browser kan leesvoortgang niet bewaren. Tijdens dit bezoek werkt het menu wel.");
    storageWarning.className = "reading-menu-storage-warning";
    storageWarning.setAttribute("role", "status");
    storageWarning.hidden = durable;
    const status = node("section");
    status.className = "reading-menu-status";
    status.setAttribute("role", "status");
    status.tabIndex = -1;
    const settingsHeading = node("h3", "Stel je leesmoment samen");
    const settings = node("section");
    settings.className = "reading-menu-settings reading-moment";
    settings.setAttribute("aria-label", "Instellingen voor je leesmoment");
    const budgetGroup = choiceGroup("budget", "Hoeveel tijd wil je erin steken?", TIME_CHOICES, session?.moment.budget ?? DEFAULT_MOMENT.budget, (value) => { setMoment("budget", value); });
    const needGroup = choiceGroup("need", "Waar heb je nu zin in?", NEED_CHOICES, session?.moment.need ?? DEFAULT_MOMENT.need, (value) => { setMoment("need", value); });
    const energyGroup = choiceGroup("energy", "Hoeveel ruimte heb je in je hoofd?", ENERGY_CHOICES, session?.moment.energy ?? DEFAULT_MOMENT.energy, (value) => { setMoment("energy", value); });
    const moodGroup = choiceGroup("mood", "Hoe zit je erbij? (optioneel)", MOOD_CHOICES, session?.moment.mood ?? DEFAULT_MOMENT.mood, (value) => { setMoment("mood", value); });
    settings.append(budgetGroup.element, needGroup.element, energyGroup.element, moodGroup.element);
    const menuHeading = node("h3", "Je menu");
    menuHeading.className = "reading-menu-courses-heading";
    const courses = node("section");
    courses.className = "reading-menu-courses";
    courses.setAttribute("role", "region");
    courses.setAttribute("aria-label", "Voorgestelde gangen");
    courses.setAttribute("aria-live", "polite");
    const historyPanel = node("details");
    historyPanel.className = "reading-menu-history";
    root.append(storageWarning, status, settingsHeading, settings, menuHeading, courses, historyPanel);
    function setMoment(key, value) {
        syncHistory();
        const nextMoment = { ...(session?.moment ?? DEFAULT_MOMENT), [key]: value };
        session = session && !session.finished
            ? refreshSession(inputs(), { ...session, moment: nextMoment, proposal: null })
            : startSession(inputs(), nextMoment);
        save();
        updateUI();
    }
    function renderHistory() {
        const wasOpen = historyPanel.open;
        historyPanel.replaceChildren();
        const summary = node("summary", `Gelezen artikelen (${history.ids.length})`);
        historyPanel.append(summary);
        for (const id of history.ids) {
            const item = data.catalog.items.find((entry) => entry.id === id);
            if (!item) {
                continue;
            }
            const row = node("p", `${item.title} `);
            row.append(button("Opnieuw beschikbaar", () => {
                syncHistory();
                history = { ...history, ids: history.ids.filter((entry) => entry !== id) };
                save();
                updateUI(true);
            }));
            historyPanel.append(row);
        }
        historyPanel.hidden = history.ids.length === 0;
        historyPanel.open = wasOpen;
    }
    function renderCourse(proposal, item, active, isCurrent) {
        const card = node("article");
        card.className = `reading-course-card reading-course-${proposal.course}`;
        const copy = COURSE_COPY[proposal.course];
        const eyebrow = node("p", copy.label);
        eyebrow.className = "reading-course-label";
        const subtitle = node("p", isCurrent ? "Begin hier" : copy.subtitle);
        subtitle.className = "reading-course-subtitle";
        const heading = node("h4");
        heading.className = "reading-course-heading";
        const title = node("a", item.title);
        title.className = "reading-course-title";
        const href = safeReaderUrl(item.readwiseUrl);
        if (href) {
            title.href = href;
            title.target = "_blank";
            title.rel = "noopener";
            title.setAttribute("href", href);
            title.setAttribute("target", "_blank");
            title.setAttribute("rel", "noopener");
            title.setAttribute("aria-label", `${item.title} openen in Readwise Reader, in een nieuw tabblad`);
        }
        heading.append(title);
        const summary = node("p", summaryFor(item));
        summary.className = "reading-course-summary";
        const time = node("p", `${proposal.minutes} min leestijd${item.author ? ` · ${item.author}` : ""}`);
        time.className = "reading-course-time";
        card.append(eyebrow, subtitle, heading, summary, time);
        if (isCurrent) {
            card.setAttribute("data-current-course", "true");
            card.tabIndex = -1;
            const actions = node("div");
            actions.className = "reading-actions";
            actions.setAttribute("role", "group");
            actions.setAttribute("aria-label", `Acties voor ${copy.label.toLowerCase()}`);
            actions.append(button("Vervang voorstel", () => { act("replace", item.id); }), button("Gelezen, volgende gang", () => { act("read-next", item.id); }), button("Gelezen, rond af", () => { act("read-finish", item.id); }));
            if (active.course === "hoofdgerecht") {
                actions.append(button("Sla hoofdgerecht over", () => { act("skip-main"); }));
            }
            actions.append(button("Stop zonder dit artikel te markeren", () => { act("stop"); }));
            card.append(actions);
        }
        return card;
    }
    function updateUI(focusCurrent = false) {
        const active = session;
        const moment = active?.moment ?? DEFAULT_MOMENT;
        budgetGroup.update(moment.budget);
        needGroup.update(moment.need);
        energyGroup.update(moment.energy);
        moodGroup.update(moment.mood);
        storageWarning.hidden = durable;
        status.replaceChildren();
        courses.replaceChildren();
        let currentCard = null;
        if (!active) {
            status.append(node("p", "Kies je leesmoment om voorstellen te zien."));
        }
        else if (active.finished) {
            status.append(node("h4", active.completed.length ? "Leesmoment afgerond" : "Leesmoment gestopt"), node("p", "Je kunt hierboven een nieuw menu samenstellen."), button("Nieuw leesmoment", () => {
                session = startSession(inputs(), active.moment);
                save();
                updateUI(true);
            }));
        }
        else {
            const spent = active.completed.reduce((sum, entry) => sum + entry.minutes, 0);
            const proposals = planMenu(inputs(), active.moment, [...active.excluded, ...active.completed.map((entry) => entry.id)], active.course, spent);
            const planned = proposals.reduce((sum, proposal) => sum + proposal.minutes, 0);
            status.append(node("p", `${spent} min bevestigd gelezen · ${planned} min voorgesteld · ${active.moment.budget} min totaal`));
            if (!proposals.length) {
                const noStarter = active.course === "voorgerecht";
                courses.append(node("p", noStarter
                    ? "Bij deze combinatie past nu geen kort, licht voorgerecht. Pas je tijd of leesbehoefte aan; er verschijnt geen zwaarder alternatief."
                    : "Er past geen volgende gang binnen je resterende tijd en leesenergie."));
                courses.append(button("Rond leesmoment af", () => { act("stop"); }));
            }
            for (const proposal of proposals) {
                const item = data.catalog.items.find((entry) => entry.id === proposal.id);
                if (!item) {
                    continue;
                }
                const isCurrent = proposal.id === active.proposal?.id && proposal.course === active.proposal.course;
                const card = renderCourse(proposal, item, active, isCurrent);
                if (isCurrent) {
                    currentCard = card;
                }
                courses.append(card);
            }
        }
        renderHistory();
        if (focusCurrent) {
            (currentCard ?? status).focus();
        }
    }
    window.addEventListener("storage", (event) => {
        if (event.key !== HISTORY_KEY) {
            return;
        }
        history = reconcileHistory(parseHistory(readStored(local, HISTORY_KEY)), ids, data.generatedAt, available);
        if (session && available) {
            session = refreshSession(inputs(), session);
        }
        updateUI();
    });
    updateUI();
    return { render: updateUI };
}
