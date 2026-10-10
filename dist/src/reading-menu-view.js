import { startSession, refreshSession, transitionSession, planMenu } from "./reading-menu.js";
import { parseHistory, parseSession, reconcileHistory, readStored, writeStored, latestHistory } from "./reading-storage.js";
import { READING_NEEDS } from "./reading-profiles.js";
const HISTORY_KEY = "top-articles-reading-history-v1";
const SESSION_KEY = "top-articles-reading-session-v1";
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
function button(text, action) {
    const element = node("button", text);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
}
function select(name, label, values, selected, labels) {
    const field = node("label", label);
    const input = node("select");
    input.name = name;
    for (const value of values) {
        const option = node("option", labels?.[value] ?? value);
        option.value = value;
        input.append(option);
    }
    input.value = selected;
    field.append(input);
    return field;
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
        render();
    }
    function render() {
        root.textContent = "";
        root.append(node("h2", "Wat past bij je leesmoment?"), node("p", "Begin met iets korts en luchtigs. Daarna kan je verder lezen of afronden."));
        if (!available) {
            const warning = node("p", "De menugegevens zijn nog niet beschikbaar of worden bijgewerkt. Je toplijsten blijven bereikbaar via het menu.");
            warning.setAttribute("role", "status");
            root.append(warning);
            return;
        }
        if (!durable) {
            root.append(node("p", "Je browser kan leesvoortgang niet bewaren. Tijdens dit bezoek werkt het menu wel."));
        }
        const form = node("form");
        form.className = "reading-moment";
        const current = session?.moment ?? { mood: null, energy: "gemiddeld", need: "ontspannen", budget: 15 };
        form.append(select("mood", "Hoe voel je je? (optioneel)", ["", "neutraal", "vrolijk", "somber", "gespannen"], current.mood ?? "", { "": "Geen voorkeur" }), select("energy", "Hoeveel energie heb je?", ["weinig", "gemiddeld", "veel"], current.energy), select("need", "Wat zoek je in het lezen?", READING_NEEDS, current.need));
        const time = node("label", "Hoeveel minuten wil je in totaal lezen?");
        const budget = node("input");
        budget.type = "number";
        budget.name = "budget";
        budget.min = "1";
        budget.step = "1";
        budget.required = true;
        budget.value = String(current.budget);
        time.append(budget);
        form.append(time);
        const presets = node("div");
        presets.className = "reading-presets";
        for (const minutes of [5, 10, 15, 20, 30]) {
            presets.append(button(`${minutes} min`, () => { budget.value = String(minutes); }));
        }
        form.append(presets);
        const submit = node("button", session && !session.finished ? "Start een nieuw leesmoment" : "Stel mijn menu samen");
        submit.type = "submit";
        form.append(submit);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (!form.reportValidity()) {
                return;
            }
            const values = new FormData(form);
            const minutes = Number(values.get("budget"));
            if (!Number.isSafeInteger(minutes) || minutes <= 0) {
                return;
            }
            const mood = String(values.get("mood") ?? "");
            const energy = String(values.get("energy"));
            const need = String(values.get("need"));
            if (!["weinig", "gemiddeld", "veel"].includes(energy) || !READING_NEEDS.some((value) => value === need)) {
                return;
            }
            syncHistory();
            session = startSession(inputs(), { mood: (mood || null), energy: energy, need: need, budget: minutes });
            save();
            render();
            root.querySelector(".reading-proposal")?.focus();
        });
        root.append(form);
        if (session) {
            renderSession(session);
        }
        if (history.ids.length) {
            const details = node("details");
            details.append(node("summary", `Gelezen artikelen (${history.ids.length})`));
            for (const id of history.ids) {
                const item = data.catalog.items.find((entry) => entry.id === id);
                if (!item) {
                    continue;
                }
                const row = node("p", item.title + " ");
                row.append(button("Opnieuw beschikbaar", () => {
                    syncHistory();
                    history = { ...history, ids: history.ids.filter((entry) => entry !== id) };
                    save();
                    render();
                }));
                details.append(row);
            }
            root.append(details);
        }
    }
    function renderSession(active) {
        const panel = node("section");
        panel.className = "reading-proposal";
        panel.tabIndex = -1;
        panel.setAttribute("aria-live", "polite");
        const spent = active.completed.reduce((sum, entry) => sum + entry.minutes, 0);
        panel.append(node("p", `${spent} van ${active.moment.budget} minuten bevestigd gelezen. De werkelijke leestijd kan verschillen.`));
        if (active.finished) {
            panel.append(node("h3", active.completed.length ? "Leesmoment afgerond" : "Leesmoment gestopt"), node("p", "Je kan hierboven een nieuw leesmoment starten."));
            root.append(panel);
            return;
        }
        const proposal = active.proposal;
        const item = data.catalog.items.find((entry) => entry.id === proposal?.id);
        if (!proposal || !item) {
            panel.append(node("h3", "Geen passend artikel beschikbaar"), node("p", active.course === "voorgerecht" ? "Er is nu geen kort, licht artikel met een voldoende onderbouwd profiel voor deze behoefte. Pas je leesbehoefte of tijd aan." : "Er past geen volgend artikel binnen je energie en resterende tijd."), button("Rond af", () => { act("stop"); }));
            root.append(panel);
            return;
        }
        panel.append(node("h3", proposal.course.charAt(0).toUpperCase() + proposal.course.slice(1)));
        const title = node("a", item.title);
        title.className = "item-title";
        try {
            const url = new URL(item.readwiseUrl ?? "");
            if (["https:", "http:"].includes(url.protocol)) {
                title.href = url.href;
                title.target = "_blank";
                title.rel = "noopener";
            }
        }
        catch { /* No safe Reader link. */ }
        panel.append(title, node("p", `${proposal.minutes} min${item.author ? ` · ${item.author}` : ""}`));
        if (item.summary) {
            panel.append(node("p", item.summary));
        }
        const profile = data.readingMenu?.profiles[item.id];
        panel.append(node("p", `Past bij ${active.moment.need}, met ${profile?.effort === 0 ? "zeer weinig" : profile?.effort === 1 ? "weinig" : "passende"} concentratie en een ${profile?.tone ?? "rustige"} toon.`));
        const planned = planMenu(inputs(), active.moment, [...active.excluded, ...active.completed.map((entry) => entry.id)], active.course, spent);
        if (planned.length > 1) {
            panel.append(node("p", `Als je verder wilt: ${planned.slice(1).map((entry) => `${entry.course} (${entry.minutes} min)`).join(", ")}.`));
        }
        panel.append(node("p", "Open het artikel in Reader. Geef hier daarna aan of je het hebt gelezen."));
        const actions = node("div");
        actions.className = "reading-actions";
        actions.append(button("Iets anders", () => { act("replace", item.id); }), button("Gelezen, volgende gang", () => { act("read-next", item.id); }), button("Gelezen, rond af", () => { act("read-finish", item.id); }));
        if (active.course === "hoofdgerecht") {
            actions.append(button("Sla hoofdgerecht over", () => { act("skip-main"); }));
        }
        actions.append(button("Stop zonder dit artikel te markeren", () => { act("stop"); }));
        panel.append(actions);
        root.append(panel);
    }
    window.addEventListener("storage", (event) => {
        if (event.key !== HISTORY_KEY) {
            return;
        }
        history = reconcileHistory(parseHistory(readStored(local, HISTORY_KEY)), ids, data.generatedAt, available);
        if (session && available) {
            session = refreshSession(inputs(), session);
        }
        render();
    });
    return { render };
}
