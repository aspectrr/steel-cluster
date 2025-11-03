import { useSplitPaneStore, useSplitPane } from "@/stores/useSplitPaneStore";

// Constants for commonly used pane IDs
export const PANE_IDS = {
  MAIN_VERTICAL: "main-vertical-pane",
  SUB_HORIZONTAL: "sub-horizontall-pane",
} as const;

export type PaneId = (typeof PANE_IDS)[keyof typeof PANE_IDS];

export function useSplitPaneController() {
  const store = useSplitPaneStore();

  return {
    getAllPanes: () => store.panes,

    getPane: (id: string) => store.getPane(id),

    resizePane: (id: string, size: number | string) => store.updateSize(id, size),
    resetPane: (id: string, size: number | string) => store.resetSize(id, size),
    togglePane: (id: string) => store.setPaneCollapsed(id, !store.isPaneCollapsed(id)),

    resetAllPanes: (sizes: Record<string, number | string>) => {
      Object.entries(sizes).forEach(([id, size]) => {
        store.resetSize(id, size);
      });
    },

    layouts: {
      default: () => {
        store.resetSize(PANE_IDS.MAIN_VERTICAL, "40%");
        store.resetSize(PANE_IDS.SUB_HORIZONTAL, "calc(100% - 50px)");
      },

      codeView: () => {
        store.resetSize(PANE_IDS.MAIN_VERTICAL, "70%");
        store.resetSize(PANE_IDS.SUB_HORIZONTAL, "calc(100% - 50px)");
      },

      previewView: () => {
        store.resetSize(PANE_IDS.MAIN_VERTICAL, "25%");
        store.resetSize(PANE_IDS.SUB_HORIZONTAL, "70%");
      },

      logView: () => {
        store.resetSize(PANE_IDS.MAIN_VERTICAL, "40%");
        store.resetSize(PANE_IDS.SUB_HORIZONTAL, "40%");
      },

      balanced: () => {
        store.resetSize(PANE_IDS.MAIN_VERTICAL, "50%");
        store.resetSize(PANE_IDS.SUB_HORIZONTAL, "60%");
      },
    },

    isAnyPaneDragging: () => {
      return Object.values(store.panes).some((pane) => pane.isDragging);
    },

    getPaneSize: (id: string) => store.getPaneSize(id),
    isPaneCollapsed: (id: string) => store.isPaneCollapsed(id),
    isPaneDragging: (id: string) => store.isPaneDragging(id),
  };
}

export function usePlaygroundPanes() {
  const mainVerticalPane = useSplitPane(PANE_IDS.MAIN_VERTICAL);
  const sessionLogPane = useSplitPane(PANE_IDS.SUB_HORIZONTAL);

  return {
    mainVertical: mainVerticalPane,
    sessionLog: sessionLogPane,

    expandIDE: () => mainVerticalPane.resetSize("70%"),
    expandPreview: () => {
      mainVerticalPane.resetSize("25%");
      sessionLogPane.resetSize("70%");
    },
    expandLogs: () => sessionLogPane.resetSize("40%"),
    collapseLogs: () => sessionLogPane.resetSize("calc(100% - 50px)"),

    setLayout: {
      default: () => {
        mainVerticalPane.resetSize("40%");
        sessionLogPane.resetSize("calc(100% - 50px)");
      },
      codeView: () => {
        mainVerticalPane.resetSize("70%");
        sessionLogPane.resetSize("calc(100% - 50px)");
      },
      previewView: () => {
        mainVerticalPane.resetSize("25%");
        sessionLogPane.resetSize("70%");
      },
    },
  };
}
