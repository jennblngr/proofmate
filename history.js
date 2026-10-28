const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_RULES = 10;
const RECENT_ENTRIES = 30;
const EXAMPLES_PER_RULE = 5;

const content = document.getElementById("content");
const periodButtons = [...document.querySelectorAll(".periods button")];
const darkMode = window.matchMedia("(prefers-color-scheme: dark)");

let periodDays = 30;
let history = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const categoryColor = (id) => PROOFMATE_CATEGORIES[id]?.[darkMode.matches ? "dark" : "light"] ?? "gray";
const categoryLabel = (id) => PROOFMATE_CATEGORIES[id]?.label ?? id;
const dot = (id) => `<span class="dot" style="background:${categoryColor(id)}" aria-hidden="true"></span>`;
const diff = (entry) =>
  `<p class="diff"><del>${escapeHtml(entry.original)}</del> → <ins>${escapeHtml(entry.correction)}</ins></p>`;
const formatDate = (time) =>
  new Date(time).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function renderTiles(entries) {
  const errors = entries.filter((entry) => entry.category !== "style");
  const rules = new Set(errors.map((entry) => entry.rule));
  const tiles = [
    [errors.length, "erreurs relevées"],
    [rules.size, "règles différentes"],
    [entries.length - errors.length, "suggestions de style"],
  ];
  return `<div class="tiles">${tiles
    .map(([value, label]) => `<div class="tile"><div class="tile-value">${value}</div><div class="tile-label">${label}</div></div>`)
    .join("")}</div>`;
}

function renderCategories(entries) {
  const counts = Object.keys(PROOFMATE_CATEGORIES).map((id) => [id, entries.filter((e) => e.category === id).length]);
  const max = Math.max(...counts.map(([, count]) => count));
  const rows = counts
    .map(
      ([id, count]) => `
      <span class="bar-label">${dot(id)}${categoryLabel(id)}</span>
      <div class="bar-track" title="${categoryLabel(id)} : ${count}">
        ${count ? `<div class="bar" style="width:${(count / max) * 100}%;background:${categoryColor(id)}"></div>` : ""}
      </div>
      <span class="bar-value">${count}</span>`,
    )
    .join("");
  return `<section class="card"><h2>Par catégorie</h2><div class="bars">${rows}</div></section>`;
}

function renderRules(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.category === "style") continue;
    const group = groups.get(entry.rule) ?? { rule: entry.rule, entries: [] };
    group.entries.push(entry); // entries are newest first
    groups.set(entry.rule, group);
  }
  const top = [...groups.values()]
    .sort((a, b) => b.entries.length - a.entries.length || b.entries[0].date - a.entries[0].date)
    .slice(0, TOP_RULES);
  if (!top.length) return "";

  const items = top
    .map(({ rule, entries: ruleEntries }) => {
      const examples = ruleEntries
        .slice(0, EXAMPLES_PER_RULE)
        .map((entry) => `<li>${diff(entry)}<p class="explanation">${escapeHtml(entry.explanation)}</p></li>`)
        .join("");
      return `
        <details>
          <summary>${dot(ruleEntries[0].category)}<span class="rule">${escapeHtml(rule)}</span><span class="count">${ruleEntries.length}×</span></summary>
          <ul class="examples">${examples}</ul>
        </details>`;
    })
    .join("");
  return `<section class="card"><h2>Tes points faibles</h2>${items}</section>`;
}

function renderRecent(entries) {
  const items = entries
    .slice(0, RECENT_ENTRIES)
    .map(
      (entry) => `
      <li>
        <div class="meta">${dot(entry.category)}${categoryLabel(entry.category)} · ${escapeHtml(entry.rule)} · ${formatDate(entry.date)}</div>
        ${diff(entry)}
        <p class="explanation">${escapeHtml(entry.explanation)}</p>
      </li>`,
    )
    .join("");
  return `<section class="card"><h2>Récemment</h2><ul class="entries">${items}</ul></section>`;
}

function render() {
  for (const button of periodButtons) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.days) === periodDays));
  }
  const since = periodDays ? Date.now() - periodDays * DAY_MS : 0;
  const entries = history.filter((entry) => entry.date >= since).sort((a, b) => b.date - a.date);
  if (!entries.length) {
    content.innerHTML = `<section class="card"><p class="empty">${
      history.length ? "Rien sur cette période." : "Aucune erreur enregistrée pour l'instant. Lance une vérification dans un champ de texte."
    }</p></section>`;
    return;
  }
  content.innerHTML = renderTiles(entries) + renderCategories(entries) + renderRules(entries) + renderRecent(entries);
}

for (const button of periodButtons) {
  button.addEventListener("click", () => {
    periodDays = Number(button.dataset.days);
    render();
  });
}

document.getElementById("clear").addEventListener("click", async () => {
  if (confirm("Effacer tout l'historique ? Cette action est définitive.")) {
    await chrome.storage.local.remove("history");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "history" in changes) {
    history = changes.history.newValue ?? [];
    render();
  }
});
darkMode.addEventListener("change", render);

chrome.storage.local.get({ history: [] }).then((stored) => {
  history = stored.history;
  render();
});
