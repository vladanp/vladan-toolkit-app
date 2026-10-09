import type { UserConfig } from '@commitlint/types';

/**
 * Conventional Commits drive versioning (release-please):
 *   fix: → patch · feat: → minor · `!` or BREAKING CHANGE: → major
 */
const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};

export default config;
