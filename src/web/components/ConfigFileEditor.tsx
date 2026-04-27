import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";

interface ConfigFileEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
}

const darkTheme = EditorView.theme(
  {
    "&": {
      background: "hsl(var(--background) / 0.78)",
      borderRadius: "12px",
      border: "1px solid hsl(var(--border))",
      overflow: "hidden",
    },
    "&.cm-focused": {
      outline: "none",
      border: "1px solid hsl(var(--primary) / 0.36)",
    },
    ".cm-scroller": { overflow: "auto" },
    ".cm-content": {
      fontFamily: "monospace",
      fontSize: "0.8125rem",
      padding: "12px 16px",
      color: "hsl(var(--foreground))",
      caretColor: "hsl(var(--primary))",
    },
    ".cm-gutters": {
      background: "hsl(var(--background) / 0.6)",
      border: "none",
      borderRight: "1px solid hsl(var(--border))",
      color: "hsl(var(--muted-foreground))",
      padding: "0 8px",
    },
    ".cm-activeLineGutter": { background: "hsl(var(--accent))" },
    ".cm-activeLine": { background: "hsl(var(--accent) / 0.7)" },
    ".cm-selectionBackground, ::selection": {
      background: "hsl(var(--primary) / 0.20)",
    },
    ".cm-cursor": { borderLeftColor: "hsl(var(--primary))" },
    ".cm-matchingBracket": {
      background: "hsl(var(--primary) / 0.15)",
      outline: "none",
    },
    ".cm-line": { padding: "0" },
  },
  { dark: true },
);

export function ConfigFileEditor({
  value,
  onChange,
  minHeight = "200px",
}: ConfigFileEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        darkTheme,
        EditorView.contentAttributes.of({ style: `min-height: ${minHeight}` }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only create once

  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} />;
}
