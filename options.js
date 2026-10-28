const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "claude-haiku-5-5",
  explanationLanguage: "French",
};

const form = document.getElementById("settings");
const status = document.getElementById("status");
const fields = Object.keys(DEFAULT_SETTINGS).map((key) => document.getElementById(key));

chrome.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
  for (const field of fields) field.value = settings[field.id];
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = Object.fromEntries(fields.map((field) => [field.id, field.value.trim()]));
  settings.model ||= DEFAULT_SETTINGS.model;
  await chrome.storage.local.set(settings);
  status.textContent = "Enregistré.";
  setTimeout(() => (status.textContent = ""), 2000);
});
