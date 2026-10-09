/**
 * Tauri config overlay that turns on signed auto-updates for a release build. It is merged
 * in with `tauri build --config`, so local and CI builds never need the signing keys.
 */
export function updaterConfig(pubkey: string, repository: string) {
  if (!pubkey.trim()) throw new Error('Missing updater public key.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error(`Invalid repository "${repository}".`);
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        pubkey: pubkey.trim(),
        endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`],
        windows: { installMode: 'passive' },
      },
    },
  };
}
