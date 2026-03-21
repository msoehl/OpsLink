import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <AlertTriangle size={40} className="text-red-400" />
          <div className="text-center">
            <p className="text-white font-semibold mb-1">Something went wrong</p>
            <p className="text-gray-500 text-xs font-mono max-w-md break-all">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs text-blue-400 hover:text-blue-300 border border-blue-400/30 hover:border-blue-400/60 px-4 py-1.5 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
