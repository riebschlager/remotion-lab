/** Render, repeat and describe exports. The planning half is in ./export. */
import {mkdir, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {buildSidecar, exportColorSpace, exportProfiles, type ExportSidecar, type ProfileName} from './export';
import type {Session} from './render';
import {ff} from './scan';

export type ExportJob = {profile: ProfileName; props: Record<string, unknown>};
/** Measured from the output rather than planned. */
export type WrittenSidecar = ExportSidecar & {
  fileSizeBytes: number;
  /**
   * Alpha of three rendered frames, for alpha profiles. `minAlpha` 255 means
   * nothing sampled was transparent: the composition paints its whole frame.
   */
  alphaSample: {frames: number[]; minAlpha: number; transparentFraction: number} | null;
};
export type ExportResult = {video: string; sidecarPath: string; sidecar: WrittenSidecar; seconds: number};

/**
 * Export one composition once per job. Each loop is rendered and encoded
 * once; repeats copy that encoded loop end to end, so every repeat decodes
 * to the same frames as the first and a join is exactly the loop point, with
 * nothing re-encoded across it.
 */
export const runExport = async (session: Session, {id, jobs, repeat = 1, tag, outDir = 'out/export', production = true,
  log = () => undefined}: {
  id: string; jobs: ExportJob[]; repeat?: number; tag?: string; outDir?: string;
  /** False marks verification renders as not production for Remotion. */
  production?: boolean;
  log?: (message: string) => void;
}): Promise<ExportResult[]> => {
  const results: ExportResult[] = [];
  for (const job of jobs) {
    const profile = exportProfiles[job.profile];
    const composition = await session.select(id, job.props);
    const {paths, sidecar} = buildSidecar({id, profile: job.profile, inputProps: job.props, composition, repeat, tag, outDir});
    const video = path.resolve(paths.video);
    const scratch = path.join(path.dirname(video), `.export-${process.pid}-${path.basename(video)}`);
    await mkdir(path.dirname(video), {recursive: true});
    const started = performance.now();
    try {
      let alphaSample: WrittenSidecar['alphaSample'] = null;
      if (profile.alpha) {
        const frames = [...new Set([0, 1 / 3, 2 / 3].map((at) => Math.floor(at * composition.durationInFrames)))];
        let minAlpha = 255;
        let clear = 0;
        let pixels = 0;
        for (const frame of frames) {
          const png = await session.still(composition, frame, `${scratch}.png`,
            Math.min(1, 256 / Math.max(composition.width, composition.height)));
          for (let i = 3; i < png.data.length; i += 4) {
            if (png.data[i] < minAlpha) minAlpha = png.data[i];
            if (png.data[i] === 0) clear++;
          }
          pixels += png.data.length / 4;
        }
        alphaSample = {frames, minAlpha, transparentFraction: Number((clear / pixels).toFixed(4))};
        if (minAlpha === 255) {
          log(`note: nothing is transparent in frames ${frames.join(', ')} of "${id}"${sidecar.transparent
            ? ', although transparent is on: the composition paints its whole frame itself'
            : ': it paints an opaque backdrop'}. ${path.basename(video)} will have an alpha channel that is fully opaque`);
        }
      }

      const single = repeat > 1 ? `${scratch}.${profile.extension}` : video;
      await session.media(composition, single, {
        codec: profile.codec, pixelFormat: profile.pixelFormat, imageFormat: profile.imageFormat,
        colorSpace: exportColorSpace, muted: true, logLevel: 'error',
        ...(profile.crf === null ? {} : {crf: profile.crf}),
        ...(profile.jpegQuality === null ? {} : {jpegQuality: profile.jpegQuality}),
        ...(profile.proResProfile === null ? {} : {proResProfile: profile.proResProfile}),
        ...(production ? {} : {isProduction: false}),
      });
      if (repeat > 1) {
        await writeFile(`${scratch}.txt`, `file '${single.replaceAll("'", "'\\''")}'\n`.repeat(repeat));
        await ff('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${scratch}.txt`, '-c', 'copy',
          ...(profile.extension === 'mp4' ? ['-movflags', '+faststart'] : []), video]);
      }
      const written: WrittenSidecar = {...sidecar, fileSizeBytes: (await stat(video)).size, alphaSample};
      const sidecarPath = path.resolve(paths.sidecar);
      await writeFile(sidecarPath, `${JSON.stringify(written, null, 2)}\n`);
      const seconds = (performance.now() - started) / 1000;
      results.push({video, sidecarPath, sidecar: written, seconds});
      log(`${paths.video}\n  ${job.profile}: ${written.codec} ${written.pixelFormat}, ${written.canvas.width}×${written.canvas.height}, `
        + `${written.frameCount} frames (${written.loopFrameCount} × ${repeat}) at ${written.fps} fps, ${written.durationSeconds} s, `
        + `${written.requestedBpm} BPM requested, ${written.effectiveBpm} effective\n`
        + `  ${(written.fileSizeBytes / 1e6).toFixed(2)} MB in ${seconds.toFixed(1)} s; sidecar ${paths.sidecar}`);
    } finally {
      await Promise.all(['.png', '.txt', `.${profile.extension}`].map((suffix) => rm(`${scratch}${suffix}`, {force: true})));
    }
  }
  return results;
};
