import { Bug, Hammer, Wrench } from 'lucide-react';
import { defineTool, type ToolDefinition } from '@/core/tools/define-tool';

export const hammerTool = defineTool({
  id: 'hammer',
  name: 'Hammer',
  description: 'Hits things.',
  icon: Hammer,
  order: 1,
  keywords: ['nail'],
  component: () => <p>Hammer time</p>,
  commands: [{ id: 'swing', title: 'Swing the hammer', run: () => {} }],
});

export const wrenchTool = defineTool({
  id: 'wrench',
  name: 'Wrench',
  description: 'Turns things.',
  icon: Wrench,
  order: 2,
  layout: 'full',
  component: () => <p>Wrench view</p>,
});

function Crash(): never {
  throw new Error('Kaboom');
}

export const crashingTool = defineTool({
  id: 'crashy',
  name: 'Crashy',
  description: 'Always throws.',
  icon: Bug,
  component: Crash,
});

export const TEST_TOOLS: ToolDefinition[] = [hammerTool, wrenchTool, crashingTool];
