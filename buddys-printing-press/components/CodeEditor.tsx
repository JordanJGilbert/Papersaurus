"use client";

import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from "next-themes";

interface CodeEditorProps {
  value: string;
  language?: string;
  height?: string;
  readOnly?: boolean;
  minimap?: boolean;
  className?: string;
}

export default function CodeEditor({ 
  value, 
  language = "html", 
  height = "400px", 
  readOnly = true,
  minimap = false,
  className = ""
}: CodeEditorProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<string>(height);

  // Calculate height when container size changes
  useEffect(() => {
    if (height === "100%" && containerRef.current) {
      const updateHeight = () => {
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          if (rect.height > 0) {
            setContainerHeight(`${rect.height}px`);
          }
        }
      };

      // Initial calculation
      updateHeight();

      // Set up ResizeObserver to watch for container size changes
      const resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    } else {
      setContainerHeight(height);
    }
  }, [height]);

  return (
    <div 
      ref={containerRef}
      className={`overflow-hidden ${className}`}
      style={{ height: height === "100%" ? "100%" : height }}
    >
      <Editor
        height={containerHeight}
        language={language}
        value={value}
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          readOnly,
          minimap: { enabled: minimap },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          fontSize: 13,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          folding: true,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 3,
          glyphMargin: false,
          contextmenu: false,
          selectOnLineNumbers: true,
          roundedSelection: false,
          cursorStyle: 'line',
          smoothScrolling: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-background">
            <div className="text-muted-foreground">Loading editor...</div>
          </div>
        }
      />
    </div>
  );
} 