import { Cpu } from 'lucide-react';
import { lazy } from 'react';
import { defineTool } from '@/core/tools/define-tool';

export default defineTool({
  id: 'system-info',
  name: 'System Info',
  description: 'Details about this machine and build, ready to paste into bug reports.',
  icon: Cpu,
  keywords: ['os', 'hardware', 'cpu', 'memory', 'version', 'debug'],
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
