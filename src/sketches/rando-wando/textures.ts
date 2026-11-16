import {useEffect, useRef, useState} from 'react';
import {ALL_FORMATS, CanvasSink, Input, UrlSource} from 'mediabunny';
import {useDelayRender} from 'remotion';
import {clipFrameTime, type ClipRef} from '../../assets';

/**
 * Shared face textures.
 *
 * The street shows over a hundred cube faces at once. Giving each face its
 * own `<ClipFrame>` meant a decoder and a canvas per face (and a full-size
 * canvas per video face), which ran the browser out of GPU memory. Here each
 * clip is decoded once, at face size, into plain pixel arrays that every face
 * showing that clip reads. After loading, a frame is drawn synchronously
 * (see FaceCanvas.tsx), so it still depends only on the beat.
 *
 * Faces are recoloured from luminance, so only luminance and alpha are kept:
 * two bytes per pixel, in ordinary memory rather than on the GPU.
 */
type Media = ClipRef & {src: string};

/** The source frames of one clip to keep, ascending and unique. */
export type TextureRequest = {clip: Media; frames: number[]};
/** size × size pixels, top row first: luminance then alpha, one byte each. */
export type FacePixels = Uint8Array;
/** Clip `src` to source frame to pixels. */
export type FaceTextures = Map<string, Map<number, FacePixels>>;

/**
 * Reads frames back as luminance and alpha. The centre square of each frame
 * is scaled to size × size, as `fit: cover` does.
 */
const reader = (size: number) => {
  const context = new OffscreenCanvas(size, size).getContext('2d', {willReadFrequently: true})!;
  context.imageSmoothingQuality = 'high';
  return (image: CanvasImageSource, width: number, height: number): FacePixels => {
    const side = Math.min(width, height);
    context.clearRect(0, 0, size, size);
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
    const {data} = context.getImageData(0, 0, size, size);
    const pixels = new Uint8Array(size * size * 2);
    for (let from = 0, to = 0; from < data.length; from += 4, to += 2) {
      // The same weights the palette's SVG colour matrix used, on sRGB values.
      pixels[to] = Math.round(0.2126 * data[from] + 0.7152 * data[from + 1] + 0.0722 * data[from + 2]);
      pixels[to + 1] = data[from + 3];
    }
    return pixels;
  };
};

const decodeGif = async ({clip, frames}: TextureRequest, size: number) => {
  if (typeof ImageDecoder === 'undefined') {
    throw new Error('This browser has no ImageDecoder, which is needed to read GIF frames. Use Chrome.');
  }
  const response = await fetch(clip.src);
  if (!response.ok) throw new Error(`Could not load clip "${clip.name}" (${response.status})`);
  const decoder = new ImageDecoder({data: await response.arrayBuffer(), type: 'image/gif'});
  try {
    await decoder.completed;
    const read = reader(size);
    const pixels = new Map<number, FacePixels>();
    for (const frame of frames) {
      const {image} = await decoder.decode({frameIndex: frame});
      pixels.set(frame, read(image, image.displayWidth, image.displayHeight));
      image.close();
    }
    return pixels;
  } finally {
    decoder.close();
  }
};

const decodeVideo = async ({clip, frames}: TextureRequest, size: number) => {
  const input = new Input({source: new UrlSource(clip.src), formats: ALL_FORMATS});
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`Clip "${clip.name}" has no video track`);
    // One pass over ascending timestamps decodes each packet at most once.
    const sink = new CanvasSink(track, {width: size, height: size, fit: 'cover', poolSize: 2});
    const read = reader(size);
    const pixels = new Map<number, FacePixels>();
    let index = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(frames.map((frame) => clipFrameTime(clip, frame)))) {
      const frame = frames[index++];
      if (!wrapped) throw new Error(`Clip "${clip.name}" has no picture at source frame ${frame}`);
      pixels.set(frame, read(wrapped.canvas, size, size));
    }
    return pixels;
  } finally {
    input.dispose();
  }
};

// One decode per clip per page, shared by the loop and seam views and kept across prop edits.
// A request for different frames or another size replaces the clip's entry.
const cache = new Map<string, {key: string; pixels: Promise<Map<number, FacePixels>>}>();
const load = (request: TextureRequest, size: number) => {
  const key = `${size}|${request.frames.join(',')}`;
  const cached = cache.get(request.clip.src);
  if (cached?.key === key) return cached.pixels;
  const pixels = (request.clip.format === 'gif' ? decodeGif : decodeVideo)(request, size);
  cache.set(request.clip.src, {key, pixels});
  // A failed decode is not kept, so the next mount tries again.
  pixels.catch(() => { if (cache.get(request.clip.src)?.pixels === pixels) cache.delete(request.clip.src); });
  return pixels;
};

/**
 * The decoded frames for `requests`, or null while they load. A render is
 * held until the frame that draws them has been committed.
 */
export const useFaceTextures = (requests: TextureRequest[], size: number): FaceTextures | null => {
  const key = requests.map((request) => `${request.clip.src}|${size}|${request.frames.join(',')}`).join('\n');
  const [loaded, setLoaded] = useState<{key: string; textures: FaceTextures} | null>(null);
  const ready = loaded?.key === key;
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const hold = useRef<number | null>(null);
  const release = () => {
    if (hold.current !== null) continueRender(hold.current);
    hold.current = null;
  };
  useEffect(() => {
    let current = true;
    // Video excerpts are decoded up front, which can outlast the default 30 s on a slow machine.
    hold.current = delayRender('Decoding face textures', {timeoutInMilliseconds: 180000});
    Promise.all(requests.map((request) => load(request, size))).then(
      (maps) => {
        if (current) setLoaded({key, textures: new Map(requests.map((request, index) => [request.clip.src, maps[index]]))});
      },
      (error) => cancelRender(error),
    );
    return () => { current = false; release(); };
  }, [key]);
  // Released only after the commit in which the faces were drawn with their textures.
  useEffect(() => { if (ready) release(); }, [ready]);
  return ready ? loaded.textures : null;
};
