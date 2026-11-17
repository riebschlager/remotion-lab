import {useEffect, useRef, useState} from 'react';
import {useDelayRender} from 'remotion';
import type {ClipRef} from '../../assets';

/**
 * Shared face textures.
 *
 * The street shows over a hundred cube faces at once. Giving each face its
 * own `<ClipFrame>` meant a decoder and a canvas per face, which ran the
 * browser out of GPU memory. Here each clip is decoded once, at face size,
 * into plain pixel arrays that every face showing that clip reads. After
 * loading, a frame is drawn synchronously (see FaceCanvas.tsx), so it still
 * depends only on the beat.
 *
 * Pixels are RGBA with premultiplied colour, so the GPU's mipmaps of a
 * transparent sticker do not grow dark fringes.
 */
type Media = ClipRef & {src: string};

/** The source frames of one clip to keep, ascending and unique. */
export type TextureRequest = {clip: Media; frames: number[]};
/** size × size RGBA pixels, top row first, colour premultiplied by alpha. */
export type FacePixels = Uint8Array;
/** Clip `src` to source frame to pixels. */
export type FaceTextures = Map<string, Map<number, FacePixels>>;

/** Inset of the fitted picture from the face edge, as a fraction of the face. */
const INSET = 0.05;

/**
 * Reads frames back as premultiplied RGBA. The whole frame is fitted inside
 * the square (as `fit: contain` does), centred, so tall and wide stickers keep
 * their heads and feet.
 */
const reader = (size: number) => {
  const context = new OffscreenCanvas(size, size).getContext('2d', {willReadFrequently: true})!;
  context.imageSmoothingQuality = 'high';
  return (image: CanvasImageSource, width: number, height: number): FacePixels => {
    const room = size * (1 - 2 * INSET);
    const scale = room / Math.max(width, height);
    const w = width * scale;
    const h = height * scale;
    context.clearRect(0, 0, size, size);
    context.drawImage(image, 0, 0, width, height, (size - w) / 2, (size - h) / 2, w, h);
    const {data} = context.getImageData(0, 0, size, size);
    const pixels = new Uint8Array(data.length);
    for (let at = 0; at < data.length; at += 4) {
      const alpha = data[at + 3];
      pixels[at] = Math.round(data[at] * alpha / 255);
      pixels[at + 1] = Math.round(data[at + 1] * alpha / 255);
      pixels[at + 2] = Math.round(data[at + 2] * alpha / 255);
      pixels[at + 3] = alpha;
    }
    return pixels;
  };
};

const decodeGif = async ({clip, frames}: TextureRequest, size: number) => {
  if (clip.format !== 'gif') throw new Error(`Face textures only read GIFs; "${clip.name}" is ${clip.format}`);
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

// One decode per clip per page, shared by the loop and seam views and kept across prop edits.
// A request for different frames or another size replaces the clip's entry.
const cache = new Map<string, {key: string; pixels: Promise<Map<number, FacePixels>>}>();
const load = (request: TextureRequest, size: number) => {
  const key = `${size}|${request.frames.join(',')}`;
  const cached = cache.get(request.clip.src);
  if (cached?.key === key) return cached.pixels;
  const pixels = decodeGif(request, size);
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
