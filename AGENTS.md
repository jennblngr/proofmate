# AGENTS.md — Brief de ce projet

## Le projet
- Ce que fait le produit : une extension de navigateur (Firefox et Chrome) qui
  relève mes erreurs d'anglais dans les champs de saisie et explique chacune
  (grammaire, orthographe, ponctuation, choix du mot, tournure, style) avec une
  correction. Les erreurs sont soulignées dans le champ, détaillées dans un
  panneau, et gardées dans un historique pour repérer mes points faibles.
- Pour qui : moi seule. L'extension n'est pas publiée : je la charge à la main
  (Firefox : `about:debugging`, module temporaire ; Chrome : mode
  développeur). Elle appelle l'API Claude avec ma propre clé, facturée à
  l'usage (environ 1 centime par vérification avec Sonnet).
- Ce que je ne veux jamais casser :
  1. les données sensibles (numéros de carte, mots de passe, codes…) ne
     partent jamais vers l'API ;
  2. ma clé API reste dans le navigateur et n'est envoyée qu'à
     `api.anthropic.com` ;
  3. mon texte n'est jamais modifié sans action de ma part (« Appliquer »,
     « Tout corriger ») ;
  4. l'historique de mes erreurs : aucune mise à jour ne doit le perdre.

## Langue
- On se parle en français. Mais le CODE — noms de variables, de fichiers,
  commentaires — s'écrit EN ANGLAIS. Ne code jamais en français parce qu'on
  discute en français.
- Même règle sur le dépôt : messages de commit en anglais.
- L'interface de l'extension est en français uniquement, en tutoyant
  (« Tes points faibles »). Le prompt envoyé à Claude est en anglais ; les
  explications sont rédigées dans la langue choisie dans les réglages
  (français par défaut).

## Comment je veux qu'on travaille
- Je pilote ce projet SANS lire le code. Je supervise le produit, pas les
  fichiers.
- Applique les meilleures pratiques par défaut, même si je ne les demande pas.
- Vérifie la syntaxe (`node --check` sur chaque fichier JS, manifeste JSON
  valide) et teste ce qui peut l'être sans ma clé avant de me dire qu'une
  tâche est finie (voir « Conventions »).
- Quand une tâche est finie, dis-moi précisément quoi tester à la main, comme
  un utilisateur, et rappelle-moi de recharger l'extension puis l'onglet.
- Va droit au but : pas de pédagogie non demandée. Je poserai mes questions
  quand quelque chose me perdra.
- Annonce ton plan et attends mon accord uniquement sur les chantiers qui
  risquent de casser les quatre points critiques ci-dessus, ou qui augmentent
  le coût des vérifications.

## Commits
- Le projet est un dépôt git local, sans dépôt distant pour l'instant.
- Fais TOUJOURS des commits au format `feature(scope): message`,
  `bugfix(scope): message` ou `refactoring(scope): message`, en anglais, à
  chaque tâche terminée. Je n'en écrirai jamais un moi-même.
- Commite directement une fois la tâche finie et mon test validé, sans me
  demander avant.
- Ne pousse jamais sans mon accord.
- Les commits sont signés avec mon adresse `jennblngr@gmail.com` (réglée pour ce
  dépôt uniquement). N'ajoute jamais de mention « Co-Authored-By: Claude » ni
  de signature d'outil dans les commits ou les pull requests.

## RÈGLE VIVANTE
Chaque fois qu'une ligne de ce fichier me gêne à l'usage — trop de questions,
pas assez, du jargon, des explications inutiles — je te demande de la modifier
ici, et tu t'y tiens ensuite. Ce brief s'ajuste à moi, pas l'inverse.
Quand je corrige une de tes habitudes, propose-moi de noter cette préférence
ici pour les prochaines sessions.
N'inscris jamais de secret dans ce fichier (clé API, notamment).

## Garde-fous — demande-moi TOUJOURS avant de :
- ajouter une permission ou un site à `manifest.json` ;
- envoyer des données à un autre service qu'`api.anthropic.com`, ou ajouter
  une dépendance ;
