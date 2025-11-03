import React, { createContext, useContext, useRef, useCallback, ReactNode } from "react";

type ScrollBehavior = "into-view" | "to-top" | "to-center" | "to-bottom";

interface ScrollTarget {
  id: string;
  element: HTMLElement;
}

interface ScrollContextValue {
  registerTarget: (id: string, element: HTMLElement) => void;
  unregisterTarget: (id: string) => void;
  scrollTo: (id: string, behavior?: ScrollBehavior, options?: ScrollIntoViewOptions) => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

interface ScrollProviderProps {
  children: ReactNode;
  defaultBehavior?: ScrollBehavior;
  defaultScrollOptions?: ScrollIntoViewOptions;
}

export function ScrollProvider({ 
  children, 
  defaultBehavior = "into-view",
  defaultScrollOptions = { behavior: "smooth" } 
}: ScrollProviderProps) {
  const targetsRef = useRef<Map<string, HTMLElement>>(new Map());

  const registerTarget = useCallback((id: string, element: HTMLElement) => {
    targetsRef.current.set(id, element);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    targetsRef.current.delete(id);
  }, []);

  const scrollTo = useCallback((
    id: string, 
    behavior: ScrollBehavior = defaultBehavior, 
    options?: ScrollIntoViewOptions
  ) => {
    const element = targetsRef.current.get(id);
    if (!element) {
      console.warn(`ScrollTarget with id "${id}" not found`);
      return;
    }

    const scrollOptions = { ...defaultScrollOptions, ...options };

    switch (behavior) {
      case "into-view":
        element.scrollIntoView(scrollOptions);
        break;
      
      case "to-top":
        element.scrollIntoView({ ...scrollOptions, block: "start" });
        break;
      
      case "to-center":
        element.scrollIntoView({ ...scrollOptions, block: "center" });
        break;
      
      case "to-bottom":
        element.scrollIntoView({ ...scrollOptions, block: "end" });
        break;
      
      default:
        element.scrollIntoView(scrollOptions);
    }
  }, [defaultBehavior, defaultScrollOptions]);

  return (
    <ScrollContext.Provider value={{ registerTarget, unregisterTarget, scrollTo }}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScroll() {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error("useScroll must be used within a ScrollProvider");
  }
  return context;
}

interface ScrollTargetProps {
  id: string;
  children?: ReactNode;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  style?: React.CSSProperties;
}

export function ScrollTarget({ 
  id, 
  children, 
  className,
  as = "div",
  style,
  ...props
}: ScrollTargetProps) {
  const { registerTarget, unregisterTarget } = useScroll();
  const elementRef = useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (elementRef.current) {
      registerTarget(id, elementRef.current);
    }

    return () => {
      unregisterTarget(id);
    };
  }, [id, registerTarget, unregisterTarget]);

  // If no children, render as self-closing anchor point
  if (!children) {
    const Component = as;
    return React.createElement(Component, {
      ref: elementRef,
      className,
      style: { height: 0, ...style },
      ...props
    });
  }

  // If has children, wrap them
  const Component = as;
  return React.createElement(Component, {
    ref: elementRef,
    className,
    style,
    ...props
  }, children);
}