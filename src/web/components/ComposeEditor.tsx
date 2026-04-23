import { useEffect, useRef, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import { ViewUpdate } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

interface ComposeEditorProps {
  value: string;
  onChange: (value: string) => void;
  errors?: Array<{ line?: number; message: string }>;
  warnings?: Array<{ line?: number; message: string }>;
  minHeight?: string;
}

const yamlHighlight = HighlightStyle.define([
  // YAML keys → soft blue
  { tag: t.propertyName, color: 'hsl(var(--primary))' },
  // Strings → muted teal-green
  { tag: t.string, color: '#6ee7b7' },
  // Numbers, booleans, null → amber
  { tag: [t.number, t.bool, t.null], color: '#fbbf24' },
  // Comments → dim
  { tag: t.comment, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
  // Punctuation (colons, dashes) → mid-muted
  { tag: t.punctuation, color: 'hsl(var(--muted-foreground))' },
  // Anchors & aliases → lavender
  { tag: t.labelName, color: '#c084fc' },
  // Tags (!!str etc) → same lavender
  { tag: t.typeName, color: '#c084fc' },
  // Operators → same as punctuation
  { tag: t.operator, color: 'hsl(var(--muted-foreground))' },
]);

const darkTheme = EditorView.theme({
  '&': {
    background: 'hsl(var(--background) / 0.78)',
    borderRadius: '16px',
    border: '1px solid hsl(var(--border))',
    overflow: 'hidden',
  },
  '&.cm-focused': {
    outline: 'none',
    border: '1px solid hsl(var(--primary) / 0.36)',
  },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': {
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    padding: '12px 16px',
    color: 'hsl(var(--foreground))',
    caretColor: 'hsl(var(--primary))',
  },
  '.cm-gutters': {
    background: 'hsl(var(--background) / 0.6)',
    border: 'none',
    borderRight: '1px solid hsl(var(--border))',
    color: 'hsl(var(--muted-foreground))',
    padding: '0 8px',
  },
  '.cm-activeLineGutter': { background: 'hsl(var(--accent))' },
  '.cm-activeLine': { background: 'hsl(var(--accent) / 0.7)' },
  '.cm-selectionBackground, ::selection': { background: 'hsl(var(--primary) / 0.20)' },
  '.cm-cursor': { borderLeftColor: 'hsl(var(--primary))' },
  '.cm-matchingBracket': { background: 'hsl(var(--primary) / 0.15)', outline: 'none' },
  '.cm-line': { padding: '0' },
}, { dark: true });

export function ComposeEditor({ value, onChange, errors = [], warnings = [], minHeight = '460px' }: ComposeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onUpdate = useCallback(
    (update: ViewUpdate) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        yaml(),
        EditorView.updateListener.of(onUpdate),
        darkTheme,
        syntaxHighlighting(yamlHighlight),
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

  return (
    <div className="space-y-2">
      <div ref={containerRef} />
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-[rgba(254,202,202,0.85)]">
              {err.line ? `Line ${err.line}: ` : ''}{err.message}
            </p>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((warn, i) => (
            <p key={i} className="text-xs text-[#fcd34d]">
              {warn.line ? `Line ${warn.line}: ` : ''}{warn.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
