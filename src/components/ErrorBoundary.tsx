import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

// Top-level safety net. Without this, any uncaught render error (e.g. a
// non-string value from the API landing directly in JSX) unmounts the
// entire React tree and leaves a blank white page with no clue why.
// This is especially important with AI_PROVIDER=ollama: Ollama's
// format: "json" only guarantees syntactically valid JSON, not the
// {email, linkedin, referencedProjectIds} shape the app expects, so
// malformed-but-valid responses are more likely from a local model than
// from Gemini's stricter responseMimeType handling.
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Surface the full error + component stack in the console so this is
    // debuggable instead of just "the page went white".
    console.error("Uncaught render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "2rem",
            maxWidth: 640,
            margin: "3rem auto",
            fontFamily: "system-ui, sans-serif",
            background: "#fff7ed",
            border: "1px solid #fdba74",
            borderRadius: 12,
          }}
        >
          <h2 style={{ margin: "0 0 0.5rem", color: "#0a1128", fontSize: "1.1rem" }}>
            Something went wrong rendering this view.
          </h2>
          <p style={{ margin: "0 0 1rem", color: "#64748b", fontSize: "0.85rem" }}>
            This is usually caused by an unexpected response shape from the AI provider
            (for example, a local Ollama model returning JSON in a slightly different
            shape than expected). Check the browser console for the full error.
          </p>
          <pre
            style={{
              background: "#ffffff",
              border: "1px solid #fed7aa",
              borderRadius: 8,
              padding: "0.75rem",
              fontSize: "0.75rem",
              color: "#b91c1c",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginBottom: "1rem",
            }}
          >
            {this.state.message}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0.5rem 1rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
