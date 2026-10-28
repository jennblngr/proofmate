# Proofmate

Extension Chrome / Firefox qui relève les erreurs d'anglais dans les champs de texte
(typos, grammaire, ponctuation, choix du mot, tournures peu naturelles) et explique
chaque erreur en français, avec une correction applicable en un clic.

L'analyse est faite par Claude (API Anthropic), appelé directement depuis l'extension.

## Installation (mode développeur)

**Chrome / Edge / Brave**
1. Ouvrir `chrome://extensions`, activer « Mode développeur ».
2. « Charger l'extension non empaquetée » → choisir ce dossier.

**Firefox** (121+)
1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. « Charger un module complémentaire temporaire » → choisir `manifest.json`.
3. Dans `about:addons` → Proofmate → Permissions, autoriser l'accès aux sites
   si Firefox ne l'a pas accordé automatiquement.

Puis cliquer sur l'icône de l'extension pour ouvrir les réglages et coller la clé API.

## Utilisation

- Un bouton « Vérifier » apparaît en bas à droite du champ actif (`textarea`,
  `input` texte, zones `contenteditable`).
- Raccourci : **Alt+Shift+K** (modifiable dans `chrome://extensions/shortcuts`).
- Le panneau liste les erreurs : catégorie, original → correction, explication,
  bouton « Appliquer » (ou « Tout corriger »). Les corrections passent par
  `insertText`, donc Ctrl/Cmd+Z fonctionne.

## Fichiers

- `manifest.json` : Manifest V3, commun à Chrome et Firefox.
- `background.js` : appel à l'API Messages avec une sortie JSON structurée.
- `content.js` : détection du champ, bouton, panneau (Shadow DOM), application des corrections.
- `options.html` / `options.js` : clé API, modèle, langue des explications.

## Limites connues

- Le texte du champ est envoyé à l'API Anthropic à chaque vérification.
  Les champs mot de passe, email et URL sont ignorés.
- Pas encore de soulignement dans le texte (prochaine étape).
- Google Docs n'est pas supporté (rendu sur canvas). Les éditeurs riches
  complexes (Notion, Slack…) peuvent mal réagir à l'application des corrections.
- Une correction remplace la première occurrence du passage relevé.
