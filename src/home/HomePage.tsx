import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { OpenOptions } from '../App';
import { APP_NAME, REPO_URL } from '../config';
import type { Project } from '../model/types';
import { deleteProject, listProjects, loadProject, requestPersistence, type ProjectSummary } from '../storage/db';
import { TEMPLATES, type TemplateSpec } from '../templates/catalog';
import { Icon } from '../ui/Icon';
import { ActDevelop } from './ActDevelop';
import { ActFilmRoll } from './ActFilmRoll';
import { ActPanorama } from './ActPanorama';
import { BlankSheet } from './BlankSheet';
import { Cursor } from './Cursor';
import { DryingLine } from './DryingLine';
import { useEnter } from './EnterTransition';
import { useSmoothScroll } from './useSmoothScroll';
import { useWorld } from './world';
import './home.css';

interface Props {
  onOpen(project: Project, blobs: Map<string, Blob>, savedRevision: number | null, opts?: OpenOptions): void;
  onPanorama(): void;
}

const centerOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** The home page in three acts: develop → one endless panorama → film roll. */
export function HomePage({ onOpen, onPanorama }: Props) {
  useSmoothScroll();
  const world = useWorld();
  const enter = useEnter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blank, setBlank] = useState(false);
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
    window.scrollTo(0, 0);
  }, []);

  const openTemplate = (t: TemplateSpec, rect: DOMRect, image?: string) => {
    setOpening(t.id);
    void enter({ kind: 'frame', rect, image }, async () => {
      try {
        const { project, blobs } = await t.build();
        void requestPersistence();
        onOpen({ ...project, title: t.name }, blobs, null);
      } catch (e) {
        setError(`Could not open “${t.name}”: ${e instanceof Error ? e.message : String(e)}`);
        setOpening(null);
      }
    });
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

  const actions = (
    <>
      <button className="btn btn--primary btn--lg" onClick={(e) => void enter({ kind: 'circle', ...centerOf(e.currentTarget) }, onPanorama)} data-cursor="Split">
        <Icon name="pano" /> Split a panorama
      </button>
      <button className="btn btn--lg btn--glass" onClick={() => setBlank(true)}>
        <Icon name="plus" /> Blank canvas
      </button>
    </>
  );

  return (
    <div className="home2">
      <nav className="nav2">
        <span className="wordmark">
          <span className="lamp" aria-hidden />
          {APP_NAME}
        </span>
        <a className="mono nav2__link" href={REPO_URL} target="_blank" rel="noreferrer">
          Source · MIT ↗
        </a>
      </nav>

      <ActDevelop world={world} actions={actions} />
      <ActPanorama world={world} />

      {error && (
        <p className="notice notice--warn home2__error" role="alert">
          {error}{' '}
          <button className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}

      <ActFilmRoll opening={opening} onPick={openTemplate} />
      <DryingLine
        projects={projects}
        onOpen={(id) => void openSaved(id)}
        onDelete={(p) => void remove(p)}
        onSample={() => {
          const t = TEMPLATES.find((x) => x.id === 'drying-line');
          if (t) openTemplate(t, new DOMRect(innerWidth / 2 - 100, innerHeight / 2 - 125, 200, 250));
        }}
      />
      <Finale
        onPanorama={(e) => void enter({ kind: 'circle', ...centerOf(e.currentTarget) }, onPanorama)}
        onBlank={() => setBlank(true)}
        onTemplates={() => document.getElementById('roll-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
      <Footer />

      <AnimatePresence>
        {blank && (
          <BlankSheet
            onClose={() => setBlank(false)}
            onCreate={(p) => {
              void requestPersistence();
              const btn = document.querySelector('.sheet .btn--primary');
              const c = btn ? centerOf(btn) : { x: innerWidth / 2, y: innerHeight / 2 };
              void enter({ kind: 'circle', ...c }, () => onOpen(p, new Map(), null));
            }}
          />
        )}
      </AnimatePresence>
      <Cursor />
    </div>
  );
}

/** Closing scene: three prints on the darkroom bench, and the way in. */
function Finale({ onPanorama, onBlank, onTemplates }: { onPanorama(e: React.MouseEvent<HTMLButtonElement>): void; onBlank(): void; onTemplates(): void }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.12, 1.02, 1.08]);
  const glow = useTransform(scrollYProgress, [0.2, 0.55], [0, 1]);
  return (
    <section ref={ref} className="finale" aria-labelledby="finale-h">
      <motion.div className="finale__bg" style={{ y, scale, backgroundImage: `url(${import.meta.env.BASE_URL}art/bench.webp)` }} aria-hidden />
      <motion.div className="finale__lamp" style={{ opacity: glow }} aria-hidden />
      <div className="finale__shade" aria-hidden />
      <motion.div className="finale__copy" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}>
        <p className="mono">Lights on</p>
        <h2 id="finale-h" className="finale__title">
          Your turn.
          <br />
          <em>Make it keep going.</em>
        </h2>
        <div className="hero2__actions">
          <button className="btn btn--primary btn--lg" onClick={onPanorama} data-cursor="Split">
            <Icon name="pano" /> Split your own panorama
          </button>
          <button className="btn btn--lg btn--glass" onClick={onBlank}>
            <Icon name="plus" /> Start from scratch
          </button>
          <button className="btn btn--lg btn--ghost" onClick={onTemplates}>
            Browse the templates ↑
          </button>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  const { scrollYProgress } = useScroll();
  const x = useTransform(scrollYProgress, [0.75, 1], ['10%', '-35%']);
  return (
    <footer className="foot">
      <motion.p className="foot__giant" style={{ x }} aria-hidden>
        keep going. keep going.
      </motion.p>
      <div className="foot__row mono">
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source code
        </a>
        <span>Your photos stay in this browser</span>
        <span>Not affiliated with SCRL or Instagram</span>
      </div>
    </footer>
  );
}
