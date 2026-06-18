import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const sugKey = new PluginKey<{ text: string | null }>("ghostSuggestion");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ghostSuggestion: {
      setSuggestion: (text: string) => ReturnType;
      clearSuggestion: () => ReturnType;
      acceptSuggestion: () => ReturnType;
    };
  }
}

/**
 * Inline ghost-text completion (R3). Shows a grey suggestion at the cursor; Tab accepts,
 * typing or Esc clears. The page sets the suggestion from the /analyze response.
 */
export const GhostSuggestion = Extension.create({
  name: "ghostSuggestion",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: sugKey,
        state: {
          init: () => ({ text: null as string | null }),
          apply(tr, value) {
            const meta = tr.getMeta(sugKey);
            if (meta !== undefined) return { text: meta as string | null };
            if (tr.docChanged || tr.selectionSet) return { text: null }; // typing / moving clears
            return value;
          },
        },
        props: {
          decorations(state) {
            const s = sugKey.getState(state);
            if (!s?.text) return null;
            const pos = state.selection.head;
            const widget = Decoration.widget(
              pos,
              () => {
                const span = document.createElement("span");
                span.className = "mng-ghost";
                span.textContent = s.text as string;
                return span;
              },
              { side: 1 },
            );
            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSuggestion:
        (text: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(sugKey, text));
          return true;
        },
      clearSuggestion:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(sugKey, null));
          return true;
        },
      acceptSuggestion:
        () =>
        ({ state, tr, dispatch }) => {
          const s = sugKey.getState(state);
          if (!s?.text) return false;
          if (dispatch) {
            const pos = state.selection.head;
            dispatch(tr.insertText(s.text, pos).setMeta(sugKey, null));
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.acceptSuggestion(),
      Escape: () => this.editor.commands.clearSuggestion(),
    };
  },
});
