import {z} from 'zod';
import {backgroundLayer} from './Background';
import {ringsLayer} from './Rings';

/** Register a layer once. Insertion order is the default back-to-front order. */
export const layerRegistry = {
  background: backgroundLayer,
  rings: ringsLayer,
};

type Registry = typeof layerRegistry;
export type LayerName = keyof Registry;
export type LayerProps = {[K in LayerName]: z.output<Registry[K]['schema']>};
export const layerNames = Object.keys(layerRegistry) as [LayerName, ...LayerName[]];
export const layerNameSchema = z.enum(layerNames);

// Object.fromEntries loses the key/value relationship; keep that assertion
// here so schema consumers retain each layer's specific, inferred props.
export const layerShape = Object.fromEntries(layerNames.map((name) => [name,
  layerRegistry[name].withDefaults,
])) as {[K in LayerName]: Registry[K]['withDefaults']};

export const layerOverrideShape = Object.fromEntries(layerNames.map((name) => [name,
  layerRegistry[name].overrides,
])) as {[K in LayerName]: Registry[K]['overrides']};

export const layerOrderSchema = z.array(layerNameSchema).length(layerNames.length)
  .refine((order) => new Set(order).size === order.length, 'Each registered layer must appear exactly once');

export const configuredLayers = (props: Partial<LayerProps> & {layerOrder?: LayerName[]}) =>
  (props.layerOrder ?? layerNames).map((name) => ({
    name, definition: layerRegistry[name], props: props[name] ?? layerRegistry[name].defaults,
  }));
