// Issue categories, shared by the content script and the history page.
// Order = display order (errors first, optional style suggestions last).
// Colours: validated categorical palette, one step per mode, assigned in this fixed order.
const PROOFMATE_CATEGORIES = {
  grammar: { label: "Grammaire", light: "#2a78d6", dark: "#3987e5" },
  spelling: { label: "Orthographe", light: "#eb6834", dark: "#d95926" },
  punctuation: { label: "Ponctuation", light: "#1baf7a", dark: "#199e70" },
  word_choice: { label: "Choix du mot", light: "#eda100", dark: "#c98500" },
  phrasing: { label: "Tournure", light: "#e87ba4", dark: "#d55181" },
  style: { label: "Style", light: "#008300", dark: "#008300" },
};

// CSS custom properties (--cat-<id>) for one mode, to inline in a stylesheet.
function proofmateCategoryVars(mode) {
  return Object.entries(PROOFMATE_CATEGORIES)
    .map(([id, category]) => `--cat-${id}: ${category[mode]};`)
    .join(" ");
}
