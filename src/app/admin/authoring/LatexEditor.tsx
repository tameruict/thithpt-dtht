'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  StreamLanguage,
} from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { updateQuestionMetadataAtPosition } from '@/lib/authoring/parser';

export type LatexEditorHandle = {
  insertText: (text: string) => void;
  replaceRange: (from: number, to: number, text: string) => void;
  focus: () => void;
  goTo: (line: number, column: number) => void;
  updateQuestionMetadata: (updates: {
    difficulty?: number;
    knowledgeFieldSlug?: string | null;
  }) => boolean;
};

type LatexEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (position: number) => void;
  readOnly?: boolean;
};

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#17151a',
    color: '#f4edf1',
    fontSize: '14px',
    outline: 'none',
  },
  '&.cm-focused': {
    boxShadow: 'inset 0 0 0 2px #7dd3fc',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono), monospace',
    lineHeight: '1.75',
  },
  '.cm-content': {
    padding: '18px 0 28px',
    caretColor: '#facc15',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeft: '3px solid #facc15',
    animation: 'none !important',
  },
  '.cm-gutters': {
    border: 'none',
    color: '#746a72',
    backgroundColor: '#17151a',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: '#25212a',
  },
  '.cm-activeLineGutter': {
    color: '#ffffff',
    fontWeight: '700',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: '#61334a',
  },
});

const LatexEditor = forwardRef<LatexEditorHandle, LatexEditorProps>(
  function LatexEditor(
    { value, onChange, onCursorChange, readOnly = false },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onCursorChangeRef = useRef(onCursorChange);
    const initialValueRef = useRef(value);
    const initialReadOnlyRef = useRef(readOnly);
    const editableCompartmentRef = useRef(new Compartment());

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onCursorChangeRef.current = onCursorChange;
    }, [onCursorChange]);

    useEffect(() => {
      if (!hostRef.current) return;

      const state = EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          lineNumbers(),
          foldGutter(),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          bracketMatching(),
          indentOnInput(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          StreamLanguage.define(stex),
          placeholder('Nhập nguồn LaTeX có cấu trúc...'),
          editorTheme,
          EditorView.lineWrapping,
          editableCompartmentRef.current.of(
            EditorView.editable.of(!initialReadOnlyRef.current),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              onCursorChangeRef.current?.(update.state.selection.main.head);
            }
          }),
        ],
      });

      const view = new EditorView({ state, parent: hostRef.current });
      viewRef.current = view;
      onCursorChangeRef.current?.(view.state.selection.main.head);
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }, [value]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: editableCompartmentRef.current.reconfigure(
          EditorView.editable.of(!readOnly),
        ),
      });
    }, [readOnly]);

    useImperativeHandle(forwardedRef, () => ({
      insertText(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const range = view.state.selection.main;
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: { anchor: range.from + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      replaceRange(from: number, to: number, text: string) {
        const view = viewRef.current;
        if (!view) return;
        const docLength = view.state.doc.length;
        const safeFrom = Math.min(Math.max(from, 0), docLength);
        const safeTo = Math.min(Math.max(to, safeFrom), docLength);
        view.dispatch({
          changes: { from: safeFrom, to: safeTo, insert: text },
          selection: { anchor: safeFrom + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
      goTo(line: number, column: number) {
        const view = viewRef.current;
        if (!view) return;
        const safeLine = Math.min(Math.max(line, 1), view.state.doc.lines);
        const lineInfo = view.state.doc.line(safeLine);
        const anchor = Math.min(
          lineInfo.to,
          lineInfo.from + Math.max(column - 1, 0),
        );
        view.dispatch({
          selection: { anchor },
          scrollIntoView: true,
        });
        view.focus();
      },
      updateQuestionMetadata(updates) {
        const view = viewRef.current;
        if (!view) return false;
        const result = updateQuestionMetadataAtPosition(
          view.state.doc.toString(),
          view.state.selection.main.head,
          updates,
        );
        if (!result) return false;
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: result.source,
          },
          selection: { anchor: result.position },
          scrollIntoView: true,
        });
        view.focus();
        return true;
      },
    }));

    return <div ref={hostRef} style={{ height: '100%' }} />;
  },
);

export default LatexEditor;
