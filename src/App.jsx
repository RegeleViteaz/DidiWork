import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight,
  Image as ImageIcon, FolderPlus, Folder, Upload, Layers,
  Star, StarOff, ArrowUp, Eye, EyeOff, CheckSquare, Square,
  FileText, AlignLeft,
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
  if (pct > 0)     return { bar: '#b56548', text: '#8a4b33' };
  return { bar: '#d9d4c7', text: '#7a7566' };
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

  // Inject fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch(e){} };
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
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], isTemplate: false }; });
      next[id] = { ...next[id], isTemplate: true };
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
  const exportJSON = JSON.stringify({ projects, activeId }, null, 2);

  const handleImport = () => {
    try {
      const data = JSON.parse(importText);
      if (!data.projects || typeof data.projects !== 'object' || Object.keys(data.projects).length === 0) {
        setImportError('Format invalide : aucun projet trouvé.'); return;
      }
      setProjects(data.projects);
      const nextActive = data.activeId && data.projects[data.activeId]
        ? data.activeId : Object.keys(data.projects)[0];
      setActiveId(nextActive);
      setImportText(''); setImportError(''); setShowImport(false);
    } catch (e) {
      setImportError('JSON invalide : ' + e.message);
    }
  };

  // ─── JUMP-TO for sticky nav ───────────────────────────
  const jumpTo = useCallback((groupId) => {
    const el = document.getElementById('group-' + groupId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ─── LOADING ──────────────────────────────────────────
  if (!loaded) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#f6f3ea', minHeight: '100vh' }}
           className="flex items-center justify-center text-sm">
        <span style={{ color: '#7a7566' }}>Chargement…</span>
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
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#f6f3ea', color: '#1c1c1c', minHeight: '100vh' }}>
      {/* grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.3,
        backgroundImage: 'linear-gradient(#e4dfcf 1px, transparent 1px), linear-gradient(90deg, #e4dfcf 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div className="relative max-w-5xl mx-auto px-6 py-10">
        {/* HEADER */}
        <header className="mb-8 pb-6 border-b" style={{ borderColor: '#d8d2bf' }}>
          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#8a8472', fontSize: '11px', letterSpacing: '0.2em' }} className="uppercase mb-1">
                Révision
              </div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: '36px', lineHeight: 1, letterSpacing: '-0.015em' }}>
                Checklist de révision
              </h1>
            </div>
            {active && <OverallBadge project={active} />}
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
                    color: hideChecked ? '#f6f3ea' : '#7a7566',
                    background: hideChecked ? '#1c1c1c' : 'transparent',
                    border: '1px solid ' + (hideChecked ? '#1c1c1c' : '#d8d2bf'),
                  }}>
            {hideChecked ? <EyeOff size={12} /> : <Eye size={12} />}
            {hideChecked ? 'MASQUER COMPLÉTÉS' : 'VOIR TOUT'}
          </button>
          <button onClick={() => setShowExport(true)} className="px-3 py-1.5 text-xs transition-colors"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: '#7a7566', border: '1px solid #d8d2bf' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.color = '#1c1c1c'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7a7566'; }}>
            EXPORTER
          </button>
          <button onClick={() => { setShowImport(true); setImportError(''); }} className="px-3 py-1.5 text-xs transition-colors"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: '#7a7566', border: '1px solid #d8d2bf' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.color = '#1c1c1c'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7a7566'; }}>
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
      {active && <StickyNav phases={active.phases} onJumpTo={jumpTo} />}

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
                    style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em', border: '1px dashed #b8b19a', color: '#7a7566', background: 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.color = '#1c1c1c'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7a7566'; }}>
              <Plus size={14} /> AJOUTER UNE PHASE
            </button>
          </main>
        )}

        <footer className="mt-16 pt-6 text-xs flex justify-between"
                style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#a09a85', borderTop: '1px solid #e4dfcf' }}>
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
          <p className="text-sm mb-3" style={{ color: '#5a554a' }}>
            Copie ce texte et garde-le en sauvegarde. Utile pour transférer vers un autre artifact.
          </p>
          <textarea readOnly value={exportJSON} onClick={e => e.target.select()} rows={14}
                    className="w-full px-3 py-2 text-xs outline-none"
                    style={{ fontFamily: "'IBM Plex Mono', monospace", background: '#faf7ec', border: '1px solid #d8d2bf', color: '#1c1c1c' }} />
          <div className="mt-3 flex justify-end">
            <button onClick={() => navigator.clipboard?.writeText(exportJSON)}
                    className="px-3 py-1.5 text-xs"
                    style={{ background: '#1c1c1c', color: '#f6f3ea', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
              COPIER
            </button>
          </div>
        </Modal>
      )}

      {/* IMPORT MODAL */}
      {showImport && (
        <Modal title="Importer les données" onClose={() => setShowImport(false)}>
          <p className="text-sm mb-3" style={{ color: '#5a554a' }}>
            Colle ici le JSON exporté. <strong>Attention</strong> — ceci remplacera toutes tes données actuelles.
          </p>
          <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={14}
                    placeholder="Colle ton JSON ici…"
                    className="w-full px-3 py-2 text-xs outline-none"
                    style={{ fontFamily: "'IBM Plex Mono', monospace", background: '#faf7ec', border: '1px solid #d8d2bf', color: '#1c1c1c' }} />
          {importError && <div className="mt-2 text-sm" style={{ color: '#8a4b33' }}>{importError}</div>}
          <div className="mt-3 flex gap-2 justify-end">
            <button onClick={() => { setShowImport(false); setImportText(''); setImportError(''); }}
                    className="px-3 py-1.5 text-xs"
                    style={{ border: '1px solid #8a8472', color: '#5a554a', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
              ANNULER
            </button>
            <button onClick={handleImport} disabled={!importText.trim()}
                    className="px-3 py-1.5 text-xs disabled:opacity-40"
                    style={{ background: '#1c1c1c', color: '#f6f3ea', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
              IMPORTER
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// STICKY NAV
// ═════════════════════════════════════════════════════════
function StickyNav({ phases, onJumpTo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const sections = [];
  phases.forEach(phase => {
    phase.groups.forEach(group => {
      sections.push({ phaseName: phase.name, groupId: group.id, groupName: group.name, pct: Math.round(groupPct(group)) });
    });
  });

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (sections.length === 0) return null;

  // Group sections by phase name for display
  const byPhase = [];
  sections.forEach(s => {
    const last = byPhase[byPhase.length - 1];
    if (last && last.phaseName === s.phaseName) last.groups.push(s);
    else byPhase.push({ phaseName: s.phaseName, groups: [s] });
  });

  return (
    <div ref={ref} style={{ position: 'sticky', top: 0, zIndex: 30 }}>
      <div style={{
        background: 'rgba(246, 243, 234, 0.97)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #d8d2bf', borderBottom: '1px solid #d8d2bf',
      }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-3 py-2">
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 transition-colors"
              style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px',
                letterSpacing: '0.15em', color: open ? '#f6f3ea' : '#1c1c1c',
                background: open ? '#1c1c1c' : '#fdfaf1',
                border: '1px solid ' + (open ? '#1c1c1c' : '#d8d2bf'),
              }}>
              <Layers size={11} strokeWidth={1.5} />
              SOMMAIRE
              {open
                ? <ChevronDown size={11} strokeWidth={1.5} />
                : <ChevronRight size={11} strokeWidth={1.5} />}
            </button>

            {/* Quick progress pills when closed */}
            {!open && (
              <div className="flex gap-1.5 flex-wrap">
                {sections.map(s => {
                  const tone = progressTone(s.pct);
                  return (
                    <button
                      key={s.groupId}
                      onClick={() => { onJumpTo(s.groupId); }}
                      className="px-2 py-1 text-left transition-all"
                      style={{ background: '#fdfaf1', border: '1px solid #d8d2bf' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.borderColor = '#1c1c1c'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fdfaf1'; e.currentTarget.style.borderColor = '#d8d2bf'; }}>
                      <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '11px', fontWeight: 500, color: '#1c1c1c' }}>
                        {s.groupName}
                      </span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: tone.text, marginLeft: '6px' }}>
                        {s.pct}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dropdown menu */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#fdfaf1', border: '1px solid #d8d2bf',
          borderTop: 'none', zIndex: 31,
          boxShadow: '0 8px 24px rgba(28,28,28,0.12)',
        }}>
          <div className="max-w-5xl mx-auto px-6 py-3">
            {byPhase.map(phase => (
              <div key={phase.phaseName} className="mb-3 last:mb-0">
                <div style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
                  letterSpacing: '0.2em', color: '#8a8472', textTransform: 'uppercase',
                  paddingBottom: '6px', marginBottom: '4px', borderBottom: '1px solid #e4dfcf',
                }}>
                  {phase.phaseName}
                </div>
                {phase.groups.map(s => {
                  const tone = progressTone(s.pct);
                  return (
                    <button
                      key={s.groupId}
                      onClick={() => { onJumpTo(s.groupId); setOpen(false); }}
                      className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors"
                      style={{ background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <div className="flex items-center gap-2">
                        <ChevronRight size={12} strokeWidth={1.5} style={{ color: '#b8b19a' }} />
                        <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '13px', fontWeight: 500, color: '#1c1c1c' }}>
                          {s.groupName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div style={{ width: '60px', height: '3px', background: '#e4dfcf', position: 'relative' }}>
                          <div style={{ width: `${s.pct}%`, height: '100%', background: tone.bar, transition: 'width 400ms ease' }} />
                        </div>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: tone.text, minWidth: '28px', textAlign: 'right' }}>
                          {s.pct}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
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
              background: '#1c1c1c', color: '#f6f3ea', border: '1px solid #1c1c1c',
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
    <div className="text-center py-16" style={{ background: '#fdfaf1', border: '1px dashed #b8b19a' }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: '22px', fontWeight: 600, color: '#1c1c1c' }}>
        {title}
      </div>
      <div className="mt-2 max-w-md mx-auto text-sm" style={{ color: '#7a7566' }}>
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
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.15em', color: '#8a8472' }} className="uppercase">
          Progression totale
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: '30px', fontWeight: 700, color: tone.text, lineHeight: 1 }}>
          {pct}<span style={{ fontSize: '16px', color: '#8a8472', fontWeight: 400 }}>%</span>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#8a8472' }}>
          {done} / {total} items
        </div>
      </div>
      <div style={{ width: '6px', height: '60px', background: '#e4dfcf', position: 'relative', overflow: 'hidden' }}>
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

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {projects.map(p => {
        const isActive = p.id === activeId;
        const isEditing = editingId === p.id;
        return (
          <div key={p.id} className="flex items-center"
               style={{
                 background: isActive ? '#1c1c1c' : '#efeadb',
                 color: isActive ? '#f6f3ea' : '#1c1c1c',
                 border: isActive ? '1px solid #1c1c1c' : '1px solid #d8d2bf',
               }}>
            {isEditing ? (
              <input autoFocus value={tempName}
                     onChange={e => setTempName(e.target.value)}
                     onBlur={commitRename}
                     onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                     className="px-3 py-2 text-sm outline-none bg-transparent"
                     style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: 'inherit', minWidth: '120px' }} />
            ) : (
              <>
                <button onClick={() => onSwitch(p.id)} onDoubleClick={() => startRename(p)}
                        className="px-4 py-2 text-sm flex items-center gap-2"
                        style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: isActive ? 600 : 400 }}
                        title="Double-cliquer pour renommer">
                  {p.isTemplate ? <Star size={13} strokeWidth={1.8} fill={isActive ? '#f6f3ea' : '#1c1c1c'} /> : <Folder size={14} strokeWidth={1.5} />}
                  {p.name}
                  {p.isTemplate && (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', opacity: 0.7 }} className="uppercase">
                      gabarit
                    </span>
                  )}
                </button>
                {isActive && (
                  <div className="flex" style={{ borderLeft: '1px solid ' + (isActive ? '#3a3a3a' : '#d8d2bf') }}>
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
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.1em', color: '#7a7566', border: '1px dashed #b8b19a' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#1c1c1c'; e.currentTarget.style.background = '#efeadb'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#7a7566'; e.currentTarget.style.background = 'transparent'; }}>
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
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#8a8472', letterSpacing: '0.15em' }} className="uppercase mb-2">
        Nom
      </div>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
             placeholder="Nom du projet"
             className="w-full px-3 py-2 text-sm outline-none mb-5"
             style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#faf7ec', border: '1px solid #d8d2bf', color: '#1c1c1c' }} />

      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#8a8472', letterSpacing: '0.15em' }} className="uppercase mb-2">
        Point de départ
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        <button onClick={() => setChoice('template')}
                disabled={!template}
                className="text-left p-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: choice === 'template' ? '#1c1c1c' : '#fdfaf1',
                  color: choice === 'template' ? '#f6f3ea' : '#1c1c1c',
                  border: '1px solid ' + (choice === 'template' ? '#1c1c1c' : '#d8d2bf'),
                }}>
          <div className="flex items-center gap-2 mb-1">
            <Star size={14} strokeWidth={1.8} fill={choice === 'template' ? '#f6f3ea' : 'none'} />
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
                  background: choice === 'empty' ? '#1c1c1c' : '#fdfaf1',
                  color: choice === 'empty' ? '#f6f3ea' : '#1c1c1c',
                  border: '1px solid ' + (choice === 'empty' ? '#1c1c1c' : '#d8d2bf'),
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
                style={{ border: '1px solid #8a8472', color: '#5a554a', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
          ANNULER
        </button>
        <button onClick={submit} disabled={!choice}
                className="px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#1c1c1c', color: '#f6f3ea', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
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
         style={{ background: '#f0e4d8', border: '1px solid #c7956b', color: '#5a3a1e', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <span className="text-sm">{message}</span>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="px-3 py-1.5 text-xs"
                style={{ background: '#8a4b33', color: '#f6f3ea', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
          SUPPRIMER
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs"
                style={{ border: '1px solid #8a4b33', color: '#5a3a1e', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
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
         style={{ background: 'rgba(28, 28, 28, 0.5)', zIndex: 50 }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           className="max-w-2xl w-full p-6"
           style={{ background: '#fdfaf1', border: '1px solid #d8d2bf', maxHeight: '85vh', overflow: 'auto' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: '22px', fontWeight: 600, letterSpacing: '-0.005em' }}>{title}</h3>
          <button onClick={onClose} className="p-1 hover:opacity-60" style={{ color: '#8a8472' }} aria-label="Fermer">
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

  useEffect(() => { setTempName(phase.name); }, [phase.name]);

  const toggleCollapsed = () => onUpdate(p => ({ ...p, collapsed: !p.collapsed }));
  const startEdit = () => onUpdate(p => ({ ...p, editing: true }));
  const commitEdit = () => onUpdate(p => ({ ...p, editing: false, name: tempName.trim() || p.name }));

  return (
    <section style={{ background: '#fdfaf1', border: '1px solid #d8d2bf' }}>
      {/* HEADER */}
      <div className="flex items-center" style={{ borderBottom: phase.collapsed ? 'none' : '1px solid #e4dfcf' }}>
        <button onClick={toggleCollapsed} className="flex items-center gap-2 px-4 py-3 flex-1 text-left">
          {phase.collapsed ? <ChevronRight size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}
          {phase.editing ? (
            <input autoFocus value={tempName}
                   onChange={e => setTempName(e.target.value)}
                   onBlur={commitEdit}
                   onClick={e => e.stopPropagation()}
                   onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') onUpdate(p => ({ ...p, editing: false })); }}
                   className="px-2 py-1 text-lg outline-none"
                   style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, background: '#f6f3ea', border: '1px solid #b8b19a', minWidth: '240px' }} />
          ) : (
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: '22px', fontWeight: 600, letterSpacing: '-0.005em' }}>
              {phase.name}
            </h2>
          )}
        </button>
        <div className="flex items-center gap-4 px-4">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#8a8472' }} className="hidden sm:block">
            {done}/{total}
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: '20px', color: tone.text, lineHeight: 1, minWidth: '52px', textAlign: 'right' }}>
            {pct}<span style={{ fontSize: '11px', color: '#8a8472', fontWeight: 400 }}>%</span>
          </div>
          <div style={{ width: '80px', height: '4px', background: '#e4dfcf', position: 'relative' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: tone.bar, transition: 'width 400ms ease' }} />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={startEdit} className="p-1.5 hover:bg-stone-200 transition-colors" title="Renommer">
              <Pencil size={13} strokeWidth={1.5} />
            </button>
            <button onClick={() => setConfirmDel(true)} className="p-1.5 hover:bg-stone-200 transition-colors" title="Supprimer">
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {confirmDel && (
        <div className="px-4 py-2 flex items-center justify-between gap-4 text-sm"
             style={{ background: '#f0e4d8', borderBottom: '1px solid #c7956b', color: '#5a3a1e' }}>
          <span>Supprimer « {phase.name} » et toutes ses grandes tâches ?</span>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDel(false); }} className="px-2 py-1 text-xs"
                    style={{ background: '#8a4b33', color: '#f6f3ea', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>SUPPRIMER</button>
            <button onClick={() => setConfirmDel(false)} className="px-2 py-1 text-xs"
                    style={{ border: '1px solid #8a4b33', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>ANNULER</button>
          </div>
        </div>
      )}

      {/* GROUPS */}
      {!phase.collapsed && (
        <div>
          {phase.groups.length === 0 ? (
            <div className="px-8 py-6 text-center text-sm" style={{ color: '#8a8472' }}>
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
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.15em', color: '#7a7566', borderTop: '1px dashed #d8d2bf', background: 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.color = '#1c1c1c'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7a7566'; }}>
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

  useEffect(() => { setTempName(group.name); }, [group.name]);

  const toggleCollapsed = () => onUpdate(g => ({ ...g, collapsed: !g.collapsed }));
  const startEdit = () => onUpdate(g => ({ ...g, editing: true }));
  const commitEdit = () => onUpdate(g => ({ ...g, editing: false, name: tempName.trim() || g.name }));

  const allChecked = total > 0 && done === total;
  const visibleItems = hideChecked ? group.items.filter(i => !i.checked) : group.items;

  return (
    <div id={'group-' + group.id} style={{ borderBottom: isLast ? 'none' : '1px solid #efeadb', scrollMarginTop: '80px' }}>
      {/* HEADER */}
      <div className="flex items-center pl-8" style={{ background: '#faf7ec', borderLeft: `3px solid ${tone.bar}` }}>
        <button onClick={toggleCollapsed} className="flex items-center gap-2 px-2 py-2.5 flex-1 text-left">
          {group.collapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
          {group.editing ? (
            <input autoFocus value={tempName}
                   onChange={e => setTempName(e.target.value)}
                   onBlur={commitEdit}
                   onClick={e => e.stopPropagation()}
                   onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') onUpdate(g => ({ ...g, editing: false })); }}
                   className="px-2 py-1 text-sm outline-none"
                   style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, background: '#fdfaf1', border: '1px solid #b8b19a', minWidth: '200px' }} />
          ) : (
            <h3 style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '14px', fontWeight: 600, color: '#1c1c1c' }} className="uppercase">
              {group.name}
            </h3>
          )}
        </button>

        <div className="flex items-center gap-3 px-4">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#8a8472' }} className="hidden sm:block">
            {done}/{total}
          </div>
          <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: '13px', color: tone.text, minWidth: '36px', textAlign: 'right' }}>
            {pct}%
          </div>
          <div style={{ width: '50px', height: '3px', background: '#e4dfcf', position: 'relative' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: tone.bar, transition: 'width 400ms ease' }} />
          </div>
          <div className="flex items-center gap-0.5">
            {total > 0 && (
              <button onClick={() => onToggleAll(!allChecked)} className="p-1 hover:bg-stone-200 transition-colors"
                      title={allChecked ? 'Tout décocher' : 'Tout cocher'}>
                {allChecked ? <Square size={12} strokeWidth={1.5} /> : <CheckSquare size={12} strokeWidth={1.5} />}
              </button>
            )}
            <button onClick={startEdit} className="p-1 hover:bg-stone-200 transition-colors" title="Renommer">
              <Pencil size={11} strokeWidth={1.5} />
            </button>
            <button onClick={() => setConfirmDel(true)} className="p-1 hover:bg-stone-200 transition-colors" title="Supprimer">
              <Trash2 size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {confirmDel && (
        <div className="pl-10 pr-4 py-2 flex items-center justify-between gap-4 text-sm" style={{ background: '#f0e4d8', color: '#5a3a1e' }}>
          <span>Supprimer « {group.name} » et tous ses items ?</span>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDel(false); }} className="px-2 py-1 text-xs"
                    style={{ background: '#8a4b33', color: '#f6f3ea', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>SUPPRIMER</button>
            <button onClick={() => setConfirmDel(false)} className="px-2 py-1 text-xs"
                    style={{ border: '1px solid #8a4b33', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>ANNULER</button>
          </div>
        </div>
      )}

      {!group.collapsed && (
        <div>
          {group.items.length === 0 ? (
            <div className="px-16 py-4 text-sm" style={{ color: '#8a8472' }}>Aucun item.</div>
          ) : visibleItems.length === 0 ? (
            <div className="px-16 py-4 text-sm" style={{ color: '#8a8472', fontStyle: 'italic' }}>
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
                  style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.12em', color: '#8a8472', background: 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.color = '#1c1c1c'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8a8472'; }}>
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

  useEffect(() => { setTempTitle(item.title); }, [item.title]);

  const toggleExpanded = () => onUpdate(i => ({ ...i, expanded: !i.expanded }));
  const toggleChecked = () => onUpdate(i => ({ ...i, checked: !i.checked }));
  const startEdit = () => onUpdate(i => ({ ...i, editing: true }));
  const commitEdit = () => onUpdate(i => ({ ...i, editing: false, title: tempTitle.trim() || i.title }));
  const updateBlocks = (newBlocks) => onUpdate(i => ({ ...i, blocks: newBlocks }));

  const hasExplanation = (item.blocks || []).length > 0;

  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid #f0ebd9' }}>
      <div className="flex items-start gap-3 pl-16 pr-4 py-2.5">
        <button onClick={toggleChecked}
                className="mt-0.5 shrink-0 flex items-center justify-center transition-all"
                style={{
                  width: '16px', height: '16px',
                  background: item.checked ? '#1c1c1c' : 'transparent',
                  border: item.checked ? '1px solid #1c1c1c' : '1px solid #8a8472',
                }}
                aria-label={item.checked ? 'Décocher' : 'Cocher'}>
          {item.checked && <Check size={10} strokeWidth={2.5} style={{ color: '#f6f3ea' }} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.editing ? (
              <input autoFocus value={tempTitle}
                     onChange={e => setTempTitle(e.target.value)}
                     onBlur={commitEdit}
                     onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') onUpdate(i => ({ ...i, editing: false })); }}
                     className="px-2 py-1 text-sm outline-none flex-1"
                     style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#f6f3ea', border: '1px solid #b8b19a', minWidth: '200px' }} />
            ) : (
              <button onClick={startEdit} className="text-left text-sm"
                      style={{
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        color: item.checked ? '#8a8472' : '#1c1c1c',
                        textDecoration: item.checked ? 'line-through' : 'none',
                        textDecorationColor: '#b8b19a',
                      }}
                      title="Cliquer pour éditer">
                {item.title}
              </button>
            )}
            {hasExplanation && !item.expanded && (
              <span style={{ color: '#7a8a3e' }} title="Contient une explication"><AlignLeft size={11} strokeWidth={1.5} /></span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={toggleExpanded} className="p-1 hover:bg-stone-100 transition-colors"
                  title={item.expanded ? 'Fermer' : 'Ouvrir l\u2019explication'}
                  style={{ color: hasExplanation ? '#4a6b3a' : '#8a8472' }}>
            {item.expanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
          </button>
          <button onClick={() => setConfirmDel(true)} className="p-1 hover:bg-stone-100 transition-colors" title="Supprimer">
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {item.expanded && (
        <div className="pl-24 pr-4 pb-3 pt-1" style={{ background: '#faf7ec' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#8a8472', letterSpacing: '0.15em' }} className="uppercase mb-2">
            Explication
          </div>
          <BlockEditor blocks={item.blocks || []} onChange={updateBlocks} />
        </div>
      )}

      {confirmDel && (
        <div className="pl-16 pr-4 py-2 flex items-center justify-between gap-4 text-sm" style={{ background: '#f0e4d8', color: '#5a3a1e' }}>
          <span>Supprimer cet item ?</span>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDel(false); }} className="px-2 py-1 text-xs"
                    style={{ background: '#8a4b33', color: '#f6f3ea', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>SUPPRIMER</button>
            <button onClick={() => setConfirmDel(false)} className="px-2 py-1 text-xs"
                    style={{ border: '1px solid #8a4b33', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>ANNULER</button>
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

  const addTextBlock = () => onChange([...blocks, makeTextBlock('')]);
  const handleImageUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange([...blocks, makeImageBlock(reader.result)]);
    reader.readAsDataURL(f);
    e.target.value = '';
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
        <div className="mb-2 text-sm italic" style={{ color: '#8a8472' }}>
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
      <div className="flex gap-2 mt-2">
        <button onClick={addTextBlock}
                className="px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors"
                style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: '#7a7566', border: '1px dashed #b8b19a' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.color = '#1c1c1c'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7a7566'; }}>
          <AlignLeft size={11} strokeWidth={1.5} /> + TEXTE
        </button>
        <button onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors"
                style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', color: '#7a7566', border: '1px dashed #b8b19a' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#efeadb'; e.currentTarget.style.color = '#1c1c1c'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7a7566'; }}>
          <ImageIcon size={11} strokeWidth={1.5} /> + IMAGE
        </button>
        <input type="file" accept="image/*" ref={fileRef} onChange={handleImageUpload} style={{ display: 'none' }} />
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
                  style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#fdfaf1', border: '1px solid #d8d2bf', color: '#1c1c1c', minHeight: '40px' }} />
      ) : (
        <div style={{ border: '1px solid #d8d2bf', background: '#fdfaf1', padding: '4px', display: 'inline-block', maxWidth: '100%' }}>
          <img src={block.src} alt="Bloc image" style={{ display: 'block', maxWidth: '100%', maxHeight: '400px' }} />
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-1 right-0 flex flex-col gap-0.5 transition-opacity"
           style={{ opacity: hovered ? 1 : 0.25 }}>
        <button onClick={onMoveUp} disabled={isFirst}
                className="p-1 disabled:opacity-30 hover:bg-stone-200"
                style={{ background: '#fdfaf1', border: '1px solid #d8d2bf' }}
                title="Monter">
          <ArrowUp size={10} strokeWidth={1.5} />
        </button>
        <button onClick={onMoveDown} disabled={isLast}
                className="p-1 disabled:opacity-30 hover:bg-stone-200"
                style={{ background: '#fdfaf1', border: '1px solid #d8d2bf' }}
                title="Descendre">
          <ArrowUp size={10} strokeWidth={1.5} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button onClick={onDelete} className="p-1 hover:bg-red-50"
                style={{ background: '#fdfaf1', border: '1px solid #d8d2bf', color: '#8a4b33' }}
                title="Supprimer le bloc">
          <X size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
