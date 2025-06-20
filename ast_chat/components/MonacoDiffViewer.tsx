import React, { useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { useTheme } from "next-themes";

interface MonacoDiffViewerProps {
  original: string;
  modified: string;
  language?: string;
  filename?: string;
  height?: string;
  className?: string;
}

const MonacoDiffViewer: React.FC<MonacoDiffViewerProps> = ({
  original,
  modified,
  language = 'python',
  filename = 'file.py',
  height = '400px',
  className = ''
}) => {
  const { theme } = useTheme();
  const editorRef = useRef<any>(null);

  // Monaco editor options
  const options = {
    readOnly: true,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderSideBySide: true,
    renderOverviewRuler: false,
    enableSplitViewResizing: true,
    fontFamily: 'JetBrains Mono, Fira Code, Consolas, Monaco, monospace',
    fontSize: 13,
    lineHeight: 18,
    wordWrap: 'on' as const,
    scrollbar: {
      vertical: 'auto' as const,
      horizontal: 'auto' as const,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    diffWordWrap: 'on' as const,
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    originalEditable: false,
    modifiedEditable: false,
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    
    // Optionally focus on first diff
    setTimeout(() => {
      try {
        const diffNavigator = editor.getLineChanges();
        if (diffNavigator && diffNavigator.length > 0) {
          // Go to first change
          editor.revealLineInCenter(diffNavigator[0].modifiedStartLineNumber || 1);
        }
      } catch (error) {
        console.warn('Could not navigate to first diff:', error);
      }
    }, 100);
  };

  return (
    <div className={`monaco-diff-container border rounded-md overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-muted px-3 py-2 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">{filename}</h4>
          <span className="text-xs text-muted-foreground">
            (Before vs After)
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            Removed
          </span>
          <span className="inline-flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            Added
          </span>
        </div>
      </div>
      
      {/* Diff Editor */}
      <div style={{ height }}>
        <DiffEditor
          original={original}
          modified={modified}
          language={language}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={options}
          onMount={handleEditorDidMount}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading diff viewer...</div>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default MonacoDiffViewer; 