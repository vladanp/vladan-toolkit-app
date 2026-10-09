import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Shown in the fallback, e.g. the tool's name. */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps a crashing tool from taking down the whole shell. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.label}] crashed`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md space-y-4 text-center">
        <TriangleAlert className="mx-auto size-6 text-danger" />
        <div>
          <h2 className="font-medium text-fg">{this.props.label} ran into a problem</h2>
          <p className="mt-1 select-text break-words font-mono text-fg-subtle text-xs">
            {error.message}
          </p>
        </div>
        <Button onClick={this.reset}>Try again</Button>
      </div>
    );
  }
}
