import {createElement, type ComponentType} from 'react';
import {z} from 'zod';
import {divisionBeats, divisionFitsLoop} from '../beat/envelopes';
import {getTotalBeats, type TimingConfig} from '../beat/timing';
import type {BaseLayerProps} from './base';
import {patternIssues} from '../beat/patterns';

/** A typed definition at authoring time, with a uniform runtime interface.
 * The registry only passes props resolved by the matching Zod schema.
 */
export const defineLayer = <S extends z.ZodObject>(definition: {
  schema: S & z.ZodType<BaseLayerProps>;
  defaults: z.output<S>;
  Component: ComponentType<z.output<S>>;
  validate?: (props: z.output<S>, timing: TimingConfig) => string[];
}) => {
  const defaults = definition.schema.parse(definition.defaults);
  return {
    schema: definition.schema,
    defaults,
    // An object schema cannot resolve to undefined; Zod's generic default
    // signature needs that fact stated explicitly.
    withDefaults: definition.schema.default(() => structuredClone(defaults) as
      Exclude<z.output<typeof definition.schema>, undefined>),
    // Studio should initialize an enabled override object as {}, preserving
    // the preset, rather than synthesizing minimum values for every field.
    overrides: definition.schema.partial().strict().default({}).optional(),
    render: (props: BaseLayerProps) => createElement(definition.Component, props as z.output<S>),
    validate: (props: BaseLayerProps, timing: TimingConfig): string[] => {
      if (!props.enabled) return [];
      const errors: string[] = [];
      const totalBeats = getTotalBeats(timing);
      if (!divisionFitsLoop(divisionBeats(props.division, timing.beatsPerBar), totalBeats)) {
        errors.push(`division: "${props.division}" must fit a whole number of times in ${timing.bars} bars (${totalBeats} beats). Choose a shorter division or more bars.`);
      }
      if (props.pattern) errors.push(...patternIssues(props.pattern, divisionBeats(props.division, timing.beatsPerBar), totalBeats));
      return [...errors, ...(definition.validate?.(props as z.output<S>, timing) ?? [])];
    },
  };
};
