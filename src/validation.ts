import {getBeatState, isFrameExact} from './beat/timing';
import {configuredLayers} from './layers/registry';
import {LoopProps, loopSchema} from './schema';

/** Validate resolved props, after Remotion's shallow merge with defaultProps.
 * Keep this independent of React so Studio, CLI and tests share one contract.
 */
export const validateLoopProps = (input: unknown): LoopProps => {
  const result = loopSchema.safeParse(input);
  if (!result.success) {
    // Remotion's browser error bridge may retain only the first message line.
    throw new Error(`Invalid loop configuration: ${result.error.issues.map((issue) =>
      `${issue.path.join('.') || 'props'}: ${issue.message}`).join('; ')}`);
  }

  const props = result.data;
  const errors: string[] = [];
  for (const {name, definition, props: layer} of configuredLayers(props)) {
    errors.push(...definition.validate(layer, props).map((message) => `${name}.${message}`));
  }
  if (props.timingMode === 'exact' && !isFrameExact(props)) {
    const {effectiveBpm} = getBeatState(0, props);
    errors.push(`timingMode: exact requires a whole-frame loop. At ${props.fps} fps this would render at ${effectiveBpm.toFixed(6)} BPM instead of ${props.bpm}. Change BPM, bars or fps, or choose visual mode to allow rounding.`);
  }
  if (errors.length) throw new Error(`Invalid loop configuration: ${errors.join('; ')}`);
  return props;
};
