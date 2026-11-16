import {useBeat} from '../beat/BeatContext';
import type {BaseLayerProps} from '../layers/base';
import {LayerInstanceProvider} from '../layers/InstanceContext';
import {Layer} from '../layers/Layer';
import {LayerModulation} from '../layers/LayerModulation';
import {layerRegistry, type LayerName, type LayerProps} from '../layers/registry';

/**
 * Drop a registered layer into a sketch: registry defaults, then `props`.
 * It receives the same schema and musical validation as in BeatLoop.
 * Note that Rings sizes are literal pixels tuned for 1080×1920.
 */
export const UseLayer = <K extends LayerName>({id, type, props}: {
  /** Stable identity; namespaces the layer's seeded randomness. */
  id: string;
  type: K;
  props?: Partial<LayerProps[K]>;
}) => {
  const time = useBeat();
  const definition = layerRegistry[type];
  const parsed = definition.schema.safeParse({...definition.defaults, ...props});
  if (!parsed.success) {
    throw new Error(`Invalid layer "${id}" (${type}): ${parsed.error.issues.map((issue) =>
      `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const layer = parsed.data as BaseLayerProps;
  const errors = definition.validate(layer, {bpm: time.bpm, fps: time.fps,
    beatsPerBar: time.beatsPerBar, bars: time.totalBeats / time.beatsPerBar});
  if (errors.length) throw new Error(`Invalid layer "${id}" (${type}): ${errors.join('; ')}`);
  return (
    <Layer enabled={layer.enabled} opacity={layer.opacity} blendMode={layer.blendMode}>
      <LayerInstanceProvider id={id} type={type}>
        <LayerModulation layer={layer}>{definition.render(layer)}</LayerModulation>
      </LayerInstanceProvider>
    </Layer>
  );
};
