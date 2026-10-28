const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "claude-sonnet-5-5",
  explanationLanguage: "French",
  historyEnabled: true,
};

const form = document.getElementById("settings");
const status = document.getElementById("status");
const fields = Object.keys(DEFAULT_SETTINGS).map((key) => document.getElementById(key));

const readField = (field) => (field.type === "checkbox" ? field.checked : field.value.trim());

chrome.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
  for (const field of fields) {
    if (field.type === "checkbox") field.checked = settings[field.id];
    else field.value = settings[field.id];
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = Object.fromEntries(fields.map((field) => [field.id, readField(field)]));
  settings.model ||= DEFAULT_SETTINGS.model;
  await chrome.storage.local.set(settings);
  status.textContent = "Enregistré.";
  setTimeout(() => (status.textContent = ""), 2000);
});
