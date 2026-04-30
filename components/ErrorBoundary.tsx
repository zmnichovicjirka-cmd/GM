import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: any, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Něco se pokazilo.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Chyba databáze: ${parsed.error}`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/90 backdrop-blur-xl p-8">
          <div className="max-w-md w-full glass-panel p-12 rounded-[3rem] text-center space-y-8 border-red-500/20 shadow-2xl shadow-red-500/10">
            <div className="w-20 h-20 bg-red-600/20 rounded-full flex items-center justify-center mx-auto">
              <i className="fa-solid fa-triangle-exclamation text-red-500 text-3xl"></i>
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Chyba aplikace</h2>
              <p className="text-zinc-400 text-sm font-bold leading-relaxed">{errorMessage}</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-zinc-200 transition-all"
            >
              Restartovat aplikaci
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
