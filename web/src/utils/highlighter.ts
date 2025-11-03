import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export const highlighterPromise = createHighlighterCore({
  themes: [
    // or a dynamic import if you want to do chunk splitting
    import("@shikijs/themes/aurora-x"),
  ],
  langs: [import("@shikijs/langs/typescript"), import("@shikijs/langs/python")],
  // `shiki/wasm` contains the wasm binary inlined as base64 string.
  engine: createJavaScriptRegexEngine(),
});
