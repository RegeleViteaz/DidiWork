# CLAUDE.md

Contexte et conventions pour Claude Code dans ce projet.

## Projet

Checklist de révision pour projets d'architecture (Québec). Stack : React 18, Vite, Tailwind CSS, lucide-react. Langue de l'interface : français.

## Structure

Toute la logique de l'app est dans un seul fichier : **`src/App.jsx`**. Aucun backend. Données persistées localement via `localStorage` (polyfill de `window.storage`).

## Conventions de code

- **Langue UI** : français (québécois professionnel)
- **Formatage des boutons** : majuscules avec letter-spacing (style `fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em'`)
- **Titres** : Fraunces serif
- **Corps** : IBM Plex Sans
- **Labels/métadonnées** : IBM Plex Mono
- **Palette** :
  - Fond : `#f6f3ea` (papier calque)
  - Cartes : `#fdfaf1`
  - Bordures : `#d8d2bf`
  - Encre : `#1c1c1c`
  - Texte secondaire : `#7a7566` / `#8a8472`
- **Progression** : vert `#4a6b3a` → olive `#7a8a3e` → ambre `#c7963b` → rouille `#b56548` → gris `#d9d4c7`

## Modèle de données

```js
{
  projects: {
    [projectId]: {
      id, name, createdAt,
      isTemplate: boolean,    // un seul projet à la fois peut être le gabarit
      seeded: boolean,         // empêche le re-seed automatique
      phases: [
        {
          id, name, collapsed, editing,
          groups: [                 // les "grandes tâches"
            {
              id, name, collapsed, editing,
              items: [
                {
                  id, title, checked, expanded, editing,
                  blocks: [         // explications style Notion
                    { id, type: 'text', content: '' },
                    { id, type: 'image', src: 'data:...' }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  activeId: string
}
```

## Règles de calcul (importantes)

- `groupPct(group)` : 0 % si vide, sinon `(done / total) * 100`
- `computePhase` : moyenne des `groupPct` de tous les groupes — **un groupe vide compte comme 0 %**
- `computeProject` : moyenne des % de phases — **une phase vide compte comme 0 %**

## Workflow typique

1. L'app démarre avec un seul projet : **Gabarit** (`isTemplate: true`)
2. L'utilisateur bâtit son gabarit (phases → grandes tâches → items)
3. À « Nouveau projet » : modal `[Utiliser le gabarit] / [Vide]`
4. « Utiliser le gabarit » = deep clone avec IDs régénérés et cases décochées

## Préférences

- **Éviter de fragmenter le code inutilement** : garder `src/App.jsx` monolithique tant que ça reste lisible (~1500 lignes OK). Si refactor demandé, séparer en `src/components/` et `src/lib/`.
- **Pas de dépendances superflues** : rester léger (React, lucide-react, Tailwind, c'est tout).
- **Pas de TypeScript** à moins d'une migration explicite demandée.
- **Pas de routing** : single-page suffisant.
- **Sauvegarde auto** sur chaque changement via `useEffect` observant `projects` et `activeId`.

## Avant d'ajouter une fonctionnalité

1. Vérifier si ça devrait persister dans les données (ajuster le modèle si oui)
2. Penser migration : s'assurer que les projets existants ne cassent pas
3. Maintenir l'esthétique (fonts, couleurs, espacement) cohérente
