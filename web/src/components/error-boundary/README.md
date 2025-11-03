# Error Boundary System

This directory contains a comprehensive error boundary system integrated with Sentry for the Steel frontend app.

## Components

### `ErrorBoundary`
The main error boundary component that catches JavaScript errors anywhere in the child component tree.

**Props:**
- `children`: React components to wrap
- `fallback?`: Custom fallback UI (optional)
- `level?`: Error level - "page" | "section" | "component" (default: "component")
- `context?`: String identifier for the error context
- `showDetails?`: Whether to show error details in the UI (default: false)
- `onError?`: Custom error handler function

**Features:**
- Automatic Sentry error reporting with context
- Responsive UI based on error level
- Error details display in development
- Feedback reporting integration
- Retry and navigation actions

### `RouteErrorBoundary`
Specialized error boundary for route-level errors with navigation context.

**Props:**
- `children`: React components to wrap
- `routeName?`: Name of the route for better error tracking

**Features:**
- Automatic route context capture
- Navigation breadcrumbs
- Page-level error handling

### `SessionErrorBoundary`
Specialized error boundary for session-related components.

**Props:**
- `children`: React components to wrap
- `sessionId?`: Session ID for context
- `context?`: Additional context string (default: "session")

**Features:**
- Session-specific error context
- Context capture across environments
- Session operation tracking

### `PlaygroundErrorBoundary`
Specialized error boundary for playground components.

**Props:**
- `children`: React components to wrap
- `context?`: Playground context (default: "playground")
- `language?`: Programming language being used
- `codeLength?`: Length of code being executed

**Features:**
- Code execution context capture
- Language-specific error tracking
- Development environment awareness

## Usage Examples

### Basic Error Boundary
```tsx
import { ErrorBoundary } from "@/components/error-boundary";

function MyComponent() {
  return (
    <ErrorBoundary level="component" context="my-component">
      <SomeComponentThatMightFail />
    </ErrorBoundary>
  );
}
```

### Route Error Boundary
```tsx
import { RouteErrorBoundary } from "@/components/error-boundary";

function MyRoute() {
  return (
    <RouteErrorBoundary routeName="dashboard">
      <DashboardPage />
    </RouteErrorBoundary>
  );
}
```

### Session Error Boundary
```tsx
import { SessionErrorBoundary } from "@/components/error-boundary";

function SessionViewer({ sessionId }: { sessionId: string }) {
  return (
    <SessionErrorBoundary sessionId={sessionId} context="viewer">
      <SessionViewerComponent />
    </SessionErrorBoundary>
  );
}
```

### Playground Error Boundary
```tsx
import { PlaygroundErrorBoundary } from "@/components/error-boundary";

function CodeEditor({ language, code }: { language: string; code: string }) {
  return (
    <PlaygroundErrorBoundary 
      context="editor" 
      language={language} 
      codeLength={code.length}
    >
      <MonacoEditor />
    </PlaygroundErrorBoundary>
  );
}
```

## Error Boundary Hook

Use the `useErrorBoundary` hook for programmatic error handling:

```tsx
import { useErrorBoundary } from "@/hooks/use-error-boundary";

function MyComponent() {
  const { captureError, captureMessage, showReportDialog } = useErrorBoundary();

  const handleAsyncError = async () => {
    try {
      await riskyOperation();
    } catch (error) {
      captureError(error as Error, {
        component: "MyComponent",
        action: "riskyOperation",
        metadata: { userId: "123" }
      });
    }
  };

  return (
    <button onClick={handleAsyncError}>
      Do Risky Operation
    </button>
  );
}
```

## Error Levels

### Page Level (`level="page"`)
- Full-screen error display
- Navigation options (Home, Reload)
- Used for critical application errors
- Includes shadow and enhanced styling

### Section Level (`level="section"`)
- Contained error display (400px min-height)
- Reload option only
- Used for feature-specific errors
- Maintains page layout

### Component Level (`level="component"`)
- Minimal error display (200px min-height)
- Basic retry functionality
- Used for individual component errors
- Least intrusive

## Sentry Integration

All error boundaries automatically:
- Capture exceptions with full context
- Set context and grouping information
- Add navigation and component breadcrumbs
- Tag errors with boundary level and context
- Provide error IDs for feedback

## Best Practices

1. **Granular Boundaries**: Place error boundaries at multiple levels for better error isolation
2. **Meaningful Context**: Always provide descriptive context strings
3. **Development Details**: Enable `showDetails` in development for debugging
4. **Custom Fallbacks**: Use custom fallback UI for critical components
5. **Error Recovery**: Implement proper error recovery mechanisms

## Integration Points

The error boundary system is integrated at:
- **App Level**: Root application wrapper
- **Route Level**: Individual route components
- **Feature Level**: Major feature sections (sessions, playground)
- **Component Level**: Critical UI components

This multi-layered approach ensures comprehensive error coverage while maintaining good user experience. 