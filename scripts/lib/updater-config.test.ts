import { describe, expect, it } from 'vitest';
import { updaterConfig } from './updater-config';

describe('updaterConfig', () => {
  it('enables signed update bundles pointing at the latest GitHub release', () => {
    expect(updaterConfig(' KEY \n', 'vladanp/vladan-toolkit-app')).toEqual({
      bundle: { createUpdaterArtifacts: true },
      plugins: {
        updater: {
          pubkey: 'KEY',
          endpoints: [
            'https://github.com/vladanp/vladan-toolkit-app/releases/latest/download/latest.json',
          ],
          windows: { installMode: 'passive' },
        },
      },
    });
  });

  it('rejects a missing key or a malformed repository', () => {
    expect(() => updaterConfig('', 'a/b')).toThrow(/public key/);
    expect(() => updaterConfig('KEY', 'not a repo')).toThrow(/Invalid repository/);
  });
});