- changer ce qui part vers l'API (texte envoyé, contexte ajouté) ;
- assouplir la détection des champs sensibles ;
- changer le modèle par défaut, ou tout ce qui augmente le coût d'une
  vérification (vérification automatique pendant la frappe, prompt beaucoup
  plus long…) ;
- changer le format de l'historique ou des réglages enregistrés ;
- supprimer des données, des fichiers, ou faire une action irréversible ;
- pousser vers un dépôt distant.

Interdits, même si c'est techniquement possible :
- lire, afficher ou copier ma clé API ;
- faire un vrai appel à l'API avec ma clé : je teste moi-même.
Dans ces cas : explique-moi le risque en langage simple, propose, et attends
que je valide.

## La ligne rouge — non négociable
Ce produit doit, en permanence, respecter ces règles. Si tu vois que l'une
d'elles est violée, préviens-moi immédiatement.
1. Rien n'est envoyé sans que je le demande (bouton « Vérifier » ou
   Alt+Shift+K) : pas de vérification automatique.
2. Un champ sensible n'affiche jamais le bouton et n'est jamais envoyé ; un
   texte contenant un numéro de carte valide est bloqué avant l'envoi.
3. Le texte envoyé ne contient que le contenu du champ vérifié, rien d'autre de
   la page.
4. La clé API et l'historique restent dans le stockage local de l'extension.
5. Aucune donnée n'est envoyée ailleurs qu'à `api.anthropic.com`.

## Conventions et décisions prises
- WebExtension Manifest V3, un seul `manifest.json` pour Firefox (121+) et
  Chrome. JavaScript simple, sans étape de construction ni dépendance npm : le
  dossier se charge tel quel dans le navigateur.
- API `chrome.*` avec promesses (Firefox la fournit aussi).
- `background.js` appelle l'API Claude par `fetch` (pas de SDK, pour rester
  sans construction), avec réponse au format JSON imposé par un schéma.
  Modèle par défaut `claude-sonnet-5-5` (Haiku essayé : explications fausses).
- `content.js` : bouton, panneau et soulignements dans un Shadow DOM
  (`<proofmate-ui>`), pour ne pas subir le style des sites. Les soulignements
  se mesurent avec une copie invisible du champ (textarea, input) ou avec les
  `Range` (contenteditable).
- Un champ est repéré à la prise du focus, mais aussi à la frappe et au
  raccourci : GitLab place le curseur lui-même, et le focus pouvait nous
  échapper (corrigé le 30/10/2026).
- Le bouton n'apparaît qu'à partir de deux mots (protection des champs
  numériques).
- Catégories et couleurs dans `categories.js`, partagé entre le panneau et la
  page d'historique. Palette lisible pour les daltoniens, vérifiée en clair et
  en sombre.
- Historique dans le stockage local : dédoublonné sur 12 h, 2 000 dernières
  erreurs, désactivable dans les réglages. Chaque erreur porte une « règle »
  générique ; les règles déjà vues sont renvoyées à Claude pour qu'il réutilise
  le même libellé.
- Le clic sur l'icône de l'extension ouvre l'historique ; les réglages
  s'ouvrent depuis l'historique ou `about:addons`.
- Tests : Chrome sans fenêtre piloté par `playwright-core`, installé hors du
  dépôt, avec de fausses réponses de l'API. Le vrai appel et Firefox, c'est
  moi qui les teste.
- Demande-moi de tenir cette liste à jour.

## Où on en est
- Fait : vérification à la demande, panneau groupé par catégorie,
  soulignements dans le champ, historique avec points faibles. Testé par moi
  dans Firefox (GitHub, GitLab).
- Pistes évoquées, non décidées :
  1. vérification automatique pendant la frappe (avec garde-fous de coût) ;
  2. mode mixte Haiku pour détecter, Sonnet pour expliquer ;
  3. Google Docs (non pris en charge pour l'instant).
