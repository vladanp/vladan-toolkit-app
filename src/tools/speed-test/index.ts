import { Gauge } from 'lucide-react';
import { lazy } from 'react';
import { defineTool } from '@/core/tools/define-tool';

export default defineTool({
  id: 'speed-test',
  name: 'Speed Test',
  description:
    'Download, upload, ping and lag under load, with what it means for games and streaming.',
  icon: Gauge,
  keywords: [
    'internet',
    'speed',
    'bandwidth',
    'ping',
    'latency',
    'jitter',
    'download',
    'upload',
    'mbps',
    'wifi',
    'lag',
    'bufferbloat',
  ],
  order: 20,
  component: lazy(() => import('./SpeedTest')),
  commands: [
    {
      id: 'run',
      title: 'Run a speed test',
      keywords: ['internet', 'ping', 'bandwidth'],
      run: async ({ openTool }) => {
        await openTool();
        const { useSpeedTest } = await import('./store');
        void useSpeedTest.getState().start();
      },
    },
  ],
});
