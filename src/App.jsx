import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight,
  Image as ImageIcon, FolderPlus, Folder, Upload, Layers,
  Star, StarOff, ArrowUp, Eye, EyeOff, CheckSquare, Square,
  FileText, AlignLeft, Sun, Moon,
} from 'lucide-react';

// ═════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════
const genId = () => Math.random().toString(36).slice(2, 11) + Date.now().toString(36).slice(-4);

const makeTextBlock = (content = '') => ({ id: genId(), type: 'text', content });
const makeImageBlock = (src) => ({ id: genId(), type: 'image', src });

const makeItem = (title = '') => ({
  id: genId(),
  title,
  checked: false,
  blocks: [],      // Notion-style blocks: text + image in order
  expanded: false,
  editing: false,
});

const makeGroup = (name = '') => ({
  id: genId(),
  name,
  collapsed: false,
  editing: false,
  items: [],
});

const makePhase = (name = '') => ({
  id: genId(),
  name,
  collapsed: false,
  editing: false,
  groups: [],
});

const makeEmptyProject = (name, isTemplate = false) => ({
  id: genId(),
  name,
  createdAt: Date.now(),
  isTemplate,
  phases: [],
  seeded: false,
});

// Initial seed phases for a brand-new Gabarit
const createInitialGabaritPhases = () => {
  const mk = (title) => ({ ...makeItem(title) });
  const mkGroup = (name, titles) => ({ ...makeGroup(name), items: titles.map(mk) });
  return [
    {
      ...makePhase('CCU'),
      groups: [
        mkGroup('Plans', [
          'Implantation',
          'Plans d\u2019étages',
          'Plan de toiture',
        ]),
        mkGroup('Élévations', [
          'Hauteurs autorisées',
          'Matériaux extérieurs',
          'Finis et couleurs',
          'Composition et proportions',
        ]),
        mkGroup('Conformité zonage', [
          'Zonage applicable',
          'Marges (avant, latérales, arrière)',
          'CES et CIS',
          'Nombre d\u2019étages',
          'Usages permis',
        ]),
        mkGroup('Documents', [
          'Formulaire de demande',
          'Photos du site',
          'Lettre explicative',
          'Fiche descriptive',
          'Échantillons de matériaux',
        ]),
      ],
    },
  ];
};

// Deep clone a project structure (for template cloning)
const cloneProject = (source, newName) => {
  const clone = JSON.parse(JSON.stringify(source));
  clone.id = genId();
  clone.name = newName;
  clone.createdAt = Date.now();
  clone.isTemplate = false;
  // Regenerate all nested IDs so nothing collides
  clone.phases = clone.phases.map(ph => ({
    ...ph,
    id: genId(),
    collapsed: false,
    editing: false,
    groups: ph.groups.map(g => ({
      ...g,
      id: genId(),
      collapsed: false,
      editing: false,
      items: g.items.map(i => ({
        ...i,
        id: genId(),
        checked: false,      // reset progress on clone
        expanded: false,
        editing: false,
        blocks: (i.blocks || []).map(b => ({ ...b, id: genId() })),
      })),
    })),
  }));
  return clone;
};

// ─── PROGRESS ────────────────────────────────────────────
const groupPct = (group) => {
  const items = group.items || [];
  if (items.length === 0) return 0;
  return (items.filter(i => i.checked).length / items.length) * 100;
};

const computeGroup = (group) => {
  const items = group.items || [];
  const done = items.filter(i => i.checked).length;
  return { pct: Math.round(groupPct(group)), done, total: items.length };
};

const computePhase = (phase) => {
  const groups = phase.groups || [];
  const allItems = groups.flatMap(g => g.items || []);
  const done = allItems.filter(i => i.checked).length;
  const pct = groups.length === 0
    ? 0
    : Math.round(groups.reduce((a, g) => a + groupPct(g), 0) / groups.length);
  return { pct, done, total: allItems.length, groupCount: groups.length };
};

const computeProject = (project) => {
  const phases = project.phases || [];
  const allItems = phases.flatMap(p => (p.groups || []).flatMap(g => g.items || []));
  const done = allItems.filter(i => i.checked).length;
  const pct = phases.length === 0
    ? 0
    : Math.round(phases.reduce((a, p) => {
        const groups = p.groups || [];
        if (groups.length === 0) return a;
        return a + (groups.reduce((b, g) => b + groupPct(g), 0) / groups.length);
      }, 0) / phases.length);
  return { pct, done, total: allItems.length };
};

const progressTone = (pct) => {
  if (pct === 100) return { bar: '#4a6b3a', text: '#4a6b3a' };
  if (pct >= 67)   return { bar: '#7a8a3e', text: '#5e6b2f' };
  if (pct >= 34)   return { bar: '#c7963b', text: '#8a6724' };
  if (pct > 0)     return { bar: '#b56548', text: 'var(--danger)' };
  return { bar: 'var(--border)', text: 'var(--mute)' };
};

// ─── THEMES ──────────────────────────────────────────────
// Implemented as CSS custom properties on a wrapper element.
// This keeps all existing inline styles untouched; we swap the variable
// values based on the active theme. Each inline `color`, `background`, etc.
// will be rewritten to reference var(--x) below.
const THEMES = {
  light: {
    '--bg': '#f6f3ea',
    '--bg-grid': '#e4dfcf',
    '--surface': '#fdfaf1',
    '--surface-alt': '#faf7ec',
    '--surface-hover': '#efeadb',
    '--ink': '#1c1c1c',
    '--ink-invert': '#f6f3ea',
    '--ink-on-dark': '#f6f3ea',
    '--mute': '#7a7566',
    '--mute-soft': '#8a8472',
    '--mute-extra': '#a09a85',
    '--border': '#d8d2bf',
    '--border-soft': '#e4dfcf',
    '--border-faint': '#efeadb',
    '--dash': '#b8b19a',
    '--input-bg': '#f6f3ea',
    '--input-border': '#b8b19a',
    '--danger': '#8a4b33',
    '--danger-bg': '#f0e4d8',
    '--danger-border': '#c7956b',
    '--danger-ink': '#5a3a1e',
    '--success': '#4a6b3a',
    '--success-soft': '#7a8a3e',
    '--nav-overlay': 'rgba(246, 243, 234, 0.97)',
    '--modal-overlay': 'rgba(28, 28, 28, 0.5)',
    '--accent-active': '#1c1c1c',
    '--accent-active-ink': '#f6f3ea',
    '--accent-active-hover': '#2a2a2a',
    '--accent-active-divider': '#3a3a3a',
  },
  dark: {
    '--bg': '#1f1b15',
    '--bg-grid': '#2d2720',
    '--surface': '#2a2520',
    '--surface-alt': '#322c25',
    '--surface-hover': '#3a342c',
    '--ink': '#ece4d2',
    '--ink-invert': '#1f1b15',
    '--ink-on-dark': '#ece4d2',
    '--mute': '#9a9383',
    '--mute-soft': '#807967',
    '--mute-extra': '#6b6555',
    '--border': '#4a4238',
    '--border-soft': '#3a3329',
    '--border-faint': '#2f2921',
    '--dash': '#5c5347',
    '--input-bg': '#1f1b15',
    '--input-border': '#5c5347',
    '--danger': '#d18567',
    '--danger-bg': '#3d251a',
    '--danger-border': '#8a4b33',
    '--danger-ink': '#f0c4a8',
    '--success': '#9fb475',
    '--success-soft': '#b3c390',
    '--nav-overlay': 'rgba(31, 27, 21, 0.95)',
    '--modal-overlay': 'rgba(0, 0, 0, 0.7)',
    '--accent-active': '#ece4d2',
    '--accent-active-ink': '#1f1b15',
    '--accent-active-hover': '#d4cbb5',
    '--accent-active-divider': '#a09a85',
  },
};

