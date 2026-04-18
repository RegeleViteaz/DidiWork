# Checklist de révision

Application React/Vite pour checklists de révision de projets d'architecture.

## Prérequis

- **Node.js 18+** ([nodejs.org](https://nodejs.org/))
- npm (inclus avec Node.js)

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

Ouvre `http://localhost:5173` dans le navigateur. Vite recharge automatiquement à chaque modification.

## Build de production

```bash
npm run build
npm run preview
```

Les fichiers finaux sont générés dans `dist/`.

## Architecture

```
.
├── index.html              # Point d'entrée HTML
├── package.json            # Dépendances
├── vite.config.js          # Config Vite
├── tailwind.config.js      # Config Tailwind
├── postcss.config.js       # Config PostCSS
└── src/
    ├── main.jsx            # Point d'entrée React + polyfill storage
    ├── App.jsx             # ⭐ L'app au complet (tout est ici)
    └── index.css           # Tailwind + fonte de base
```

### Storage

L'app utilise une API `window.storage` (copie de l'API artifacts de Claude.ai). Un polyfill dans `src/main.jsx` la redirige vers `localStorage` pour que l'app fonctionne localement sans modification.

Clé de stockage : `checklist_revision_base_v1`

### Hiérarchie des données

```
Projet (dont un seul est le Gabarit avec isTemplate: true)
  └── Phases
      └── Grandes tâches (groups)
          └── Items
              └── Blocs d'explication (text | image, style Notion)
```

### Calcul de progression

- **Groupe %** : moyenne d'items cochés
- **Phase %** : moyenne des % de ses groupes (un groupe vide = 0 %)
- **Projet %** : moyenne des % de ses phases

## Travailler avec Claude Code

Dans le terminal de WebStorm :

```bash
claude
```

Exemples de prompts utiles :

- « Ajoute un bouton de duplication de projet dans la ProjectBar »
- « Les blocs d'image devraient permettre d'ajouter une légende en dessous »
- « Ajoute un raccourci clavier Cmd+K pour ouvrir la recherche de grandes tâches »
- « Migre les fonctions computeGroup/computePhase/computeProject dans src/lib/progress.js »

## Fonctionnalités

- ✅ Multi-projets avec sauvegarde auto
- ✅ Gabarit (template) cloneable pour créer de nouveaux projets
- ✅ Hiérarchie 3 niveaux : Phase → Grande tâche → Item
- ✅ Explications style Notion (blocs texte + image ré-ordonnables)
- ✅ Barre sommaire collante avec saut direct aux grandes tâches
- ✅ Bouton retour-en-haut flottant
- ✅ Filtre « Masquer complétés »
- ✅ Cocher/décocher en lot par grande tâche
- ✅ Export/Import JSON
- ✅ Pourcentages pondérés par grande tâche

## Licence

Privée.
