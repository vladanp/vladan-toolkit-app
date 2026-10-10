import { Cpu } from 'lucide-react';
import { lazy } from 'react';
import { defineTool } from '@/core/tools/define-tool';

export default defineTool({
  id: 'system-info',
  name: 'System Info',
  description:
    'Your computer at a glance: live load, graphics, displays, drives, network and battery.',
  icon: Cpu,
  keywords: [
    'pc',
    'os',
    'hardware',
    'cpu',
    'memory',
    'ram',
    'gpu',
    'graphics',
    'display',
    'refresh rate',
    'disk',
    'storage',
    'battery',
    'network',
    'ip',
    'version',
  ],
  order: 10,
  component: lazy(() => import('./SystemInfo')),
  commands: [
    {
      id: 'copy',
      title: 'Copy system info as Markdown',
      keywords: ['clipboard', 'bug report'],
      run: async () => (await import('./SystemInfo')).copySystemInfo(),
    },
  ],
});
