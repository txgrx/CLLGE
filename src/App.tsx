import { useCallback, useState } from 'react';
import { Home } from './editor/Home';
import { Editor } from './editor/Editor';
import { flushSave, useEditor } from './editor/store';
import { library } from './media/library';
import type { Project } from './model/types';

export function App() {
  const [view, setView] = useState<'home' | 'editor'>('home');
  const open = useEditor((s) => s.open);
  const close = useEditor((s) => s.close);

  const openProject = useCallback(
    (project: Project, blobs: Map<string, Blob>, savedRevision: number | null) => {
      library.clear();
      for (const a of project.assets) {
        const b = blobs.get(a.id);
        if (b) library.add(a, b);
      }
      open(project, savedRevision);
      setView('editor');
    },
    [open],
  );

  const back = useCallback(async () => {
    await flushSave();
    close();
    library.clear();
    setView('home');
  }, [close]);

  return view === 'editor' ? <Editor onBack={back} /> : <Home onOpen={openProject} />;
}
