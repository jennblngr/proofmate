// Content script: shows a "Vérifier" button on the focused text field,
// sends its text to the background script, underlines the issues in the field
// and lists them in a panel.

(() => {
  if (window.__proofmateLoaded) return;
  window.__proofmateLoaded = true;

  // email/url inputs are excluded: they don't support setSelectionRange.
  const TEXT_INPUT_TYPES = new Set(["", "text", "search"]);
  // Fields we must never read: payment, credentials, one-time codes, personal identifiers.
  const SENSITIVE_AUTOCOMPLETE = ["cc-", "one-time-code", "current-password", "new-password", "tel", "postal-code", "bday", "transaction-"];
  const SENSITIVE_NAME = /\b(card|cc|cvv|cvc|csc|iban|bic|swift|ssn|pin|otp)\b|card.?num|cc.?(num|exp)|security.?code|expir|passw|carte|cryptogramme|mot.?de.?passe/i;
  const NUMERIC_INPUT_MODES = new Set(["numeric", "decimal", "tel"]);
  // At least two words containing letters: skips card numbers, dates, amounts, codes…
  const PROSE = /\p{L}{2,}.*\s.*\p{L}{2,}/su;
  const CARD_NUMBER = /\b\d(?:[ -]?\d){12,18}\b/g;
  // Display order of the groups in the panel: errors first, optional style suggestions last.
  const CATEGORY_LABELS = {
    grammar: "Grammaire",
    spelling: "Orthographe",
    punctuation: "Ponctuation",
    word_choice: "Choix du mot",
    phrasing: "Tournure",
    style: "Style",
  };
  const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
  const isError = (issue) => issue.category !== "style";

  // Styles copied from a textarea/input onto the hidden mirror used to measure text positions.
  const MIRRORED_PROPERTIES = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch",
    "letterSpacing", "wordSpacing", "lineHeight", "textTransform", "textIndent", "textAlign",
    "tabSize", "direction", "whiteSpace", "overflowWrap", "wordBreak",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  ];

  const STYLES = `
    :host {
      all: initial;
      --bg: #ffffff; --fg: #1d1d1f; --muted: #6e6e73; --border: #d2d2d7;
      --accent: #4f46e5; --accent-fg: #ffffff; --del: #c62828; --ins: #2e7d32; --hover: #f2f2f7;
      --cat-grammar: #d32f2f; --cat-spelling: #e65100; --cat-punctuation: #b28704;
      --cat-word_choice: #7b1fa2; --cat-phrasing: #1565c0; --cat-style: #00897b;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #1f1f23; --fg: #f2f2f7; --muted: #a1a1aa; --border: #3a3a40;
        --accent: #818cf8; --accent-fg: #111114; --del: #ef9a9a; --ins: #a5d6a7; --hover: #2a2a30;
        --cat-grammar: #ef9a9a; --cat-spelling: #ffb74d; --cat-punctuation: #fff176;
        --cat-word_choice: #ce93d8; --cat-phrasing: #90caf9; --cat-style: #80cbc4;
      }
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    ${CATEGORY_ORDER.map((c) => `.cat-${c} { --dot: var(--cat-${c}); }`).join("\n    ")}

    .mirror {
      position: fixed; box-sizing: border-box; overflow: hidden; margin: 0;
      visibility: hidden; pointer-events: none; border-style: solid; border-color: transparent;
    }
    .underlines { position: fixed; inset: 0; pointer-events: none; }
    .underline { position: fixed; height: 2px; border-radius: 1px; background: var(--dot); }
    .underline.cat-style {
      background: repeating-linear-gradient(90deg, var(--dot) 0 4px, transparent 4px 7px);
    }
    .underline.hovered { height: 3px; }

    .trigger, .panel {
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: var(--fg);
    }
    button { font: inherit; cursor: pointer; }
    .trigger {
      position: fixed; padding: 2px 9px; border: none; border-radius: 999px;
      background: var(--accent); color: var(--accent-fg); font-size: 12px; font-weight: 600;
      opacity: .6; box-shadow: 0 1px 4px rgba(0,0,0,.25); transition: opacity .15s;
    }
    .trigger:hover { opacity: 1; }
    .panel {
      position: fixed; display: flex; flex-direction: column; overflow: hidden;
      background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.22);
    }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; border-bottom: 1px solid var(--border);
    }
    .title { font-weight: 700; }
    .close { border: none; background: none; color: var(--muted); font-size: 18px; line-height: 1; padding: 0 2px; }
    .body { overflow-y: auto; padding: 10px 12px; }
    .status, .empty, .error { margin: 4px 0; }
    .error { color: var(--del); }
    .group + .group { margin-top: 14px; }
    .group-title {
      display: flex; align-items: center; gap: 6px; margin: 0 0 2px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
    }
    .group-title::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--dot); }
    .group-hint { font-weight: 400; text-transform: none; letter-spacing: 0; }
    .issues { list-style: none; margin: 0; padding: 0; }
    .issue { padding: 8px 6px 10px 10px; border-left: 2px solid var(--dot); margin-top: 6px; border-radius: 0 6px 6px 0; }
    .issue.focused { background: var(--hover); }
    .issue.applied { opacity: .5; }
    .diff { margin: 0 0 4px; }
    del { color: var(--del); }
    ins { color: var(--ins); text-decoration: none; font-weight: 600; }
    .explanation { margin: 0 0 8px; color: var(--muted); }
    .body button, footer button {
      padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--bg); color: var(--fg);
    }
    .body button:hover:not(:disabled), footer button:hover:not(:disabled) { background: var(--hover); }
    button:disabled { cursor: default; color: var(--muted); }
    footer { padding: 8px 12px; border-top: 1px solid var(--border); text-align: right; }
    footer button { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    footer button:hover:not(:disabled) { background: var(--accent); opacity: .9; }
  `;

  let ui = null;
  let activeField = null; // field that currently has focus
  let panelField = null; // field the open panel refers to
  let session = null; // last successful check: { field, issues }, drives the panel and the underlines
  let hoveredIndex = -1; // issue hovered or focused in the panel, drawn thicker
  let requestId = 0;
  let repositionQueued = false;
  const resizeObserver = new ResizeObserver(() => queueReposition());

  const isTextControl = (field) => field.tagName === "INPUT" || field.tagName === "TEXTAREA";
  const getText = (field) => (isTextControl(field) ? field.value : field.innerText);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function isSensitive(el) {
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/);
    if (autocomplete.some((token) => SENSITIVE_AUTOCOMPLETE.some((prefix) => token.startsWith(prefix)))) {
      return true;
    }
    if (NUMERIC_INPUT_MODES.has((el.getAttribute("inputmode") || "").toLowerCase())) return true;
    const labels = ["name", "id", "placeholder", "aria-label"].map((attr) => el.getAttribute(attr) || "");
    return labels.some((label) => SENSITIVE_NAME.test(label));
  }

  // Luhn check, to catch card numbers typed in an otherwise innocent field.
  function containsCardNumber(text) {
    return (text.match(CARD_NUMBER) || []).some((match) => {
      const digits = match.replace(/\D/g, "");
      let sum = 0;
      for (let i = 0; i < digits.length; i++) {
        let d = Number(digits[digits.length - 1 - i]);
        if (i % 2 === 1 && (d *= 2) > 9) d -= 9;
        sum += d;
      }
      return sum % 10 === 0;
    });
  }

  function findEditable(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    if (el.tagName === "TEXTAREA") return el.readOnly || el.disabled || isSensitive(el) ? null : el;
    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      return TEXT_INPUT_TYPES.has(type) && !el.readOnly && !el.disabled && !isSensitive(el) ? el : null;
    }
    if (!el.isContentEditable) return null;
    let root = el;
    while (root.parentElement?.isContentEditable) root = root.parentElement;
    return root;
  }

  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function ensureUI() {
    if (ui) return ui;
    const host = document.createElement("proofmate-ui");
    host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="mirror" aria-hidden="true"></div>
      <div class="underlines" aria-hidden="true"></div>
      <button class="trigger" type="button" hidden>Vérifier</button>
      <div class="panel" role="dialog" aria-label="Proofmate" hidden></div>`;
    document.documentElement.appendChild(host);

    const trigger = shadow.querySelector(".trigger");
    const panel = shadow.querySelector(".panel");
    // Keep the focus (and the caret) in the page's field when clicking our UI.
    shadow.addEventListener("mousedown", (event) => event.preventDefault());
    trigger.addEventListener("click", () => activeField && runCheck(activeField));
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("mouseover", (event) => {
      const item = event.target.closest("li[data-index]");
      setHovered(item ? Number(item.dataset.index) : -1);
    });
    panel.addEventListener("mouseleave", () => setHovered(-1));

    ui = {
      host,
      trigger,
      panel,
      mirror: shadow.querySelector(".mirror"),
      underlines: shadow.querySelector(".underlines"),
    };
    return ui;
  }

  // --- Positioning ---------------------------------------------------------

  function positionTrigger() {
    if (!ui) return;
    const { trigger } = ui;
    if (!activeField || !activeField.isConnected) {
      trigger.hidden = true;
      return;
    }
    const rect = activeField.getBoundingClientRect();
    const onScreen = rect.bottom > 0 && rect.top < innerHeight && rect.width > 60;
    trigger.hidden = !onScreen || !PROSE.test(getText(activeField));
    if (trigger.hidden) return;

    const { offsetWidth: width, offsetHeight: height } = trigger;
    const top = rect.height < height + 12 ? rect.top + (rect.height - height) / 2 : rect.bottom - height - 6;
    trigger.style.left = `${Math.max(4, Math.min(rect.right - width - 6, innerWidth - width - 4))}px`;
    trigger.style.top = `${Math.max(4, top)}px`;
  }

  function positionPanel() {
    if (!ui || ui.panel.hidden || !panelField) return;
    const { panel } = ui;
    const rect = panelField.getBoundingClientRect();
    const width = Math.min(380, innerWidth - 16);
    const spaceBelow = innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const below = spaceBelow >= 240 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(innerHeight * 0.7, Math.max(160, (below ? spaceBelow : spaceAbove) - 16));

    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
    if (below) {
      panel.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - 160))}px`;
      panel.style.bottom = "auto";
    } else {
      panel.style.bottom = `${Math.max(8, innerHeight - rect.top + 6)}px`;
      panel.style.top = "auto";
    }
  }

  function queueReposition() {
    if (repositionQueued) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      positionTrigger();
      positionPanel();
      renderUnderlines();
    });
  }

  // --- Locating text in the field -----------------------------------------

  // Text nodes of a contenteditable, with their offset in the concatenated text.
  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push({ node, start: text.length });
      text += node.data;
    }
    return { nodes, text };
  }

  // Finds `needle` in a contenteditable, even when it spans several text nodes.
  function findTextRange(root, needle) {
    const { nodes, text } = collectTextNodes(root);
    const start = text.indexOf(needle);
    if (start === -1) return null;
    const end = start + needle.length;

    const locate = (offset, inclusive) => {
      const hit = nodes.find(({ node, start: s }) =>
        inclusive ? offset <= s + node.length : offset < s + node.length,
      );
      return [hit.node, offset - hit.start];
    };
    const range = document.createRange();
    range.setStart(...locate(start, false));
    range.setEnd(...locate(end, true));
    return range;
  }

  // Textareas and inputs don't expose their text layout, so we copy the field's
  // styles and text onto a hidden div placed exactly over it, and measure that.
  function syncMirror(field) {
    const { mirror } = ui;
    const style = getComputedStyle(field);
    for (const property of MIRRORED_PROPERTIES) mirror.style[property] = style[property];

    const borderX = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    const scrollbar = Math.max(0, field.offsetWidth - field.clientWidth - borderX);
    const rect = field.getBoundingClientRect();
    mirror.style.left = `${rect.left}px`;
    mirror.style.top = `${rect.top}px`;
    mirror.style.width = `${field.offsetWidth - scrollbar}px`;
    mirror.style.height = `${field.offsetHeight}px`;

    if (field.tagName === "INPUT") {
      // Single line, vertically centred like the input's own text.
      mirror.style.whiteSpace = "pre";
      const contentHeight = field.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      mirror.style.lineHeight = `${contentHeight}px`;
    }
    // The extra space keeps a trailing newline measurable; offsets are unaffected.
    mirror.textContent = `${field.value} `;
    mirror.scrollTop = field.scrollTop;
    mirror.scrollLeft = field.scrollLeft;
    return mirror.firstChild;
  }

  // Returns a function giving the on-screen rectangles of a passage of `field`.
  function rectsFinder(field) {
    if (!isTextControl(field)) {
      return (needle) => findTextRange(field, needle)?.getClientRects() ?? [];
    }
    const textNode = syncMirror(field);
    const { value } = field;
    return (needle) => {
      const start = value.indexOf(needle);
      if (start === -1) return [];
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + needle.length);
      return range.getClientRects();
    };
  }

  // Caret position as an offset in the same text the issues are searched in.
  function caretOffset(field) {
    if (isTextControl(field)) {
      return field.selectionStart === field.selectionEnd ? field.selectionStart : null;
    }
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return null;
    const hit = collectTextNodes(field).nodes.find(({ node }) => node === selection.anchorNode);
    return hit ? hit.start + selection.anchorOffset : null;
  }

  function issueAtOffset(offset) {
    const text = isTextControl(session.field) ? session.field.value : collectTextNodes(session.field).text;
    return session.issues.findIndex((issue) => {
      if (issue.done) return false;
      const start = text.indexOf(issue.original);
      return start !== -1 && offset >= start && offset <= start + issue.original.length;
    });
  }

  // --- Underlines ----------------------------------------------------------

  function renderUnderlines() {
    if (!ui) return;
    ui.underlines.replaceChildren();
    if (!session) return;
    const { field, issues } = session;
    if (!field.isConnected) {
      clearSession();
      return;
    }
    const pending = issues.map((issue, index) => ({ issue, index })).filter(({ issue }) => !issue.done);
    if (!pending.length) return;

    // Only draw inside the visible part of the field.
    const rect = field.getBoundingClientRect();
    const clip = {
      left: rect.left + field.clientLeft,
      top: rect.top + field.clientTop,
      right: rect.left + field.clientLeft + field.clientWidth,
      bottom: rect.top + field.clientTop + field.clientHeight,
    };
    if (clip.right <= clip.left || clip.bottom <= clip.top) return;

    const rectsOf = rectsFinder(field);
    const lines = [];
    for (const { issue, index } of pending) {
      for (const box of rectsOf(issue.original)) {
        const left = Math.max(box.left, clip.left);
        const right = Math.min(box.right, clip.right);
        if (right <= left || box.bottom < clip.top + 4 || box.bottom > clip.bottom + 2) continue;
        const line = document.createElement("div");
        line.className = `underline cat-${issue.category}${index === hoveredIndex ? " hovered" : ""}`;
        line.style.left = `${left}px`;
        line.style.top = `${box.bottom - 2}px`;
        line.style.width = `${right - left}px`;
        lines.push(line);
      }
    }
    ui.underlines.append(...lines);
  }

  function setHovered(index) {
    if (index === hoveredIndex) return;
    hoveredIndex = index;
    renderUnderlines();
  }

  function clearSession() {
    if (session) resizeObserver.unobserve(session.field);
    session = null;
    hoveredIndex = -1;
    if (ui) ui.underlines.replaceChildren();
  }

  // --- Panel ---------------------------------------------------------------

  function renderPanel(bodyHtml, footerHtml = "") {
    const { panel } = ensureUI();
    panel.innerHTML = `
      <header>
        <span class="title">Proofmate</span>
        <button class="close" type="button" data-action="close" aria-label="Fermer">×</button>
      </header>
      <div class="body">${bodyHtml}</div>
      ${footerHtml ? `<footer>${footerHtml}</footer>` : ""}`;
    panel.hidden = false;
    positionPanel();
  }

  function renderResults() {
    const { issues } = session;
    if (!issues.length) {
      renderPanel(`<p class="empty">Aucune erreur trouvée.</p>`);
      return;
    }
    const groups = CATEGORY_ORDER.map((category) => {
      const items = issues
        .map((issue, index) => ({ issue, index }))
        .filter(({ issue }) => issue.category === category);
      if (!items.length) return "";
      const hint = category === "style" ? ` <span class="group-hint">· suggestions facultatives</span>` : "";
      const list = items
        .map(({ issue, index }) => {
          const button = issue.done
            ? `<button type="button" disabled>Traité</button>`
            : `<button type="button" data-action="apply" data-index="${index}">Appliquer</button>`;
          return `
          <li class="issue${issue.done ? " applied" : ""}" data-index="${index}">
            <p class="diff"><del>${escapeHtml(issue.original)}</del> → <ins>${escapeHtml(issue.correction)}</ins></p>
            <p class="explanation">${escapeHtml(issue.explanation)}</p>
            ${button}
          </li>`;
        })
        .join("");
      return `
        <section class="group cat-${category}">
          <h3 class="group-title">${CATEGORY_LABELS[category]} (${items.length})${hint}</h3>
          <ul class="issues">${list}</ul>
        </section>`;
    }).join("");

    // "Tout corriger" only applies real errors; style suggestions stay one by one.
    const remaining = issues.filter((issue) => !issue.done && isError(issue)).length;
    renderPanel(
      groups,
      issues.some(isError)
        ? `<button type="button" data-action="apply-all"${remaining ? "" : " disabled"}>Tout corriger (${remaining})</button>`
        : "",
    );
  }

  // Opens the panel on the results and highlights one issue (clicked in the text).
  function showIssue(index) {
    panelField = session.field;
    renderResults();
    const item = ui.panel.querySelector(`li[data-index="${index}"]`);
    item.classList.add("focused");
    item.scrollIntoView({ block: "nearest" });
    setHovered(index);
  }

  function closePanel() {
    requestId++; // ignore any response still in flight
    panelField = null;
    if (ui) ui.panel.hidden = true;
    setHovered(-1);
  }

  function onPanelClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    switch (target.dataset.action) {
      case "close":
        closePanel();
        break;
      case "apply":
        applyIssue(Number(target.dataset.index));
        break;
      case "apply-all":
        session.issues.forEach((issue, index) => !issue.done && isError(issue) && applyIssue(index));
        break;
      case "open-options":
        chrome.runtime.sendMessage({ type: "proofmate:open-options" });
        break;
    }
  }

  function applyIssue(index) {
    const issue = session?.issues[index];
    if (!issue || issue.done) return;
    const applied = replaceInField(session.field, issue.original, issue.correction);
    issue.done = true;
    renderUnderlines();

    const item = ui.panel.querySelector(`li[data-index="${index}"]`);
    if (!item) return;
    const button = item.querySelector("button");
    button.disabled = true;
    if (applied) {
      item.classList.add("applied");
      button.textContent = "Appliqué";
    } else {
      button.textContent = "Introuvable";
      button.title = "Ce passage a changé depuis la vérification.";
    }

    const applyAll = ui.panel.querySelector('[data-action="apply-all"]');
    if (!applyAll) return;
    const remaining = session.issues.filter((i) => !i.done && isError(i)).length;
    applyAll.textContent = `Tout corriger (${remaining})`;
    applyAll.disabled = remaining === 0;
  }

  // --- Replacing text in the page's field ----------------------------------

  function replaceInField(field, original, correction) {
    if (!field?.isConnected) return false;
    field.focus();

    if (isTextControl(field)) {
      const start = field.value.indexOf(original);
      if (start === -1) return false;
      const expected = field.value.slice(0, start) + correction + field.value.slice(start + original.length);
      field.setSelectionRange(start, start + original.length);
      // insertText keeps the browser's undo history and is seen by frameworks as user input.
      document.execCommand("insertText", false, correction);
      if (field.value !== expected) {
        // Fallback: use the prototype setter so React & co. notice the change.
        const { set } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value");
        set.call(field, expected);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    }

    const range = findTextRange(field, original);
    if (!range) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, correction);
    return true;
  }

  // --- Checking ------------------------------------------------------------

  async function runCheck(field) {
    const text = getText(field).trim();
    if (!PROSE.test(text)) return;

    const id = ++requestId;
    panelField = field;
    if (containsCardNumber(text)) {
      renderPanel(`<p class="error">Ce texte semble contenir un numéro de carte : rien n'a été envoyé.</p>`);
      return;
    }
    renderPanel(`<p class="status">Analyse en cours…</p>`);

    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "proofmate:check", text });
    } catch {
      response = { ok: false, error: "L'extension a été rechargée : recharge la page." };
    }
    if (id !== requestId) return; // panel closed or another check started

    if (!response?.ok) {
      const action =
        response?.code === "no_key"
          ? `<button type="button" data-action="open-options">Configurer la clé API</button>`
          : "";
      renderPanel(`<p class="error">${escapeHtml(response?.error || "Erreur inconnue.")}</p>${action}`);
      return;
    }
    clearSession();
    session = { field, issues: response.result.issues.map((issue) => ({ ...issue, done: false })) };
    resizeObserver.observe(field);
    renderResults();
    renderUnderlines();
  }

  // --- Events --------------------------------------------------------------

  document.addEventListener(
    "focusin",
    (event) => {
      const field = findEditable(event.composedPath()[0]);
      if (!field) return;
      activeField = field;
      ensureUI();
      positionTrigger();
    },
    true,
  );

  document.addEventListener(
    "focusout",
    () => {
      setTimeout(() => {
        if (findEditable(deepActiveElement())) return;
        activeField = null;
        positionTrigger();
      }, 150);
    },
    true,
  );

  document.addEventListener("input", queueReposition, true);
  document.addEventListener("scroll", queueReposition, { capture: true, passive: true });
  window.addEventListener("resize", queueReposition);

  document.addEventListener(
    "mousedown",
    (event) => {
      if (!ui || ui.panel.hidden) return;
      const path = event.composedPath();
      if (path.includes(ui.host) || path.includes(panelField)) return;
      closePanel();
    },
    true,
  );

  // Clicking on an underlined passage opens the panel on that issue.
  document.addEventListener(
    "click",
    (event) => {
      if (!session || !event.composedPath().includes(session.field)) return;
      const offset = caretOffset(session.field);
      if (offset === null) return;
      const index = issueAtOffset(offset);
      if (index !== -1) showIssue(index);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && ui && !ui.panel.hidden) closePanel();
    },
    true,
  );

  // Keyboard shortcut (Alt+Shift+K), relayed by the background script to every frame.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "proofmate:trigger" && activeField && document.hasFocus()) {
      runCheck(activeField);
    }
  });
})();