const THEME_KEY = 'checklist_revision_theme';
const getStoredTheme = () => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch (e) { /* ignore */ }
  return 'light';
};

// ─── STORAGE ─────────────────────────────────────────────
const STORAGE_KEY = 'checklist_revision_base_v1';

const saveData = async (data) => {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { console.error('Sauvegarde échouée:', e); }
};

const loadData = async () => {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    if (result && result.value) return JSON.parse(result.value);
  } catch (e) { /* nothing saved */ }
  return null;
};

// ═════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════
export default function App() {
  const [projects, setProjects] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const [hideChecked, setHideChecked] = useState(false);
  const [theme, setTheme] = useState(() => getStoredTheme());

  // Persist theme choice
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  // Inject fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch(e){} };
  }, []);

  // Inject theme-aware utility classes (needed when bundled CSS isn't available, e.g. inside an artifact).
  useEffect(() => {
    const id = 'checklist-revision-hover-utils';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .hover-surface { transition: background-color 120ms ease; }
      .hover-surface:hover { background-color: var(--surface-hover); }
      .hover-danger { transition: background-color 120ms ease, color 120ms ease; }
      .hover-danger:hover { background-color: var(--danger-bg); color: var(--danger); }
    `;
    document.head.appendChild(style);
    return () => { try { document.head.removeChild(style); } catch(e){} };
  }, []);

  // Load
  useEffect(() => {
    (async () => {
      const data = await loadData();
      if (data && data.projects && Object.keys(data.projects).length > 0) {
        const next = { ...data.projects };
        // One-time seed: if template has no phases and wasn't seeded, populate with initial content
        const templateId = Object.keys(next).find(id => next[id].isTemplate);
        if (templateId) {
          const tpl = next[templateId];
          if ((!tpl.phases || tpl.phases.length === 0) && !tpl.seeded) {
            next[templateId] = { ...tpl, phases: createInitialGabaritPhases(), seeded: true };
          }
        }
        setProjects(next);
        setActiveId(data.activeId && next[data.activeId] ? data.activeId : Object.keys(next)[0]);
      } else {
        // First launch — create seeded Gabarit
        const g = makeEmptyProject('Gabarit', true);
        g.phases = createInitialGabaritPhases();
        g.seeded = true;
        setProjects({ [g.id]: g });
        setActiveId(g.id);
      }
      setLoaded(true);
    })();
  }, []);

  // Save
  useEffect(() => {
    if (!loaded) return;
    saveData({ projects, activeId });
  }, [projects, activeId, loaded]);

  const active = activeId ? projects[activeId] : null;
  const template = Object.values(projects).find(p => p.isTemplate);

  // ─── PROJECT MUTATIONS ────────────────────────────────
  const updateActive = (updater) => {
    setProjects(prev => ({ ...prev, [activeId]: updater(prev[activeId]) }));
  };

  const createFromTemplate = (name) => {
    if (!template) { createEmpty(name); return; }
    const p = cloneProject(template, name || 'Nouveau projet');
    setProjects(prev => ({ ...prev, [p.id]: p }));
    setActiveId(p.id);
    setShowNewProjectModal(false);
  };

  const createEmpty = (name) => {
    const p = makeEmptyProject(name || 'Nouveau projet', false);
    setProjects(prev => ({ ...prev, [p.id]: p }));
    setActiveId(p.id);
    setShowNewProjectModal(false);
  };

  const deleteProject = (id) => {
    if (projects[id]?.isTemplate) return;  // guard
    setProjects(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeId === id) {
      const remaining = Object.keys(projects).filter(k => k !== id);
      setActiveId(remaining[0] || null);
    }
    setConfirmDeleteProject(null);
  };

  const renameProject = (id, name) => {
    setProjects(prev => ({ ...prev, [id]: { ...prev[id], name } }));
  };

  const setAsTemplate = (id) => {
    setProjects(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], isTemplate: false }; });
      next[id] = { ...next[id], isTemplate: true, seeded: true };
      return next;
    });
  };

  // ─── PHASE / GROUP / ITEM MUTATIONS ───────────────────
  const addPhase = () => updateActive(p => ({ ...p, phases: [...p.phases, { ...makePhase('Nouvelle phase'), editing: true }] }));
  const updatePhase = (phaseId, updater) => updateActive(p => ({ ...p, phases: p.phases.map(ph => ph.id === phaseId ? updater(ph) : ph) }));
  const deletePhase = (phaseId) => updateActive(p => ({ ...p, phases: p.phases.filter(ph => ph.id !== phaseId) }));

  const addGroup = (phaseId) => updatePhase(phaseId, ph => ({ ...ph, groups: [...ph.groups, { ...makeGroup('Nouvelle grande tâche'), editing: true }] }));
  const updateGroup = (phaseId, groupId, updater) => updatePhase(phaseId, ph => ({ ...ph, groups: ph.groups.map(g => g.id === groupId ? updater(g) : g) }));
  const deleteGroup = (phaseId, groupId) => updatePhase(phaseId, ph => ({ ...ph, groups: ph.groups.filter(g => g.id !== groupId) }));

  const addItem = (phaseId, groupId) => updateGroup(phaseId, groupId, g => ({ ...g, items: [...g.items, { ...makeItem('Nouvel item'), editing: true }] }));
  const updateItem = (phaseId, groupId, itemId, updater) => updateGroup(phaseId, groupId, g => ({ ...g, items: g.items.map(i => i.id === itemId ? updater(i) : i) }));
  const deleteItem = (phaseId, groupId, itemId) => updateGroup(phaseId, groupId, g => ({ ...g, items: g.items.filter(i => i.id !== itemId) }));

  const toggleAllInGroup = (phaseId, groupId, targetValue) => {
    updateGroup(phaseId, groupId, g => ({ ...g, items: g.items.map(i => ({ ...i, checked: targetValue })) }));
  };

  // ─── EXPORT / IMPORT ──────────────────────────────────
  // Export modes: 'all' (all projects) | 'active' (just current project)
  const [exportMode, setExportMode] = useState('all');
  // Import modes: 'merge' (add without overwriting) | 'replace' (wipe & load)
  const [importMode, setImportMode] = useState('merge');
  // Snapshot of the active project ID at the moment the export modal opens.
  // Prevents the exported payload from drifting if the user switches projects
  // while the modal is still up.
  const [exportSnapshotId, setExportSnapshotId] = useState(null);

  const openExport = () => {
    setExportMode('all');
    setExportSnapshotId(activeId);
    setShowExport(true);
  };

  const openImport = () => {
    setImportMode('merge');
    setImportError('');
    setImportText('');
    setShowImport(true);
  };

  const snapshotProject = exportSnapshotId ? projects[exportSnapshotId] : null;
  const exportJSON = exportMode === 'active' && snapshotProject
    ? JSON.stringify({ projects: { [snapshotProject.id]: snapshotProject }, activeId: snapshotProject.id }, null, 2)
    : JSON.stringify({ projects, activeId }, null, 2);

  const handleImport = () => {
    try {
      const data = JSON.parse(importText);
      if (!data.projects || typeof data.projects !== 'object' || Object.keys(data.projects).length === 0) {
        setImportError('Format invalide : aucun projet trouvé.'); return;
      }

      if (importMode === 'replace') {
        // Wipe & load — used to restore a full backup
        const incoming = { ...data.projects };
        // Guarantee there's exactly one template in the final state.
        const templateIds = Object.keys(incoming).filter(id => incoming[id].isTemplate);
        if (templateIds.length === 0) {
          // No template in imported data — promote the first project to template
          const firstId = Object.keys(incoming)[0];
          incoming[firstId] = { ...incoming[firstId], isTemplate: true, seeded: true };
        } else if (templateIds.length > 1) {
          // More than one — keep the first, demote the rest
          templateIds.slice(1).forEach(id => {
            incoming[id] = { ...incoming[id], isTemplate: false };
          });
        }
        setProjects(incoming);
        const nextActive = data.activeId && incoming[data.activeId]
          ? data.activeId : Object.keys(incoming)[0];
        setActiveId(nextActive);
      } else {
        // Merge — add imported projects as NEW projects (new IDs, not template)
        // so nothing gets overwritten and the existing template stays the template.
        const merged = { ...projects };
        let firstNewId = null;
        Object.values(data.projects).forEach(p => {
          const cloned = cloneProject(p, p.name || 'Projet importé');
          // cloneProject already sets isTemplate=false and regenerates IDs — exactly what we want
          merged[cloned.id] = cloned;
          if (!firstNewId) firstNewId = cloned.id;
        });
        setProjects(merged);
        if (firstNewId) setActiveId(firstNewId);
      }

      setImportText(''); setImportError(''); setShowImport(false);
    } catch (e) {
      setImportError('JSON invalide : ' + e.message);
    }
  };

  // ─── JUMP-TO for sticky nav ───────────────────────────
  // Auto-expands any collapsed phase/group on the path, then scrolls.
  // Uses requestAnimationFrame to wait for React's commit + layout before scrolling.
  const jumpTo = useCallback((domId) => {
    if (!domId) return;

    let needsLayoutWait = false;

    // Expand collapsed containers so the target is actually in the DOM
    if (activeId) {
      if (domId.startsWith('phase-')) {
        const targetPhaseId = domId.slice(6);
        setProjects(prev => {
          const proj = prev[activeId];
          if (!proj) return prev;
          const targetPhase = proj.phases.find(ph => ph.id === targetPhaseId);
          if (!targetPhase || !targetPhase.collapsed) return prev;
          needsLayoutWait = true;
          return {
            ...prev,
            [activeId]: {
              ...proj,
              phases: proj.phases.map(ph =>
                ph.id === targetPhaseId ? { ...ph, collapsed: false } : ph
              ),
            },
          };
        });
      } else if (domId.startsWith('group-')) {
        const targetGroupId = domId.slice(6);
        setProjects(prev => {
          const proj = prev[activeId];
          if (!proj) return prev;
          let mutated = false;
          const phases = proj.phases.map(ph => {
            if (!ph.groups.some(g => g.id === targetGroupId)) return ph;
            const needsPhaseExpand = ph.collapsed;
            const needsGroupExpand = ph.groups.some(g => g.id === targetGroupId && g.collapsed);
            if (!needsPhaseExpand && !needsGroupExpand) return ph;
            mutated = true;
            return {
              ...ph,
              collapsed: false,
              groups: ph.groups.map(g =>
                g.id === targetGroupId && g.collapsed ? { ...g, collapsed: false } : g
              ),
            };
          });
          if (!mutated) return prev;
          needsLayoutWait = true;
          return { ...prev, [activeId]: { ...proj, phases } };
        });
      }
    }

    // Try an immediate scroll first — works when nothing was collapsed.
    const tryScroll = () => {
      const el = document.getElementById(domId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      return false;
    };

    if (!needsLayoutWait && tryScroll()) return;

    // Otherwise wait for React commit + browser layout, then try up to 3 times.
    let attempts = 3;
    const waitAndScroll = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (tryScroll()) return;
          if (--attempts > 0) waitAndScroll();
        });
      });
    };
    waitAndScroll();
  }, [activeId]);

  // ─── LOADING ──────────────────────────────────────────
  if (!loaded) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: 'var(--bg)', minHeight: '100vh' }}
           className="flex items-center justify-center text-sm">
        <span style={{ color: 'var(--mute)' }}>Chargement…</span>
      </div>
    );
  }

  const projectList = Object.values(projects).sort((a, b) => {
    // Template first, then by creation
    if (a.isTemplate && !b.isTemplate) return -1;
    if (!a.isTemplate && b.isTemplate) return 1;
    return a.createdAt - b.createdAt;
  });

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', sans-serif",
      background: 'var(--bg)',
      color: 'var(--ink)',
      minHeight: '100vh',
      transition: 'background-color 200ms ease, color 200ms ease',
      ...THEMES[theme],
    }}>
      {/* grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.3,
        backgroundImage: 'linear-gradient(var(--bg-grid) 1px, transparent 1px), linear-gradient(90deg, var(--bg-grid) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div className="relative max-w-5xl mx-auto px-6 py-10">
        {/* HEADER */}
        <header className="mb-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--mute-soft)', fontSize: '11px', letterSpacing: '0.2em' }} className="uppercase mb-1">
                Révision
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: '36px', lineHeight: 1, letterSpacing: '-0.015em' }}>
                Checklist de révision
              </h1>
            </div>
            <div className="flex items-start gap-3">
              {active && <OverallBadge project={active} />}
              <button
                onClick={toggleTheme}
                title={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
                aria-label="Changer de thème"
                className="flex items-center justify-center transition-colors"
                style={{
                  width: '32px', height: '32px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--mute)',
                  marginTop: '2px',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
              >
                {theme === 'light'
                  ? <Moon size={14} strokeWidth={1.5} />
                  : <Sun size={14} strokeWidth={1.5} />}
              </button>
            </div>
          </div>
        </header>

        {/* PROJECT BAR */}
        <ProjectBar
          projects={projectList}
          activeId={activeId}
          onSwitch={setActiveId}
          onRename={renameProject}
          onDelete={(id) => setConfirmDeleteProject(id)}
          onSetTemplate={setAsTemplate}
          onNew={() => setShowNewProjectModal(true)}
        />

        {/* TOOLBAR */}
        <div className="mt-3 flex gap-2 flex-wrap">
          <button onClick={() => setHideChecked(v => !v)}
                  className="px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em',
                    color: hideChecked ? 'var(--accent-active-ink)' : 'var(--mute)',
                    background: hideChecked ? 'var(--accent-active)' : 'transparent',
                    border: '1px solid ' + (hideChecked ? 'var(--accent-active)' : 'var(--border)'),
                  }}>
            {hideChecked ? <EyeOff size={12} /> : <Eye size={12} />}
            {hideChecked ? 'MASQUER COMPLÉTÉS' : 'VOIR TOUT'}
          </button>
          <button onClick={openExport} className="px-3 py-1.5 text-xs transition-colors"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: 'var(--mute)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}>
            EXPORTER
          </button>
          <button onClick={openImport} className="px-3 py-1.5 text-xs transition-colors"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: 'var(--mute)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}>
            IMPORTER
          </button>
        </div>

        {confirmDeleteProject && projects[confirmDeleteProject] && (
          <ConfirmBanner
            message={`Supprimer définitivement « ${projects[confirmDeleteProject].name} » ?`}
            onConfirm={() => deleteProject(confirmDeleteProject)}
            onCancel={() => setConfirmDeleteProject(null)}
          />
        )}
      </div>

      {/* STICKY NAV */}
      {active && <StickyNav phases={active.phases} onJumpTo={jumpTo} onAddPhase={addPhase} />}

      <div className="relative max-w-5xl mx-auto px-6 pb-16">
        {active && (
          <main className="mt-6">
            {active.phases.length === 0 ? (
              <EmptyState
                title={active.isTemplate ? 'Commence par bâtir ton gabarit' : 'Projet vide'}
                subtitle={active.isTemplate
                  ? 'Ajoute des phases, puis des grandes tâches, puis des items. Ce gabarit servira de modèle pour tous tes futurs projets.'
                  : 'Ajoute ta première phase ci-dessous.'}
              />
            ) : (
              <div className="space-y-4">
                {active.phases.map(phase => (
                  <PhaseBlock
                    key={phase.id}
                    phase={phase}
                    hideChecked={hideChecked}
                    onUpdate={(updater) => updatePhase(phase.id, updater)}
                    onDelete={() => deletePhase(phase.id)}
                    onAddGroup={() => addGroup(phase.id)}
                    onUpdateGroup={(groupId, updater) => updateGroup(phase.id, groupId, updater)}
                    onDeleteGroup={(groupId) => deleteGroup(phase.id, groupId)}
                    onToggleAll={(groupId, v) => toggleAllInGroup(phase.id, groupId, v)}
                    onAddItem={(groupId) => addItem(phase.id, groupId)}
                    onUpdateItem={(groupId, itemId, updater) => updateItem(phase.id, groupId, itemId, updater)}
                    onDeleteItem={(groupId, itemId) => deleteItem(phase.id, groupId, itemId)}
                  />
                ))}
              </div>
            )}

            <button onClick={addPhase}
                    className="mt-6 w-full py-4 flex items-center justify-center gap-2 text-sm transition-colors"
                    style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em', border: '1px dashed var(--dash)', color: 'var(--mute)', background: 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}>
              <Plus size={14} /> AJOUTER UNE PHASE
            </button>
          </main>
        )}

        <footer className="mt-16 pt-6 text-xs flex justify-between"
                style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--mute-extra)', borderTop: '1px solid var(--border-soft)' }}>
          <span>Sauvegarde automatique</span>
          <span>{projectList.length} projet{projectList.length > 1 ? 's' : ''}</span>
        </footer>
      </div>

      <BackToTop />

      {/* NEW PROJECT MODAL */}
      {showNewProjectModal && (
        <NewProjectModal
          template={template}
          onFromTemplate={createFromTemplate}
          onEmpty={createEmpty}
          onClose={() => setShowNewProjectModal(false)}
        />
      )}

      {/* EXPORT MODAL */}
      {showExport && (
        <Modal title="Exporter les données" onClose={() => setShowExport(false)}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)', letterSpacing: '0.15em' }} className="uppercase mb-2">
            Que veux-tu exporter?
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setExportMode('all')}
              className="text-left p-3 transition-colors"
              style={{
                background: exportMode === 'all' ? 'var(--accent-active)' : 'var(--surface)',
                color: exportMode === 'all' ? 'var(--accent-active-ink)' : 'var(--ink)',
                border: '1px solid ' + (exportMode === 'all' ? 'var(--accent-active)' : 'var(--border)'),
              }}>
              <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '13px' }}>
                Tous les projets
              </div>
              <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
                Sauvegarde complète ({Object.keys(projects).length} projet{Object.keys(projects).length > 1 ? 's' : ''})
              </div>
            </button>
            <button
              onClick={() => setExportMode('active')}
              disabled={!snapshotProject}
              className="text-left p-3 transition-colors disabled:opacity-40"
              style={{
                background: exportMode === 'active' ? 'var(--accent-active)' : 'var(--surface)',
                color: exportMode === 'active' ? 'var(--accent-active-ink)' : 'var(--ink)',
                border: '1px solid ' + (exportMode === 'active' ? 'var(--accent-active)' : 'var(--border)'),
              }}>
              <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '13px' }}>
                Projet courant
              </div>
              <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
                {snapshotProject ? `« ${snapshotProject.name} » seulement` : '—'}
              </div>
            </button>
          </div>
          <textarea readOnly value={exportJSON} onClick={e => e.target.select()} rows={12}
                    className="w-full px-3 py-2 text-xs outline-none"
                    style={{ fontFamily: "'IBM Plex Mono', monospace", background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
          <div className="mt-3 flex justify-end">
            <button onClick={() => navigator.clipboard?.writeText(exportJSON)}
                    className="px-3 py-1.5 text-xs"
                    style={{ background: 'var(--ink)', color: 'var(--bg)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
              COPIER
            </button>
          </div>
        </Modal>
      )}

      {/* IMPORT MODAL */}
      {showImport && (
        <Modal title="Importer les données" onClose={() => setShowImport(false)}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)', letterSpacing: '0.15em' }} className="uppercase mb-2">
            Mode d'import
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setImportMode('merge')}
              className="text-left p-3 transition-colors"
              style={{
                background: importMode === 'merge' ? 'var(--accent-active)' : 'var(--surface)',
                color: importMode === 'merge' ? 'var(--accent-active-ink)' : 'var(--ink)',
                border: '1px solid ' + (importMode === 'merge' ? 'var(--accent-active)' : 'var(--border)'),
              }}>
              <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '13px' }}>
                Ajouter
              </div>
              <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
                Les projets importés sont ajoutés comme nouveaux. Rien n'est effacé.
              </div>
            </button>
            <button
              onClick={() => setImportMode('replace')}
              className="text-left p-3 transition-colors"
              style={{
                background: importMode === 'replace' ? 'var(--danger)' : 'var(--surface)',
                color: importMode === 'replace' ? 'var(--accent-active-ink)' : 'var(--ink)',
                border: '1px solid ' + (importMode === 'replace' ? 'var(--danger)' : 'var(--border)'),
              }}>
              <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '13px' }}>
                Remplacer tout
              </div>
              <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
                Efface tout et restaure le contenu du JSON. Pour backups.
              </div>
            </button>
          </div>
          <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={12}
                    placeholder="Colle ton JSON ici…"
                    className="w-full px-3 py-2 text-xs outline-none"
                    style={{ fontFamily: "'IBM Plex Mono', monospace", background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
          {importError && <div className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{importError}</div>}
          <div className="mt-3 flex gap-2 justify-end">
            <button onClick={() => { setShowImport(false); setImportText(''); setImportError(''); }}
                    className="px-3 py-1.5 text-xs"
                    style={{ border: '1px solid var(--mute-soft)', color: 'var(--mute)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
              ANNULER
            </button>
            <button onClick={handleImport} disabled={!importText.trim()}
                    className="px-3 py-1.5 text-xs disabled:opacity-40"
                    style={{
                      background: importMode === 'replace' ? 'var(--danger)' : 'var(--accent-active)',
                      color: 'var(--bg)',
                      fontFamily: "'IBM Plex Mono', monospace",
                      letterSpacing: '0.1em',
                    }}>
              {importMode === 'replace' ? 'REMPLACER' : 'AJOUTER'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// STICKY NAV — horizontal phase buttons with per-phase dropdown
// ═════════════════════════════════════════════════════════
function StickyNav({ phases, onJumpTo, onAddPhase }) {
  const [openPhaseId, setOpenPhaseId] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenPhaseId(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenPhaseId(null); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (phases.length === 0) return null;

  const closeAndJump = (domId) => {
    setOpenPhaseId(null);
    onJumpTo(domId);
  };

  return (
    <div ref={ref} style={{ position: 'sticky', top: 0, zIndex: 30 }}>
      <div style={{
        background: 'var(--nav-overlay)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-2 py-2 flex-wrap">
            {phases.map(phase => {
              const { pct } = computePhase(phase);
              const tone = progressTone(pct);
              const isOpen = openPhaseId === phase.id;
              const hasGroups = phase.groups.length > 0;

              return (
                <div key={phase.id} className="relative">
                  {/* Split button: [name+%] | [chevron] */}
                  <div
                    className="flex items-stretch"
                    style={{
                      border: '1px solid ' + (isOpen ? 'var(--accent-active)' : 'var(--border)'),
                      background: isOpen ? 'var(--accent-active)' : 'var(--surface)',
                      transition: 'border-color 150ms ease, background-color 150ms ease',
                    }}
                  >
                    {/* LEFT: jump directly to phase */}
                    <button
                      onClick={() => closeAndJump('phase-' + phase.id)}
                      className="flex items-center gap-2 px-3 py-1.5 transition-colors"
                      style={{
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isOpen ? 'var(--accent-active-ink)' : 'var(--ink)',
                        background: 'transparent',
                      }}
                      title={'Aller à ' + phase.name}
                      onMouseEnter={e => {
                        if (!isOpen) e.currentTarget.style.background = 'var(--surface-hover)';
                        else e.currentTarget.style.background = 'var(--accent-active-hover)';
                      }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{phase.name}</span>
                      <span style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '10px',
                        fontWeight: 500,
                        color: isOpen ? 'var(--mute-extra)' : tone.text,
                      }}>
                        {pct}%
                      </span>
                    </button>

                    {/* Divider */}
                    <div style={{
                      width: '1px',
                      background: isOpen ? 'var(--accent-active-divider)' : 'var(--border)',
                      alignSelf: 'stretch',
                    }} />

                    {/* RIGHT: toggle dropdown only */}
                    <button
                      onClick={() => setOpenPhaseId(isOpen ? null : phase.id)}
                      className="flex items-center px-2 transition-colors"
                      style={{
                        color: isOpen ? 'var(--accent-active-ink)' : 'var(--ink)',
                        background: 'transparent',
                      }}
                      title={isOpen ? 'Fermer' : 'Voir les grandes tâches'}
                      aria-expanded={isOpen}
                      onMouseEnter={e => {
                        if (!isOpen) e.currentTarget.style.background = 'var(--surface-hover)';
                        else e.currentTarget.style.background = 'var(--accent-active-hover)';
                      }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <ChevronDown
                        size={12}
                        strokeWidth={1.5}
                        style={{
                          transform: isOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 200ms ease',
                        }}
                      />
                    </button>
                  </div>

                  {/* Dropdown panel for this phase */}
                  {isOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      minWidth: '280px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      boxShadow: '0 8px 24px rgba(28,28,28,0.15)',
                      zIndex: 32,
                    }}>
                      {hasGroups ? (
                        phase.groups.map(group => {
                          const gpct = Math.round(groupPct(group));
                          const gtone = progressTone(gpct);
                          return (
                            <button
                              key={group.id}
                              onClick={() => closeAndJump('group-' + group.id)}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span style={{
                                fontFamily: "'IBM Plex Sans', sans-serif",
                                fontSize: '13px',
                                color: 'var(--ink)',
                              }}>
                                {group.name}
                              </span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div style={{ width: '42px', height: '3px', background: 'var(--border-soft)', position: 'relative' }}>
                                  <div style={{
                                    width: `${gpct}%`,
                                    height: '100%',
                                    background: gtone.bar,
                                    transition: 'width 400ms ease',
                                  }} />
                                </div>
                                <span style={{
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontSize: '10px',
                                  color: gtone.text,
                                  minWidth: '28px',
                                  textAlign: 'right',
                                }}>
                                  {gpct}%
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-xs italic" style={{
                          color: 'var(--mute-soft)',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}>
                          Aucune grande tâche.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add-phase quick button in nav */}
            <button
              onClick={onAddPhase}
              className="flex items-center gap-1.5 px-3 py-1.5 transition-colors"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '11px',
                letterSpacing: '0.12em',
                color: 'var(--mute)',
                border: '1px dashed var(--dash)',
                background: 'transparent',
              }}
              title="Ajouter une phase"
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
            >
              <Plus size={11} strokeWidth={1.5} /> PHASE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// BACK TO TOP
// ═════════════════════════════════════════════════════════
function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 flex items-center justify-center transition-all"
            style={{
              width: '44px', height: '44px', zIndex: 40,
              background: 'var(--ink)', color: 'var(--bg)', border: '1px solid var(--ink)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            }}
            title="Retour en haut"
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
      <ArrowUp size={18} strokeWidth={1.8} />
    </button>
  );
}

// ═════════════════════════════════════════════════════════
// EMPTY STATE
// ═════════════════════════════════════════════════════════
function EmptyState({ title, subtitle }) {
  return (
    <div className="text-center py-16" style={{ background: 'var(--surface)', border: '1px dashed var(--dash)' }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: '22px', fontWeight: 600, color: 'var(--ink)' }}>
        {title}
      </div>
      <div className="mt-2 max-w-md mx-auto text-sm" style={{ color: 'var(--mute)' }}>
        {subtitle}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// OVERALL BADGE
// ═════════════════════════════════════════════════════════
function OverallBadge({ project }) {
  const { pct, done, total } = computeProject(project);
  const tone = progressTone(pct);
  return (
    <div className="flex items-center gap-4">
      <div className="text-right">
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.15em', color: 'var(--mute-soft)' }} className="uppercase">
          Progression totale
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: '30px', fontWeight: 700, color: tone.text, lineHeight: 1 }}>
          {pct}<span style={{ fontSize: '16px', color: 'var(--mute-soft)', fontWeight: 400 }}>%</span>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)' }}>
          {done} / {total} items
        </div>
      </div>
      <div style={{ width: '6px', height: '60px', background: 'var(--border-soft)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: tone.bar, transition: 'height 400ms ease' }} />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// PROJECT BAR
// ═════════════════════════════════════════════════════════
function ProjectBar({ projects, activeId, onSwitch, onRename, onDelete, onSetTemplate, onNew }) {
  const [editingId, setEditingId] = useState(null);
  const [tempName, setTempName] = useState('');

  const startRename = (p) => { setEditingId(p.id); setTempName(p.name); };
  const commitRename = () => {
    if (editingId && tempName.trim()) onRename(editingId, tempName.trim());
    setEditingId(null);
  };
  const cancelRename = () => setEditingId(null);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {projects.map(p => {
        const isActive = p.id === activeId;
        const isEditing = editingId === p.id;
        return (
          <div key={p.id} className="flex items-center"
               style={{
                 background: isActive ? 'var(--accent-active)' : 'var(--surface-hover)',
                 color: isActive ? 'var(--accent-active-ink)' : 'var(--ink)',
                 border: isActive ? '1px solid var(--accent-active)' : '1px solid var(--border)',
               }}>
            {isEditing ? (
              <input autoFocus value={tempName}
                     onChange={e => setTempName(e.target.value)}
                     onFocus={e => e.target.select()}
                     onBlur={cancelRename}
                     onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                     className="px-3 py-2 text-sm outline-none bg-transparent"
                     style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: 'inherit', minWidth: '120px' }} />
            ) : (
              <>
                <button onClick={() => onSwitch(p.id)} onDoubleClick={() => startRename(p)}
                        className="px-4 py-2 text-sm flex items-center gap-2"
                        style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: isActive ? 600 : 400 }}
                        title="Double-cliquer pour renommer">
                  {p.isTemplate ? <Star size={13} strokeWidth={1.8} fill={isActive ? 'var(--accent-active-ink)' : 'var(--ink)'} /> : <Folder size={14} strokeWidth={1.5} />}
                  {p.name}
                  {p.isTemplate && (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', opacity: 0.7 }} className="uppercase">
                      gabarit
                    </span>
                  )}
                </button>
                {isActive && (
                  <div className="flex" style={{ borderLeft: '1px solid ' + (isActive ? 'var(--accent-active-divider)' : 'var(--border)') }}>
                    {!p.isTemplate && (
                      <button onClick={() => onSetTemplate(p.id)} className="px-2 py-2 hover:opacity-70" title="Définir comme gabarit">
                        <StarOff size={12} />
                      </button>
                    )}
                    <button onClick={() => startRename(p)} className="px-2 py-2 hover:opacity-70" title="Renommer"><Pencil size={12} /></button>
                    {!p.isTemplate && (
                      <button onClick={() => onDelete(p.id)} className="px-2 py-2 hover:opacity-70" title="Supprimer"><Trash2 size={12} /></button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <button onClick={onNew}
              className="px-4 py-2 text-sm flex items-center gap-2 transition-colors"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.1em', color: 'var(--mute)', border: '1px dashed var(--dash)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'var(--surface-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.background = 'transparent'; }}>
        <FolderPlus size={13} strokeWidth={1.5} /> NOUVEAU PROJET
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// NEW PROJECT MODAL
// ═════════════════════════════════════════════════════════
function NewProjectModal({ template, onFromTemplate, onEmpty, onClose }) {
  const [name, setName] = useState('');
  const [choice, setChoice] = useState(null);

  const submit = () => {
    const n = name.trim() || 'Nouveau projet';
    if (choice === 'template') onFromTemplate(n);
    else onEmpty(n);
  };

  return (
    <Modal title="Nouveau projet" onClose={onClose}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)', letterSpacing: '0.15em' }} className="uppercase mb-2">
        Nom
      </div>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
             placeholder="Nom du projet"
             className="w-full px-3 py-2 text-sm outline-none mb-5"
             style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--ink)' }} />

      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)', letterSpacing: '0.15em' }} className="uppercase mb-2">
        Point de départ
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        <button onClick={() => setChoice('template')}
                disabled={!template}
                className="text-left p-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: choice === 'template' ? 'var(--accent-active)' : 'var(--surface)',
                  color: choice === 'template' ? 'var(--accent-active-ink)' : 'var(--ink)',
                  border: '1px solid ' + (choice === 'template' ? 'var(--accent-active)' : 'var(--border)'),
                }}>
          <div className="flex items-center gap-2 mb-1">
            <Star size={14} strokeWidth={1.8} fill={choice === 'template' ? 'var(--accent-active-ink)' : 'none'} />
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '14px' }}>
              Utiliser le gabarit
            </span>
          </div>
          <div className="text-xs" style={{ opacity: 0.7 }}>
            {template ? `Copie de « ${template.name} »` : 'Aucun gabarit défini'}
          </div>
        </button>
        <button onClick={() => setChoice('empty')}
                className="text-left p-4 transition-colors"
                style={{
                  background: choice === 'empty' ? 'var(--accent-active)' : 'var(--surface)',
                  color: choice === 'empty' ? 'var(--accent-active-ink)' : 'var(--ink)',
                  border: '1px solid ' + (choice === 'empty' ? 'var(--accent-active)' : 'var(--border)'),
                }}>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={14} strokeWidth={1.8} />
            <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '14px' }}>
              Vide
            </span>
          </div>
          <div className="text-xs" style={{ opacity: 0.7 }}>
            Démarre de zéro
          </div>
        </button>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-xs"
                style={{ border: '1px solid var(--mute-soft)', color: 'var(--mute)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
          ANNULER
        </button>
        <button onClick={submit} disabled={!choice}
                className="px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--ink)', color: 'var(--bg)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
          CRÉER
        </button>
      </div>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════
// CONFIRM BANNER
// ═════════════════════════════════════════════════════════
function ConfirmBanner({ message, onConfirm, onCancel }) {
  return (
    <div className="mt-4 px-4 py-3 flex items-center justify-between gap-4"
         style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-ink)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <span className="text-sm">{message}</span>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="px-3 py-1.5 text-xs"
                style={{ background: 'var(--danger)', color: 'var(--bg)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
          SUPPRIMER
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs"
                style={{ border: '1px solid var(--danger)', color: 'var(--danger-ink)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
          ANNULER
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// MODAL
// ═════════════════════════════════════════════════════════
function Modal({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-6"
         style={{ background: 'var(--modal-overlay)', zIndex: 50 }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           className="max-w-2xl w-full p-6"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh', overflow: 'auto' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: '22px', fontWeight: 600, letterSpacing: '-0.005em' }}>{title}</h3>
          <button onClick={onClose} className="p-1 hover:opacity-60" style={{ color: 'var(--mute-soft)' }} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// PHASE BLOCK
// ═════════════════════════════════════════════════════════
function PhaseBlock({
  phase, hideChecked, onUpdate, onDelete, onAddGroup,
  onUpdateGroup, onDeleteGroup, onToggleAll, onAddItem, onUpdateItem, onDeleteItem,
}) {
  const { pct, done, total } = computePhase(phase);
  const tone = progressTone(pct);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tempName, setTempName] = useState(phase.name);

  useEffect(() => {
    if (!phase.editing) setTempName(phase.name);
  }, [phase.name, phase.editing]);

  const toggleCollapsed = () => onUpdate(p => ({ ...p, collapsed: !p.collapsed }));
  const startEdit = () => onUpdate(p => ({ ...p, editing: true }));
  const commitEdit = () => onUpdate(p => ({ ...p, editing: false, name: tempName.trim() }));
  const cancelEdit = () => {
    setTempName(phase.name);
    onUpdate(p => ({ ...p, editing: false }));
  };

  const displayName = phase.name && phase.name.trim() ? phase.name : '(sans titre)';
  const isNameEmpty = !phase.name || !phase.name.trim();

  return (
    <section id={'phase-' + phase.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', scrollMarginTop: '120px' }}>
      {/* HEADER */}
      <div className="flex items-center" style={{ borderBottom: phase.collapsed ? 'none' : '1px solid var(--border-soft)' }}>
        <button onClick={toggleCollapsed} className="flex items-center gap-2 px-4 py-3 flex-1 text-left">
          {phase.collapsed ? <ChevronRight size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}
          {phase.editing ? (
            <input autoFocus value={tempName}
                   onChange={e => setTempName(e.target.value)}
                   onFocus={e => e.target.select()}
                   onBlur={cancelEdit}
                   onClick={e => e.stopPropagation()}
                   onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                   className="px-2 py-1 text-lg outline-none"
                   style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, background: 'var(--bg)', border: '1px solid var(--dash)', minWidth: '240px' }} />
          ) : (
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: '22px',
              fontWeight: 600,
              letterSpacing: '-0.005em',
              color: isNameEmpty ? 'var(--mute-extra)' : 'var(--ink)',
              fontStyle: isNameEmpty ? 'italic' : 'normal',
            }}>
              {displayName}
            </h2>
          )}
        </button>
        <div className="flex items-center gap-4 px-4">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)' }} className="hidden sm:block">
            {done}/{total}
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: '20px', color: tone.text, lineHeight: 1, minWidth: '52px', textAlign: 'right' }}>
            {pct}<span style={{ fontSize: '11px', color: 'var(--mute-soft)', fontWeight: 400 }}>%</span>
          </div>
          <div style={{ width: '80px', height: '4px', background: 'var(--border-soft)', position: 'relative' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: tone.bar, transition: 'width 400ms ease' }} />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={startEdit} className="p-1.5 hover-surface" title="Renommer">
              <Pencil size={13} strokeWidth={1.5} />
            </button>
            <button onClick={() => setConfirmDel(true)} className="p-1.5 hover-surface" title="Supprimer">
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {confirmDel && (
        <div className="px-4 py-2 flex items-center justify-between gap-4 text-sm"
             style={{ background: 'var(--danger-bg)', borderBottom: '1px solid var(--danger-border)', color: 'var(--danger-ink)' }}>
          <span>Supprimer « {phase.name} » et toutes ses grandes tâches ?</span>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDel(false); }} className="px-2 py-1 text-xs"
                    style={{ background: 'var(--danger)', color: 'var(--bg)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>SUPPRIMER</button>
            <button onClick={() => setConfirmDel(false)} className="px-2 py-1 text-xs"
                    style={{ border: '1px solid var(--danger)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>ANNULER</button>
          </div>
        </div>
      )}

      {/* GROUPS */}
      {!phase.collapsed && (
        <div>
          {phase.groups.length === 0 ? (
            <div className="px-8 py-6 text-center text-sm" style={{ color: 'var(--mute-soft)' }}>
              Aucune grande tâche. Ajoutes-en une ci-dessous.
            </div>
          ) : (
            phase.groups.map((group, idx) => (
              <GroupBlock key={group.id}
                          group={group}
                          hideChecked={hideChecked}
                          isLast={idx === phase.groups.length - 1}
                          onUpdate={(updater) => onUpdateGroup(group.id, updater)}
                          onDelete={() => onDeleteGroup(group.id)}
                          onToggleAll={(v) => onToggleAll(group.id, v)}
                          onAddItem={() => onAddItem(group.id)}
                          onUpdateItem={(itemId, updater) => onUpdateItem(group.id, itemId, updater)}
                          onDeleteItem={(itemId) => onDeleteItem(group.id, itemId)} />
            ))
          )}
          <button onClick={onAddGroup}
                  className="w-full px-4 py-3 flex items-center justify-center gap-2 text-xs transition-colors"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.15em', color: 'var(--mute)', borderTop: '1px dashed var(--border)', background: 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}>
            <Layers size={12} strokeWidth={1.5} /> AJOUTER UNE GRANDE TÂCHE
          </button>
        </div>
      )}
    </section>
  );
}

// ═════════════════════════════════════════════════════════
// GROUP BLOCK
// ═════════════════════════════════════════════════════════
function GroupBlock({ group, hideChecked, isLast, onUpdate, onDelete, onToggleAll, onAddItem, onUpdateItem, onDeleteItem }) {
  const { pct, done, total } = computeGroup(group);
  const tone = progressTone(pct);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tempName, setTempName] = useState(group.name);

  useEffect(() => {
    if (!group.editing) setTempName(group.name);
  }, [group.name, group.editing]);

  const toggleCollapsed = () => onUpdate(g => ({ ...g, collapsed: !g.collapsed }));
  const startEdit = () => onUpdate(g => ({ ...g, editing: true }));
  const commitEdit = () => onUpdate(g => ({ ...g, editing: false, name: tempName.trim() }));
  const cancelEdit = () => {
    setTempName(group.name);
    onUpdate(g => ({ ...g, editing: false }));
  };

  const displayName = group.name && group.name.trim() ? group.name : '(sans titre)';
  const isNameEmpty = !group.name || !group.name.trim();

  const allChecked = total > 0 && done === total;
  const visibleItems = hideChecked ? group.items.filter(i => !i.checked) : group.items;

  return (
    <div id={'group-' + group.id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--surface-hover)', scrollMarginTop: '120px' }}>
      {/* HEADER */}
      <div className="flex items-center pl-8" style={{ background: 'var(--surface-alt)', borderLeft: `3px solid ${tone.bar}` }}>
        <button onClick={toggleCollapsed} className="flex items-center gap-2 px-2 py-2.5 flex-1 text-left">
          {group.collapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
          {group.editing ? (
            <input autoFocus value={tempName}
                   onChange={e => setTempName(e.target.value)}
                   onFocus={e => e.target.select()}
                   onBlur={cancelEdit}
                   onClick={e => e.stopPropagation()}
                   onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                   className="px-2 py-1 text-sm outline-none"
                   style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--dash)', minWidth: '200px' }} />
          ) : (
            <h3 style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 600,
              color: isNameEmpty ? 'var(--mute-extra)' : 'var(--ink)',
              fontStyle: isNameEmpty ? 'italic' : 'normal',
            }} className="uppercase">
              {displayName}
            </h3>
          )}
        </button>

        <div className="flex items-center gap-3 px-4">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)' }} className="hidden sm:block">
            {done}/{total}
          </div>
          <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '13px', color: tone.text, minWidth: '36px', textAlign: 'right' }}>
            {pct}%
          </div>
          <div style={{ width: '50px', height: '3px', background: 'var(--border-soft)', position: 'relative' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: tone.bar, transition: 'width 400ms ease' }} />
          </div>
          <div className="flex items-center gap-0.5">
            {total > 0 && (
              <button onClick={() => onToggleAll(!allChecked)} className="p-1 hover-surface"
                      title={allChecked ? 'Tout décocher' : 'Tout cocher'}>
                {allChecked ? <Square size={12} strokeWidth={1.5} /> : <CheckSquare size={12} strokeWidth={1.5} />}
              </button>
            )}
            <button onClick={startEdit} className="p-1 hover-surface" title="Renommer">
              <Pencil size={11} strokeWidth={1.5} />
            </button>
            <button onClick={() => setConfirmDel(true)} className="p-1 hover-surface" title="Supprimer">
              <Trash2 size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {confirmDel && (
        <div className="pl-10 pr-4 py-2 flex items-center justify-between gap-4 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-ink)' }}>
          <span>Supprimer « {group.name} » et tous ses items ?</span>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDel(false); }} className="px-2 py-1 text-xs"
                    style={{ background: 'var(--danger)', color: 'var(--bg)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>SUPPRIMER</button>
            <button onClick={() => setConfirmDel(false)} className="px-2 py-1 text-xs"
                    style={{ border: '1px solid var(--danger)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>ANNULER</button>
          </div>
        </div>
      )}

      {!group.collapsed && (
        <div>
          {group.items.length === 0 ? (
            <div className="px-16 py-4 text-sm" style={{ color: 'var(--mute-soft)' }}>Aucun item.</div>
          ) : visibleItems.length === 0 ? (
            <div className="px-16 py-4 text-sm" style={{ color: 'var(--mute-soft)', fontStyle: 'italic' }}>
              Tous les items sont complétés (masqués).
            </div>
          ) : (
            <ul>
              {visibleItems.map((item, idx) => (
                <ItemRow key={item.id}
                         item={item}
                         isLast={idx === visibleItems.length - 1}
                         onUpdate={(updater) => onUpdateItem(item.id, updater)}
                         onDelete={() => onDeleteItem(item.id)} />
              ))}
            </ul>
          )}
          <button onClick={onAddItem}
                  className="w-full pl-16 pr-4 py-2 flex items-center gap-2 text-xs transition-colors"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.12em', color: 'var(--mute-soft)', background: 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute-soft)'; }}>
            <Plus size={11} /> AJOUTER UN ITEM
          </button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ITEM ROW
// ═════════════════════════════════════════════════════════
function ItemRow({ item, isLast, onUpdate, onDelete }) {
  const [tempTitle, setTempTitle] = useState(item.title);
  const [confirmDel, setConfirmDel] = useState(false);

  // Only sync from props when NOT editing (prevents live overwrite during typing).
  useEffect(() => {
    if (!item.editing) setTempTitle(item.title);
  }, [item.title, item.editing]);

  const toggleExpanded = () => onUpdate(i => ({ ...i, expanded: !i.expanded }));
  const toggleChecked = () => onUpdate(i => ({ ...i, checked: !i.checked }));
  const startEdit = () => onUpdate(i => ({ ...i, editing: true }));
  // Allow empty titles — they render as italic "(sans titre)" placeholder.
  const commitEdit = () => onUpdate(i => ({ ...i, editing: false, title: tempTitle.trim() }));
  const cancelEdit = () => {
    setTempTitle(item.title);
    onUpdate(i => ({ ...i, editing: false }));
  };
  const updateBlocks = (newBlocks) => onUpdate(i => ({ ...i, blocks: newBlocks }));

  const hasExplanation = (item.blocks || []).length > 0;
  const displayTitle = item.title && item.title.trim() ? item.title : '(sans titre)';
  const isTitleEmpty = !item.title || !item.title.trim();

  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-faint)' }}>
      <div className="flex items-start gap-3 pl-16 pr-4 py-2.5">
        <button onClick={toggleChecked}
                className="mt-0.5 shrink-0 flex items-center justify-center transition-all"
                style={{
                  width: '16px', height: '16px',
                  background: item.checked ? 'var(--ink)' : 'transparent',
                  border: item.checked ? '1px solid var(--ink)' : '1px solid var(--mute-soft)',
                }}
                aria-label={item.checked ? 'Décocher' : 'Cocher'}>
          {item.checked && <Check size={10} strokeWidth={2.5} style={{ color: 'var(--bg)' }} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.editing ? (
              <input autoFocus value={tempTitle}
                     onChange={e => setTempTitle(e.target.value)}
                     onFocus={e => e.target.select()}
                     onBlur={cancelEdit}
                     onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                     className="px-2 py-1 text-sm outline-none flex-1"
                     style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: 'var(--bg)', border: '1px solid var(--dash)', minWidth: '200px' }} />
            ) : (
              <button onClick={startEdit} className="text-left text-sm"
                      style={{
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        color: isTitleEmpty ? 'var(--mute-extra)' : (item.checked ? 'var(--mute-soft)' : 'var(--ink)'),
                        fontStyle: isTitleEmpty ? 'italic' : 'normal',
                        textDecoration: item.checked ? 'line-through' : 'none',
                        textDecorationColor: 'var(--dash)',
                      }}
                      title="Cliquer pour éditer">
                {displayTitle}
              </button>
            )}
            {hasExplanation && !item.expanded && (
              <span style={{ color: 'var(--success-soft)' }} title="Contient une explication"><AlignLeft size={11} strokeWidth={1.5} /></span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={toggleExpanded} className="p-1 hover-surface"
                  title={item.expanded ? 'Fermer' : 'Ouvrir l\u2019explication'}
                  style={{ color: hasExplanation ? 'var(--success)' : 'var(--mute-soft)' }}>
            {item.expanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
          </button>
          <button onClick={() => setConfirmDel(true)} className="p-1 hover-surface" title="Supprimer">
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {item.expanded && (
        <div className="pl-24 pr-4 pb-3 pt-1" style={{ background: 'var(--surface-alt)' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--mute-soft)', letterSpacing: '0.15em' }} className="uppercase mb-2">
            Explication
          </div>
          <BlockEditor blocks={item.blocks || []} onChange={updateBlocks} />
        </div>
      )}

      {confirmDel && (
        <div className="pl-16 pr-4 py-2 flex items-center justify-between gap-4 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-ink)' }}>
          <span>Supprimer cet item ?</span>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDel(false); }} className="px-2 py-1 text-xs"
                    style={{ background: 'var(--danger)', color: 'var(--bg)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>SUPPRIMER</button>
            <button onClick={() => setConfirmDel(false)} className="px-2 py-1 text-xs"
                    style={{ border: '1px solid var(--danger)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>ANNULER</button>
          </div>
        </div>
      )}
    </li>
  );
}

// ═════════════════════════════════════════════════════════
// BLOCK EDITOR (Notion-style text + image)
// ═════════════════════════════════════════════════════════
function BlockEditor({ blocks, onChange }) {
  const fileRef = useRef(null);
  const [uploadError, setUploadError] = useState('');

  const addTextBlock = () => onChange([...blocks, makeTextBlock('')]);

  // Downscale an image if it's wider than maxDim, returning a data URL.
  const resizeImage = (file, maxDim = 1600, quality = 0.85) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide ou corrompue'));
      img.onload = () => {
        const { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(reader.result);
          return;
        }
        const scale = Math.min(maxDim / width, maxDim / height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // JPEG is tolerant of data:url payload size; stay under quota.
        const outputType = file.type === 'image/png' && width * height < 500000 ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outputType, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const handleImageUpload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setUploadError('');
    if (!f) return;

    // Validate MIME type
    if (!f.type.startsWith('image/')) {
      setUploadError('Fichier non-image. Seules les images sont acceptées.');
      return;
    }
    // Block SVG (can embed scripts)
    if (f.type === 'image/svg+xml') {
      setUploadError('Les images SVG ne sont pas supportées. Utilise PNG ou JPEG.');
      return;
    }
    // Hard size cap (10 MB raw)
    if (f.size > 10 * 1024 * 1024) {
      setUploadError('Image trop volumineuse (max 10 MB). Redimensionne-la avant.');
      return;
    }

    try {
      const dataUrl = await resizeImage(f);
      onChange([...blocks, makeImageBlock(dataUrl)]);
    } catch (err) {
      setUploadError(err.message || 'Erreur de traitement de l\u2019image');
    }
  };

  const updateBlock = (id, updates) => onChange(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  const deleteBlock = (id) => onChange(blocks.filter(b => b.id !== id));
  const moveBlock = (id, dir) => {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  };

  return (
    <div>
      {blocks.length === 0 && (
        <div className="mb-2 text-sm italic" style={{ color: 'var(--mute-soft)' }}>
          Aucun bloc. Ajoute du texte ou une image ci-dessous.
        </div>
      )}
      {blocks.map((block, idx) => (
        <BlockRow key={block.id}
                  block={block}
                  isFirst={idx === 0}
                  isLast={idx === blocks.length - 1}
                  onUpdate={(updates) => updateBlock(block.id, updates)}
                  onDelete={() => deleteBlock(block.id)}
                  onMoveUp={() => moveBlock(block.id, -1)}
                  onMoveDown={() => moveBlock(block.id, 1)} />
      ))}
      <div className="flex gap-2 mt-2 flex-wrap items-center">
        <button onClick={addTextBlock}
                className="px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors"
                style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: 'var(--mute)', border: '1px dashed var(--dash)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}>
          <AlignLeft size={11} strokeWidth={1.5} /> + TEXTE
        </button>
        <button onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors"
                style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: 'var(--mute)', border: '1px dashed var(--dash)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}>
          <ImageIcon size={11} strokeWidth={1.5} /> + IMAGE
        </button>
        <input type="file" accept="image/*" ref={fileRef} onChange={handleImageUpload} style={{ display: 'none' }} />
        {uploadError && (
          <span className="text-xs" style={{ color: 'var(--danger)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {uploadError}
          </span>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// BLOCK ROW
// ═════════════════════════════════════════════════════════
function BlockRow({ block, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) {
  const textareaRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (block.type !== 'text' || !textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
  }, [block.content, block.type]);

  return (
    <div className="relative mb-2 group"
         onMouseEnter={() => setHovered(true)}
         onMouseLeave={() => setHovered(false)}
         style={{ paddingRight: '60px' }}>
      {block.type === 'text' ? (
        <textarea ref={textareaRef}
                  value={block.content}
                  onChange={e => onUpdate({ content: e.target.value })}
                  placeholder="Note, détails de vérification, références au CNB…"
                  className="w-full px-3 py-2 text-sm outline-none resize-none overflow-hidden"
                  style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)', minHeight: '40px' }} />
      ) : (
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', padding: '4px', display: 'inline-block', maxWidth: '100%' }}>
          <img src={block.src} alt="Bloc image" style={{ display: 'block', maxWidth: '100%', maxHeight: '400px' }} />
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-1 right-0 flex flex-col gap-0.5 transition-opacity"
           style={{ opacity: hovered ? 1 : 0.25 }}>
        <button onClick={onMoveUp} disabled={isFirst}
                className="p-1 disabled:opacity-30 hover-surface"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                title="Monter">
          <ArrowUp size={10} strokeWidth={1.5} />
        </button>
        <button onClick={onMoveDown} disabled={isLast}
                className="p-1 disabled:opacity-30 hover-surface"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                title="Descendre">
          <ArrowUp size={10} strokeWidth={1.5} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button onClick={onDelete} className="p-1 hover-danger"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--danger)' }}
                title="Supprimer le bloc">
          <X size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
