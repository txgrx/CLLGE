import { reorderLayer, updateLayer } from '../model/project';
import type { Layer } from '../model/types';
import { useEditor } from './store';

const KIND: Record<Layer['type'], string> = { image: 'Photo', video: 'Video', text: 'Text', shape: 'Shape' };

export function LayersPanel() {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const apply = useEditor((s) => s.apply);
  const select = useEditor((s) => s.select);
  const front = [...project.layers].reverse();
  return (
    <section className="layers" aria-label="Layers">
      <h3>Layers</h3>
      {front.length === 0 && <p className="hint">Add photos, videos or text to start.</p>}
      <ul>
        {front.map((l) => (
          <li key={l.id} className={selection.includes(l.id) ? 'is-selected' : ''}>
            <button className="layer__name" onClick={() => select([l.id])} aria-pressed={selection.includes(l.id)}>
              <span className={`badge badge--${l.type}`}>{KIND[l.type]}</span>
              <span className="layer__label">{l.name || (l.type === 'text' ? l.text.slice(0, 24) : KIND[l.type])}</span>
            </button>
            <button className="icon" title={l.visible ? 'Hide' : 'Show'} aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name ?? KIND[l.type]}`} onClick={() => apply((p) => updateLayer(p, l.id, { visible: !l.visible }))}>
              {l.visible ? '◉' : '○'}
            </button>
            <button className="icon" title={l.locked ? 'Unlock' : 'Lock'} aria-label={`${l.locked ? 'Unlock' : 'Lock'} ${l.name ?? KIND[l.type]}`} onClick={() => apply((p) => updateLayer(p, l.id, { locked: !l.locked }))}>
              {l.locked ? '🔒' : '🔓'}
            </button>
            <button className="icon" title="Bring forward" aria-label="Bring forward" onClick={() => apply((p) => reorderLayer(p, l.id, 'up'))}>
              ↑
            </button>
            <button className="icon" title="Send backward" aria-label="Send backward" onClick={() => apply((p) => reorderLayer(p, l.id, 'down'))}>
              ↓
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
