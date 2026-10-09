import { Link } from '@tanstack/react-router';
import { Compass } from 'lucide-react';
import { Page } from '../shell/Page';

export function NotFoundPage() {
  return (
    <Page title="Not found" icon={Compass}>
      <div className="mt-16 space-y-3 text-center">
        <h2 className="font-semibold text-fg text-xl tracking-tight">Nothing here</h2>
        <p className="text-fg-muted">This page or tool doesn't exist (anymore).</p>
        <Link to="/" className="inline-block text-accent-text hover:underline">
          Back to Home
        </Link>
      </div>
    </Page>
  );
}
