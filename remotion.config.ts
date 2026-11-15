import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// H.264 at a high-ish quality for social-ready loops.
Config.setCodec('h264');
Config.setCrf(18);
