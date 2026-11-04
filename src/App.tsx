import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from './editor/Editor';
import { flushSave, useEditor } from './editor/store';
import { library } from './media/library';
import type { Project } from './model/types';
import { EnterTransitionProvider } from './home/EnterTransition';
import { HomePage } from './home/HomePage';
import { PanoramaFlow } from './panorama/PanoramaFlow';
import { fontsReady } from './ui/fonts';

type View = 'home' | 'panorama' | 'editor';

export interface OpenOptions {
  /** Open the export sheet right away (panorama flow → "Export slides"). */
  exportNow?: boolean;
}

export function App() {
  const [view, setView] = useState<View>('home');
  const [exportNow, setExportNow] = useState(false);
  const open = useEditor((s) => s.open);
  const close = useEditor((s) => s.close);

  // Canvas only draws web fonts once they are loaded: redraw when they arrive.
  useEffect(() => {
    void fontsReady().then(() => library.touch());
  }, []);

  const openProject = useCallback(
    (project: Project, blobs: Map<string, Blob>, savedRevision: number | null, opts: OpenOptions = {}) => {
      library.clear();
      for (const a of project.assets) {
        const b = blobs.get(a.id);
        if (b) library.add(a, b);
      }
      open(project, savedRevision);
      setExportNow(!!opts.exportNow);
      setView('editor');
    },
    [open],
  );

  // The editor keeps rendering during its exit animation, so the project is only
  // closed once that animation has finished.
  const closeAfterExit = useRef(false);
  const back = useCallback(async () => {
    await flushSave();
    closeAfterExit.current = true;
    setView('home');
  }, []);
  const onExitComplete = useCallback(() => {
    if (!closeAfterExit.current) return;
    closeAfterExit.current = false;
    close();
    library.clear();
  }, [close]);

  return (
    <MotionConfig reducedMotion="user">
      <EnterTransitionProvider>
      <AnimatePresence mode="wait" initial={false} onExitComplete={onExitComplete}>
        <motion.div
          key={view}
          className="screen"
          style={{ height: '100%' }}
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          // transitionEnd clears filter/transform: any value would trap position:fixed children (mobile sheet).
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }, transitionEnd: { filter: 'none', transform: 'none' } }}
          exit={{ opacity: 0, y: -6, filter: 'blur(6px)', transition: { duration: 0.16 } }}
        >
          {view === 'editor' ? (
            <Editor onBack={back} exportOnOpen={exportNow} />
          ) : view === 'panorama' ? (
            <PanoramaFlow onBack={() => setView('home')} onOpen={openProject} />
          ) : (
            <HomePage onOpen={openProject} onPanorama={() => setView('panorama')} />
          )}
        </motion.div>
      </AnimatePresence>
      </EnterTransitionProvider>
    </MotionConfig>
  );
}
