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

const instanceIdSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Use a letter followed by letters, numbers, hyphens or underscores');

const createInstanceSchema = <K extends string, S extends z.ZodObject>(type: K, schema: S) =>
  z.object({id: instanceIdSchema, type: z.literal(type),
    props: schema.partial().strict().default({}),
  }).strict();

type InstanceSchemas = {[K in LayerName]: ReturnType<typeof createInstanceSchema<K, Registry[K]['schema']>>};
const instanceSchemas = layerNames.map((name) => createInstanceSchema(name, layerRegistry[name].schema)) as
  [InstanceSchemas[LayerName], ...InstanceSchemas[LayerName][]];

/** Array order is z-order; IDs are persistent identities, never array indices. */
export const layerInstancesSchema = z.array(z.discriminatedUnion('type', instanceSchemas))
  .superRefine((layers, context) => {
    const ids = new Set<string>();
    layers.forEach((layer, index) => {
      if (ids.has(layer.id)) context.addIssue({code: 'custom', path: [index, 'id'], message: `Duplicate layer ID "${layer.id}"`});
      ids.add(layer.id);
    });
  });
export type LayerInstance = z.output<typeof layerInstancesSchema>[number];
export type LayerInstanceInput = z.input<typeof layerInstancesSchema>[number];

export const configuredLayers = (props: Partial<LayerProps> & {
  layerOrder?: LayerName[]; layers?: LayerInstanceInput[];
}) => {
  if (props.layers !== undefined) {
    return props.layers.map((instance, index) => ({
      id: instance.id, name: instance.id, type: instance.type,
      validationPath: `layers.${index}(${instance.id}).props`,
      definition: layerRegistry[instance.type],
      // Top-level type controls act as defaults; an instance overrides only
      // its own fields. The discriminated schema has already checked them.
      props: {...(props[instance.type] ?? layerRegistry[instance.type].defaults), ...instance.props},
    }));
  }
  return (props.layerOrder ?? layerNames).map((name) => ({
    id: name, name, type: name, validationPath: name,
    definition: layerRegistry[name], props: props[name] ?? layerRegistry[name].defaults,
  }));
};
