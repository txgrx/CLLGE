import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createProject } from '../model/project';
import { FORMAT_PRESETS, MAX_PAGES, type Project } from '../model/types';
import { Stepper } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { spring } from '../ui/motion';

/** Sheet for starting from an empty canvas: title, slide format, number of slides. */
export function BlankSheet({ onClose, onCreate }: { onClose(): void; onCreate(p: Project): void }) {
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
