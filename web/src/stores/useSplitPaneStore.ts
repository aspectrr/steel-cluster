import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface SplitPaneState {
  id: string;
  size: number | string;
  isDragging: boolean;
  isCollapsed: boolean;
  split: "vertical" | "horizontal";
  minSize: number;
  maxSize?: number;
}

interface SplitPaneStore {
  panes: Record<string, SplitPaneState>;

  // Actions
  registerPane: (pane: Omit<SplitPaneState, "isDragging" | "isCollapsed">) => void;
  unregisterPane: (id: string) => void;
  updateSize: (id: string, size: number | string) => void;
  setDragging: (id: string, isDragging: boolean) => void;
  resetSize: (id: string, size: number | string) => void;

  // Selectors
  getPane: (id: string) => SplitPaneState | undefined;
  getPaneSize: (id: string) => number | string | undefined;
  isPaneDragging: (id: string) => boolean;
  isPaneCollapsed: (id: string) => boolean;
  setPaneCollapsed: (id: string, isCollapsed: boolean) => void;
}

export const useSplitPaneStore = create<SplitPaneStore>()(
  immer((set, get) => ({
    panes: {},

    registerPane: (pane) => {
      set((state) => {
        state.panes[pane.id] = {
          ...pane,
          isDragging: false,
          isCollapsed: true,
        };
      });
    },

    unregisterPane: (id) => {
      set((state) => {
        delete state.panes[id];
      });
    },

    updateSize: (id, size) => {
      set((state) => {
        if (state.panes[id]) {
          state.panes[id].size = size;
        }
      });
    },

    setDragging: (id, isDragging) => {
      set((state) => {
        if (state.panes[id]) {
          state.panes[id].isDragging = isDragging;
        }
      });
    },

    resetSize: (id, size) => {
      set((state) => {
        if (state.panes[id]) {
          state.panes[id].size = size;
        }
      });
    },

    getPane: (id) => get().panes[id],
    getPaneSize: (id) => get().panes[id]?.size,
    isPaneDragging: (id) => get().panes[id]?.isDragging ?? false,
    isPaneCollapsed: (id) => get().panes[id]?.isCollapsed ?? false,
    setPaneCollapsed: (id, isCollapsed) => {
      set((state) => {
        if (state.panes[id]) {
          state.panes[id].isCollapsed = isCollapsed;
        }
      });
    },
  })),
);

export const useSplitPane = (id: string) => {
  const store = useSplitPaneStore();

  return {
    pane: store.getPane(id),
    size: store.getPaneSize(id),
    isDragging: store.isPaneDragging(id),
    isCollapsed: store.isPaneCollapsed(id),
    updateSize: (size: number | string) => store.updateSize(id, size),
    setDragging: (isDragging: boolean) => store.setDragging(id, isDragging),
    setPaneCollapsed: (isCollapsed: boolean) => store.setPaneCollapsed(id, isCollapsed),
    resetSize: (size: number | string) => store.resetSize(id, size),
  };
};
