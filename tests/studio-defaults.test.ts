import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {RemotionRoot} from '../src/Root';
import {createLoopDefaults, loopSchema} from '../src/schema';
import {layerNames} from '../src/layers/registry';

// Inspect the actual registered raw props. Metadata tests alone miss Studio's
// editor, which accesses nested objects before Zod defaults are applied.
const directCompositions = () => React.Children.toArray((RemotionRoot({}) as React.ReactElement<{children: React.ReactNode}>).props.children)
  .filter((child): child is React.ReactElement<{id: string; defaultProps: unknown}> =>
    React.isValidElement(child) && ['BeatLoop', 'SeamCheck'].includes((child.props as {id: string}).id));

test('Studio receives complete raw layer defaults for both direct compositions', () => {
  const compositions = directCompositions();
  assert.equal(compositions.length, 2);
  for (const composition of compositions) {
    const raw = composition.props.defaultProps;
    const resolved = loopSchema.parse(raw);
    for (const name of layerNames) assert.deepEqual(resolved[name], createLoopDefaults()[name], `${composition.props.id}.${name} must match registry defaults`);
    assert.deepEqual(raw, resolved, `${composition.props.id} must not rely on metadata to fill editor values`);
    for (const name of layerNames) assert.equal(typeof resolved[name].enabled, 'boolean');
    assert.equal(resolved.debug.enabled, false);
  }
  assert.notEqual(
    (compositions[0].props.defaultProps as Record<string, unknown>).rings,
    (compositions[1].props.defaultProps as Record<string, unknown>).rings,
    'Composition defaults must not share mutable layer objects',
  );
});
