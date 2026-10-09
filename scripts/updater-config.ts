/** Usage: node scripts/updater-config.ts <pubkey> <owner/repo> > src-tauri/tauri.updater.conf.json */
import { updaterConfig } from './lib/updater-config.ts';

const [pubkey = '', repository = ''] = process.argv.slice(2);
console.info(JSON.stringify(updaterConfig(pubkey, repository), null, 2));
