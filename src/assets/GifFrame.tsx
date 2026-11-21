import React, {useLayoutEffect, useRef, type RefObject} from 'react';
import {useDelayRender} from 'remotion';

type FrameRequest = {
  draw: (image: VideoFrame) => void;
  fail: (error: unknown) => void;
};

const openGif = async (src: string, signal: AbortSignal) => {
  const response = await fetch(src, {signal});
  if (!response.ok) throw new Error(`Could not load GIF: ${response.status} ${src}`);
  const data = await response.arrayBuffer();
  signal.throwIfAborted();
  const decoder = new ImageDecoder({data, type: 'image/gif', preferAnimation: true});
  try {
    await decoder.tracks.ready;
    signal.throwIfAborted();
    return decoder;
  } catch (error) {
    decoder.close();
    throw error;
  }
};

const createSource = (src: string) => {
  const controller = new AbortController();
  const ready = openGif(src, controller.signal);
  const pending = new Map<number, Set<FrameRequest>>();
  let active: number | undefined;
  let decoding = false;

  const decode = async () => {
    if (decoding) return;
    decoding = true;
    try {
      const decoder = await ready;
      for (const [index, requests] of pending) {
        active = index;
        const {image} = await decoder.decode({frameIndex: index});
        pending.delete(index);
        try {
          for (const request of requests) request.draw(image);
        } finally {
          image.close();
        }
      }
    } catch (error) {
      for (const requests of pending.values()) {
        for (const request of requests) request.fail(error);
      }
      pending.clear();
    } finally {
      active = undefined;
      decoding = false;
    }
  };

  return {
    users: 0,
    request(index: number, request: FrameRequest) {
      let requests = pending.get(index);
      if (!requests) {
        requests = new Set();
        pending.set(index, requests);
      }
      requests.add(request);
      void decode();
      return () => {
        requests.delete(request);
        if (requests.size === 0 && active !== index && pending.get(index) === requests) pending.delete(index);
      };
    },
    close() {
      pending.clear();
      controller.abort();
      void ready.then((decoder) => decoder.close(), () => undefined);
    },
  };
};

const sources = new Map<string, ReturnType<typeof createSource>>();

/** Draw an indexed GIF frame into a canvas before releasing the render. */
export const useGifFrame = (
  src: string | undefined,
  frame: number,
  canvas: RefObject<HTMLCanvasElement | null>,
  onDraw?: () => void,
) => {
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  useLayoutEffect(() => {
    if (!src) return;
    const source = sources.get(src) ?? createSource(src);
    sources.set(src, source);
    source.users++;
    return () => {
      if (--source.users === 0) {
        sources.delete(src);
        source.close();
      }
    };
  }, [src]);

  useLayoutEffect(() => {
    if (!src) return;
    const handle = delayRender(`Decoding GIF frame ${frame} of ${src}`);
    const unsubscribe = sources.get(src)!.request(frame, {
      draw(image) {
        try {
          const target = canvas.current!;
          if (target.width !== image.displayWidth) target.width = image.displayWidth;
          if (target.height !== image.displayHeight) target.height = image.displayHeight;
          const context = target.getContext('2d');
          if (!context) throw new Error('GIF frame requires a 2D canvas context.');
          context.clearRect(0, 0, target.width, target.height);
          context.drawImage(image, 0, 0);
          onDraw?.();
          continueRender(handle);
        } catch (error) {
          cancelRender(error instanceof Error ? error : new Error(String(error)));
        }
      },
      fail(error) {
        cancelRender(error instanceof Error ? error : new Error(String(error)));
      },
    });
    return () => {
      unsubscribe();
      continueRender(handle);
    };
  }, [src, frame, canvas, onDraw, delayRender, continueRender, cancelRender]);
};

export const GifFrame: React.FC<{
  src: string;
  frame: number;
  width: number;
  height: number;
  fit: 'contain' | 'cover' | 'fill';
  style?: React.CSSProperties;
}> = ({src, frame, width, height, fit, style}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useGifFrame(src, frame, canvas);
  return <canvas ref={canvas} style={{width, height, objectFit: fit, ...style}} />;
};
