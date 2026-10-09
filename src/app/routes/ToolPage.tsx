import { useParams } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { Suspense, useEffect } from 'react';
import { useUsage } from '@/core/stores/usage';
import { useRegistry } from '../registry-context';
import { ErrorBoundary } from '../shell/ErrorBoundary';
import { Page } from '../shell/Page';
import { NotFoundPage } from './NotFoundPage';

function ToolLoading() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading tool">
      <LoaderCircle className="size-5 animate-spin text-fg-subtle" />
    </div>
  );
}

/** Hosts any registered tool: header, lazy loading, crash isolation and usage tracking. */
export function ToolPage() {
  const { toolId } = useParams({ from: '/tools/$toolId' });
  const tool = useRegistry().get(toolId);
  const markUsed = useUsage((s) => s.markUsed);

  useEffect(() => {
    if (tool) markUsed(tool.id);
  }, [tool, markUsed]);

  if (!tool) return <NotFoundPage />;

  const ToolComponent = tool.component;
  return (
    <Page title={tool.name} icon={tool.icon} description={tool.description} layout={tool.layout}>
      <ErrorBoundary key={tool.id} label={tool.name}>
        <Suspense fallback={<ToolLoading />}>
          <ToolComponent />
        </Suspense>
      </ErrorBoundary>
    </Page>
  );
}
