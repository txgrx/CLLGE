import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { OpenOptions } from '../App';
import { APP_NAME, REPO_URL } from '../config';
import { newId } from '../model/ids';
import { createProject } from '../model/project';
import { FORMAT_PRESETS, MAX_PAGES, type Project } from '../model/types';
import { buildPanoramaProject } from '../panorama/split';
import { deleteProject, listProjects, loadProject, requestPersistence, type ProjectSummary } from '../storage/db';
import { coast } from '../templates/art';
import { FAMILY_LABEL, TEMPLATES, type TemplateFamily, type TemplateSpec } from '../templates/catalog';
import { renderPages, templateThumbs } from '../templates/thumbs';
import { Seg, Stepper, PhoneCarousel } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { FilmSection } from './FilmSection';
import { ScrollStory } from './ScrollStory';
import { listItem, listParent, soft, spring } from '../ui/motion';

interface Props {
  onOpen(project: Project, blobs: Map<string, Blob>, savedRevision: number | null, opts?: OpenOptions): void;
  onPanorama(): void;
}

export function Home({ onOpen, onPanorama }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blank, setBlank] = useState(false);
  const [family, setFamily] = useState<'all' | TemplateFamily>('all');
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch((e) => {
        setProjects([]);
        setError(`Local storage is not available (${String(e?.message ?? e)}). Projects cannot be saved in this browser mode.`);
      });
  useEffect(() => {
    void refresh();
  }, []);

  const openTemplate = async (t: TemplateSpec) => {
    setOpening(t.id);
    try {
      const { project, blobs } = await t.build();
      void requestPersistence();
      onOpen({ ...project, title: t.name }, blobs, null);
    } catch (e) {
      setError(`Could not open “${t.name}”: ${e instanceof Error ? e.message : String(e)}`);
      setOpening(null);
    }
  };

  const openSaved = async (id: string) => {
    const r = await loadProject(id);
    if (!r) return setError('That project could not be found.');
    onOpen(r.project, r.blobs, r.project.revision);
  };

  const remove = async (p: ProjectSummary) => {
    if (!confirm(`Delete “${p.title}”? Its photos and videos stored in this browser are removed too.`)) return;
    await deleteProject(p.id);
    void refresh();
  };

  const shown = TEMPLATES.filter((t) => family === 'all' || t.family === family);

  return (
    <div className="home">
      <nav className="nav">
        <span className="wordmark">
          <span className="lamp" aria-hidden />
          {APP_NAME}
        </span>
        <span className="nav__spacer" />
        <a className="mono" href={REPO_URL} target="_blank" rel="noreferrer">
          Open source · MIT
        </a>
      </nav>

      <header className="hero">
        <motion.div initial="initial" animate="animate" variants={listParent}>
          <motion.h1 className="hero__title" variants={listItem}>
            Slides that
            <br />
            <em>keep going.</em>
          </motion.h1>
          <motion.p className="hero__lede" variants={listItem}>
            Lay one wide photo — or photos and clips together — across a carousel. People swipe, and the picture carries on.
          </motion.p>
          <motion.div className="hero__actions" variants={listItem}>
            <button className="btn btn--primary" onClick={onPanorama}>
              <Icon name="pano" /> Split a panorama
            </button>
            <button className="btn" onClick={() => setBlank(true)}>
              <Icon name="plus" /> Blank canvas
            </button>
          </motion.div>
          <motion.div className="hero__facts mono" variants={listItem}>
            <span>Up to {MAX_PAGES} slides</span>
            <span>Photo + MP4 with sound</span>
            <span>Nothing leaves your device</span>
          </motion.div>
        </motion.div>
        <SwipeDemo />
      </header>

      <ScrollStory />
      <FilmSection />

      {error && (
        <p className="notice notice--warn" role="alert">
          {error}{' '}
          <button className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}

      <section className="section" aria-labelledby="ideas-h">
        <div className="section__head">
          <motion.h2 className="section__title" id="ideas-h" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={spring}>
            <small className="mono">Start from an idea</small>
            Templates
          </motion.h2>
          <Seg<'all' | TemplateFamily>
            label="Template family"
            value={family}
            onChange={setFamily}
            options={[{ value: 'all', label: 'All' }, ...(Object.keys(FAMILY_LABEL) as TemplateFamily[]).map((f) => ({ value: f, label: FAMILY_LABEL[f] }))]}
          />
        </div>
        <motion.ul className="tpl-grid" layout>
          <AnimatePresence mode="popLayout">
            {shown.map((t, i) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: 28, filter: 'blur(6px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...spring, delay: (i % 4) * 0.06 } }}
                viewport={{ once: true, amount: 0.2 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
              >
                <TemplateCard spec={t} opening={opening === t.id} onPick={() => void openTemplate(t)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      </section>

      <section className="section" aria-labelledby="mine-h">
        <div className="section__head">
          <motion.h2 className="section__title" id="mine-h" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={spring}>
            <small className="mono">Saved in this browser</small>
            Your projects
          </motion.h2>
        </div>
        {projects === null ? (
          <p className="hint">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="hint">Nothing yet. Projects save themselves while you edit.</p>
        ) : (
          <motion.ul className="proj-list" initial="initial" animate="animate" variants={listParent}>
            {projects.map((p) => (
              <motion.li key={p.id} className="proj" variants={listItem}>
                <button className="proj__open" onClick={() => void openSaved(p.id)}>
                  <span className="proj__strip" aria-hidden>
                    {Array.from({ length: Math.min(p.pages, 6) }, (_, i) => (
                      <span key={i} style={{ aspectRatio: `${p.pageWidth} / ${p.pageHeight}` }} />
                    ))}
                  </span>
                  <span className="proj__title">{p.title}</span>
                  <span className="mono">
                    {p.pages} slide{p.pages === 1 ? '' : 's'} · {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button className="icon" onClick={() => void remove(p)} aria-label={`Delete ${p.title}`} title="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </section>

      <footer className="footer mono">
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source code
        </a>
        <span>Your photos stay in this browser</span>
        <span>Not affiliated with SCRL or Instagram</span>
      </footer>

      <AnimatePresence>
        {blank && (
          <BlankSheet
            onClose={() => setBlank(false)}
            onCreate={(p) => {
              void requestPersistence();
              onOpen(p, new Map(), null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- hero: one panorama, swiping by itself ---------------- */

function SwipeDemo() {
  const [pages, setPages] = useState<string[]>([]);
  const [strip, setStrip] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const left = useMotionValue(0);
  const windowLeft = useTransform(left, (v) => `${v * 100}%`);

  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await coast(1800, 750, 11);
      const project = buildPanoramaProject({
        asset: { id: newId('a_'), type: 'image', name: 'demo', mime: 'image/jpeg', width: 1800, height: 750 },
        slides: 3,
        pageWidth: 1080,
        pageHeight: 1350,
        crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
      });
      const urls = await renderPages(project, new Map([[project.assets[0].id, blob]]), 520);
      if (!alive) return;
      setPages(urls);
      setStrip(URL.createObjectURL(blob));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    animate(left, i / 3, spring);
  }, [i, left]);

  return (
    <div className="demo" aria-label="Example: one panorama split into three slides">
      <motion.div className="phone" initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={soft}>
        <PhoneCarousel
          index={i}
          onIndex={setI}
          auto={2600}
          slides={pages.length ? pages.map((u, k) => <img key={k} src={u} alt={`Slide ${k + 1}`} draggable={false} />) : [<div key="0" style={{ aspectRatio: '4/5' }} />]}
        />
      </motion.div>
      <div className="strip" aria-hidden>
        {strip && <img src={strip} alt="" />}
        <motion.span className="strip__window" style={{ left: windowLeft, width: '33.333%' }} />
        <div className="strip__labels mono">
          <span>01</span>
          <span>one photo → three slides</span>
          <span>03</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- template card ---------------- */

function TemplateCard({ spec, opening, onPick }: { spec: TemplateSpec; opening: boolean; onPick(): void }) {
  const [thumbs, setThumbs] = useState<string[] | null>(null);
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  useEffect(() => {
    let alive = true;
    void templateThumbs(spec.id).then((t) => alive && setThumbs(t));
    return () => {
      alive = false;
    };
  }, [spec.id]);

  // On hover, "swipe" through the pages like the feed would.
  useEffect(() => {
    if (!hover || !thumbs) return;
    const t = setInterval(() => setPage((p) => (p + 1) % thumbs.length), 900);
    return () => clearInterval(t);
  }, [hover, thumbs]);
  useEffect(() => {
    if (!hover) setPage(0);
  }, [hover]);
  useEffect(() => {
    const w = frame.current?.clientWidth ?? 0;
    animate(x, -page * w, spring);
  }, [page, x]);

  const hasVideo = spec.family === 'video';
  return (
    <button
      className="tpl"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label={`${spec.name}: ${spec.idea} ${spec.pages} slides.`}
      data-testid={`tpl-${spec.id}`}
    >
      <div className="tpl__frame" ref={frame}>
        {thumbs ? (
          <motion.div className="tpl__track" style={{ x }} initial={{ opacity: 0, filter: 'brightness(0.2) blur(6px)' }} animate={{ opacity: 1, filter: 'brightness(1) blur(0px)' }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}>
            {thumbs.map((u, k) => (
              <img key={k} src={u} alt="" draggable={false} />
            ))}
          </motion.div>
        ) : (
          <div className="tpl__developing" />
        )}
        {opening && <div className="tpl__developing" />}
        <span className="tpl__kind">{hasVideo ? <span className="badge badge--video">clip</span> : <span className="badge">{spec.pages} slides</span>}</span>
        <span className="tpl__pages" aria-hidden>
          {Array.from({ length: spec.pages }, (_, k) => (
            <span key={k} className={k === page ? 'is-on' : ''} />
          ))}
        </span>
      </div>
      <div>
        <div className="tpl__name">{spec.name}</div>
        <p className="tpl__idea">{spec.idea}</p>
      </div>
    </button>
  );
}

/* ---------------- blank canvas sheet ---------------- */

function BlankSheet({ onClose, onCreate }: { onClose(): void; onCreate(p: Project): void }) {
  const [preset, setPreset] = useState(FORMAT_PRESETS[0].key);
  const [pages, setPages] = useState(3);
  const [title, setTitle] = useState('');
  const f = FORMAT_PRESETS.find((p) => p.key === preset)!;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blank-h"
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <h2 className="sheet__title" id="blank-h">
            Blank canvas
          </h2>
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <label className="field">
          <span>Title</span>
          <input value={title} placeholder="Untitled carousel" onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <fieldset className="formats">
          <legend className="mono">Slide format</legend>
          {FORMAT_PRESETS.map((p) => (
            <label key={p.key} className={`format ${preset === p.key ? 'is-active' : ''}`}>
              <input type="radio" name="format" value={p.key} checked={preset === p.key} onChange={() => setPreset(p.key)} />
              <span className="format__thumb" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
              <span className="format__label">{p.label}</span>
              <span className="mono">
                {p.width}×{p.height}
              </span>
            </label>
          ))}
        </fieldset>
        {f.note && <p className="hint">{f.note}</p>}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
          <div className="row">
            <span className="mono">Slides</span>
            <Stepper label="Slides" value={pages} min={1} max={MAX_PAGES} onChange={setPages} />
          </div>
          <button className="btn btn--primary" onClick={() => onCreate(createProject({ title: title.trim() || 'Untitled carousel', pageWidth: f.width, pageHeight: f.height, pages, background: '#111113' }))}>
            Create
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
