import { useEffect, useRef, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import { ViewUpdate } from '@codemirror/view';

interface ComposeEditorProps {
  value: string;
  onChange: (value: string) => void;
  errors?: Array<{ line?: number; message: string }>;
  warnings?: Array<{ line?: number; message: string }>;
}

export function ComposeEditor({ value, onChange, errors = [], warnings = [] }: ComposeEditorProps) {
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
        EditorView.theme({
          '&': { height: '400px', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { fontFamily: 'monospace', fontSize: '14px' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only create once

  // Update editor content when value changes externally
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
            <p key={i} className="text-sm text-destructive">
              {err.line ? `Line ${err.line}: ` : ''}{err.message}
            </p>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((warn, i) => (
            <p key={i} className="text-sm text-yellow-600">
              {warn.line ? `Line ${warn.line}: ` : ''}{warn.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
