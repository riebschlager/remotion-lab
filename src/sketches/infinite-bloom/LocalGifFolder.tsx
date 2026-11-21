import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {PlayableClip} from '../../assets/Clip';

type LocalGif = Omit<PlayableClip, 'src'> & {file: File};
type LocalFolder = {name: string; gifs: LocalGif[]; skipped: number};

const readGif = async (file: File, signal: AbortSignal): Promise<LocalGif | null> => {
  const data = await file.arrayBuffer();
  signal.throwIfAborted();
  // Probe with the same decoder that ClipFrame uses to draw GIFs.
  const decoder = new ImageDecoder({data, type: 'image/gif', preferAnimation: true});
  const abort = () => decoder.close();
  signal.addEventListener('abort', abort, {once: true});
  try {
    await Promise.all([decoder.completed, decoder.tracks.ready]);
    const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (frameCount < 2) return null;
    const frameStarts: number[] = [];
    let durationSeconds = 0;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const {image} = await decoder.decode({frameIndex});
      frameStarts.push(image.timestamp / 1e6);
      durationSeconds = (image.timestamp + (image.duration ?? 0)) / 1e6;
      image.close();
    }
    return {
      file, name: file.webkitRelativePath || file.name, format: 'gif', frameCount,
      timing: 'variable', frameStarts, durationSeconds, fps: frameCount / durationSeconds, fpsRational: null,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    if (!signal.aborted) decoder.close();
  }
};

export const useLocalGifFolder = () => {
  const [folder, setFolder] = useState<LocalFolder | null>(null);
  const [loaded, setLoaded] = useState<{folder: LocalFolder; clips: PlayableClip[]} | null>(null);
  useEffect(() => {
    if (!folder) {
      setLoaded(null);
      return;
    }
    const clips = folder.gifs.map(({file, ...metadata}) => ({
      ...metadata, src: URL.createObjectURL(file.slice(0, file.size, 'image/gif')),
    }));
    setLoaded({folder, clips});
    return () => clips.forEach(({src}) => URL.revokeObjectURL(src));
  }, [folder]);
  return {folder, setFolder, clips: loaded?.folder === folder ? loaded.clips : null};
};

export const LocalGifFolderPicker: React.FC<{
  folder: LocalFolder | null;
  onFolderChange: (folder: LocalFolder | null) => void;
  playbackError?: string;
}> = ({folder, onFolderChange, playbackError}) => {
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    // Place controls above Studio's canvas selection surface, outside the artwork.
    const preview = () => anchor.current?.closest('.remotion-studio-composition-container');
    const container = preview();
    if (container) {
      setHost(container);
      return;
    }

    // Studio can mount the composition before attaching its portal to the preview.
    const observer = new MutationObserver(() => {
      const attached = preview();
      if (attached) {
        setHost(attached);
        observer.disconnect();
      }
    });
    observer.observe(document.body, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => pending.current?.abort(), []);

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    pending.current?.abort();
    pending.current = null;
    if (!files.length) {
      setStatus('');
      return;
    }

    const gifFiles = files.filter(({name}) => /\.gif$/i.test(name)).sort((a, b) =>
      a.webkitRelativePath < b.webkitRelativePath ? -1 : Number(a.webkitRelativePath > b.webkitRelativePath));
    if (!gifFiles.length) {
      setStatus('This folder contains no GIF files.');
      return;
    }

    const request = new AbortController();
    pending.current = request;
    setStatus('Reading GIFs…');
    const gifs: LocalGif[] = [];
    for (const file of gifFiles) {
      try {
        const gif = await readGif(file, request.signal);
        if (gif) gifs.push(gif);
      } catch {
        // Skip unreadable files and keep any animated GIFs that did load.
      }
      if (request.signal.aborted) return;
    }
    pending.current = null;
    if (!gifs.length) {
      setStatus('No readable animated GIFs in this folder.');
      return;
    }
    onFolderChange({
      name: files[0].webkitRelativePath.split('/')[0] || 'Local folder',
      gifs, skipped: gifFiles.length - gifs.length,
    });
    setStatus('');
  };

  const button: React.CSSProperties = {
    font: 'inherit', color: '#fff1ea', background: '#40283c', border: '1px solid #815877',
    borderRadius: 4, padding: '4px 7px', cursor: 'pointer',
  };

  return <><span ref={anchor} hidden />{host && createPortal(<div style={{
    position: 'absolute', top: 8, left: 8, right: 8,
    zIndex: 1, pointerEvents: 'none', color: '#fff1ea', font: '500 12px/1.25 system-ui, sans-serif',
  }}>
    <div style={{display: 'flex', alignItems: 'center', gap: 5, width: 'fit-content', pointerEvents: 'auto'}}>
      <input ref={(element) => {
        input.current = element;
        if (element) element.webkitdirectory = true;
      }} type="file" hidden onChange={choose} />
      <button type="button" style={button} onClick={() => {
        if (typeof ImageDecoder === 'undefined') {
          setStatus('Open Studio in a browser that supports GIF decoding, such as Chrome.');
          return;
        }
        input.current?.click();
      }}>Choose GIF folder</button>
      {(folder || pending.current) && <button type="button" style={button} onClick={() => {
        if (pending.current) {
          pending.current.abort();
          pending.current = null;
        } else {
          onFolderChange(null);
        }
        setStatus('');
      }}>{pending.current ? 'Cancel' : 'Clear'}</button>}
    </div>
    <div role="status" style={{marginTop: 4, fontSize: 11, overflowWrap: 'anywhere', width: 'fit-content',
      background: '#211222', padding: '2px 4px', borderRadius: 3}}>
      {status || playbackError || (folder
        ? `${folder.name} · ${folder.gifs.length} ${folder.gifs.length === 1 ? 'GIF' : 'GIFs'}${folder.skipped ? ` · ${folder.skipped} skipped` : ''} · Preview only`
        : 'Local files · Studio preview only')}
    </div>
  </div>, host)}</>;
};
