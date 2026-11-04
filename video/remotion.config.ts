import { Config } from '@remotion/cli/config';

// Use a locally installed headless Chrome when REMOTION_BROWSER is set (CI/containers).
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
