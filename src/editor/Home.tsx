import { useEffect, useState } from 'react';
import { APP_NAME, APP_TAGLINE, REPO_URL } from '../config';
import { createProject } from '../model/project';
import { FORMAT_PRESETS, MAX_PAGES, type Project } from '../model/types';
import { deleteProject, listProjects, loadProject, requestPersistence, type ProjectSummary } from '../storage/db';
import { createDemoProject } from './demo';

interface Props {
  onOpen(project: Project, blobs: Map<string, Blob>, savedRevision: number | null): void;
}

export function Home({ onOpen }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState(FORMAT_PRESETS[0].key);
  const [pages, setPages] = useState(3);
  const [title, setTitle] = useState('');

  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch((e) => {
        setProjects([]);
        setError(`Local storage is not available: ${String(e?.message ?? e)}. Projects cannot be saved in this browser mode.`);
      });

  useEffect(() => {
    void refresh();
  }, []);

  const create = () => {
    const f = FORMAT_PRESETS.find((p) => p.key === preset)!;
    void requestPersistence();
    onOpen(createProject({ title: title.trim() || 'Untitled carousel', pageWidth: f.width, pageHeight: f.height, pages }), new Map(), null);
  };

  const open = async (id: string) => {
    const r = await loadProject(id);
    if (!r) return setError('That project could not be found.');
    const missing = r.project.assets.filter((a) => !r.blobs.has(a.id));
    if (missing.length) setError(`${missing.length} media file(s) are missing from storage; they will show as grey boxes.`);
    onOpen(r.project, r.blobs, r.project.revision);
  };

  const remove = async (p: ProjectSummary) => {
    if (!confirm(`Delete "${p.title}"? Its photos and videos stored in this browser are removed too.`)) return;
    await deleteProject(p.id);
    void refresh();
  };

  const demo = async () => {
    const { project, blobs } = await createDemoProject();
    onOpen(project, blobs, null);
  };

  const fmt = FORMAT_PRESETS.find((p) => p.key === preset)!;

  return (
    <div className="home">
      <header className="home__header">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={36} height={36} />
          <h1>{APP_NAME}</h1>
        </div>
        <p className="home__tagline">{APP_TAGLINE}</p>
        <p className="home__privacy">Your photos and videos never leave this device. No account, no watermark, up to {MAX_PAGES} pages.</p>
      </header>

      {error && (
        <div className="notice notice--warn" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <section className="card new-project" aria-labelledby="new-h">
        <h2 id="new-h">New carousel</h2>
        <label className="field">
          <span>Title</span>
          <input value={title} placeholder="Untitled carousel" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <fieldset className="formats">
          <legend>Page format</legend>
          {FORMAT_PRESETS.map((f) => (
            <label key={f.key} className={`format ${preset === f.key ? 'is-active' : ''}`}>
              <input type="radio" name="format" value={f.key} checked={preset === f.key} onChange={() => setPreset(f.key)} />
              <span className="format__thumb" style={{ aspectRatio: `${f.width} / ${f.height}` }} />
              <span className="format__label">{f.label}</span>
              <span className="format__dims">
                {f.width} × {f.height}
              </span>
            </label>
          ))}
        </fieldset>
        {fmt.note && <p className="hint">{fmt.note}</p>}
        <label className="field field--inline">
          <span>Pages</span>
          <input type="number" min={1} max={MAX_PAGES} value={pages} onChange={(e) => setPages(Math.min(MAX_PAGES, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        <div className="row">
          <button className="btn btn--primary" onClick={create}>
            Create
          </button>
          <button className="btn" onClick={() => void demo()}>
            Try the demo
          </button>
        </div>
      </section>

      <section className="projects" aria-labelledby="my-h">
        <h2 id="my-h">My projects</h2>
        {projects === null ? (
          <p className="hint">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="hint">No projects yet. They are saved automatically in this browser while you edit.</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className="project">
                <button className="project__open" onClick={() => void open(p.id)}>
                  <span className="project__strip" aria-hidden>
                    {Array.from({ length: Math.min(p.pages, 6) }, (_, i) => (
                      <span key={i} style={{ aspectRatio: `${p.pageWidth} / ${p.pageHeight}` }} />
                    ))}
                  </span>
                  <span className="project__title">{p.title}</span>
                  <span className="project__meta">
                    {p.pages} page{p.pages === 1 ? '' : 's'} · saved {new Date(p.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button className="btn btn--ghost" onClick={() => void remove(p)} aria-label={`Delete ${p.title}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">Projects live in this browser's storage. Clearing site data deletes them; a portable project file is on the roadmap.</p>
      </section>

      <footer className="home__footer">
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source code (MIT)
        </a>
        <span>Not affiliated with SCRL or Instagram.</span>
      </footer>
    </div>
  );
}
