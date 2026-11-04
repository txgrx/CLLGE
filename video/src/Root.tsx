import { Composition } from 'remotion';
import { DURATION, FPS, HowItWorks } from './HowItWorks';
import './theme';

export function Root() {
  return <Composition id="HowItWorks" component={HowItWorks} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />;
}
