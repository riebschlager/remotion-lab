// Resolved by a bundler alias to the manifests that tests/visual/assets.test.ts scans at run time.
declare module 'asset-fixture-manifests' {
  const manifests: Record<string, import('../../src/assets/manifest').CollectionManifest>;
  export default manifests;
}
