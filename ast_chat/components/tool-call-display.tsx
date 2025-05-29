"use client";

import React, { useState } from 'react';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { prism as prismSyntaxStyle, vscDarkPlus as vscDarkPlusSyntaxStyle } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import { Loader2, ChevronDown } from 'lucide-react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

// Register languages you expect to use
// Using PrismAsyncLight, so we need to register languages
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';

SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('typescript', typescript);

// Define base background colors for consistency
const lightThemeBg = '#f5f2f0'; // Typical prism light background
const darkThemeBg = '#1e1e1e';   // Typical vscDarkPlus background

// Custom styles for ReactDiffViewer to match SyntaxHighlighter themes
const diffViewerLightStyles = {
  variables: {
    light: {
      diffViewerBackground: lightThemeBg,
      gutterBackground: lightThemeBg, 
      addedBackground: 'rgba(200, 255, 200, 0.3)', // Even more transparent
      removedBackground: 'rgba(255, 200, 200, 0.3)', // Even more transparent
      wordAddedBackground: 'rgba(180, 230, 180, 0.5)', 
      wordRemovedBackground: 'rgba(230, 180, 180, 0.5)', 
      diffViewerColor: '#212529', 
      gutterColor: '#999DA8' // Further Softer gutter text color
    },
  },
  line: {
    padding: '0 0.2em', // Minimal vertical, reduced horizontal padding
    fontSize: '0.78em', // Further reduced font size
  },
  content: {
    padding: '0', 
    width: '100%',
  },
   marker: { 
    padding: '0 2px', // Minimal padding around markers
    fontSize: '0.78em', // Match line font size
  },
  codeFold: {
    fontSize: '0.78em', 
    padding: '0 0.2em',
    backgroundColor: lightThemeBg,
  },
  gutter: { 
    padding: '0 0.2em',
    minWidth: '35px', // Further reduce gutter width
    borderRight: '1px solid #e1e4e8', // GitHub-like light border
  },
  emptyGutter: {
    backgroundColor: lightThemeBg,
  }
};

const diffViewerDarkStyles = {
  variables: {
    dark: {
      diffViewerBackground: darkThemeBg,
      gutterBackground: darkThemeBg, 
      addedBackground: 'rgba(10, 35, 20, 0.4)', // Even Darker, more transparent green
      removedBackground: 'rgba(45, 15, 20, 0.4)', // Even Darker, more transparent red
      wordAddedBackground: 'rgba(15, 55, 35, 0.6)',
      wordRemovedBackground: 'rgba(70, 30, 35, 0.6)',
      diffViewerColor: '#c9d1d9', 
      addedColor: '#c9d1d9', 
      removedColor: '#c9d1d9', 
      gutterColor: '#586069' // GitHub-like dark gutter text color
    },
  },
  line: {
    padding: '0 0.2em', 
    fontSize: '0.78em',
  },
  content: {
    padding: '0',
    width: '100%',
  },
  marker: {
    padding: '0 2px',
    fontSize: '0.78em',
  },
  codeFold: {
    fontSize: '0.78em',
    padding: '0 0.2em',
    backgroundColor: darkThemeBg,
  },
  gutter: {
    padding: '0 0.2em',
    minWidth: '35px',
    borderRight: '1px solid #30363d', // GitHub-like dark border
  },
  emptyGutter: {
    backgroundColor: darkThemeBg,
  }
};

interface ToolCallData {
  call_id: string;
  name: string;
  arguments: string; // This is a JSON string
  result?: string;    // This can be a JSON string or plain text
  status?: "Pending..." | "Completed" | "Error" | "Streaming...";
  is_error?: boolean;
  is_partial?: boolean;
}

interface ToolCallDisplayProps {
  toolCall: ToolCallData;
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall }) => {
  const { theme } = useTheme();
  const syntaxTheme = theme === 'dark' ? vscDarkPlusSyntaxStyle : prismSyntaxStyle;
  const diffViewerStylesToApply = theme === 'dark' ? diffViewerDarkStyles : diffViewerLightStyles;

  // State for toggling diff view mode for edit_python_code results
  const [editViewMode, setEditViewMode] = useState<'diff' | 'original' | 'edited'>('diff');

  const renderContent = (content: string, language: string, usePrettyJson = false, isDiff = false) => {
    let displayContent = content;
    if (usePrettyJson && language === 'json') { // Only pretty print if explicitly JSON
      try {
        const parsed = JSON.parse(content);
        displayContent = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // Not valid JSON, or already formatted, display as is
      }
    }
    return (
      <SyntaxHighlighter
        language={language}
        style={syntaxTheme}
        PreTag="div"
        className={`text-xs rounded-md max-w-full overflow-x-auto ${
          isDiff ? 'diff-highlight' : ''
        }`}
        customStyle={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          overflowWrap: 'break-word',
          maxHeight: '400px',
          overflowY: 'auto'
        }}
        // Conditionally apply lineProps for diff highlighting
        lineProps={isDiff ? (lineNumber) => {
          const lineContent = displayContent.split('\n')[lineNumber -1];
          if (lineContent?.startsWith('+')) {
            return { style: { backgroundColor: 'rgba(0, 255, 0, 0.1)', display: 'block' } };
          }
          if (lineContent?.startsWith('-')) {
            return { style: { backgroundColor: 'rgba(255, 0, 0, 0.1)', display: 'block' } };
          }
          return {style: {display: 'block'}};
        } : undefined}
      >
        {displayContent}
      </SyntaxHighlighter>
    );
  };

  let parsedResult: any = null;
  let resultIsJson = false;
  if (toolCall.result) {
    try {
      parsedResult = JSON.parse(toolCall.result);
      resultIsJson = true;
    } catch (e) {
      parsedResult = toolCall.result; // Keep as string if not JSON
      resultIsJson = false;
    }
  }

  // Determine if this is a known code-execution/generation tool
  const isCodeTool = ['execute_python_code', 'create_python_code', 'edit_python_code'].includes(toolCall.name);

  // --- Diff generation for edit_python_code ---
  let originalCodeForDiff: string | null = null;
  let editedCodeForDiff: string | null = null;
  let isIdentical = false;
  let showAsDiffViewOptions = false; // New flag to control rendering of switcher + diff/code

  if (toolCall.name === 'edit_python_code' && resultIsJson && parsedResult.edit_python_code_response) {
    originalCodeForDiff = parsedResult.edit_python_code_response.original_code;
    editedCodeForDiff = parsedResult.edit_python_code_response.edited_code;
    if (typeof originalCodeForDiff === 'string' && typeof editedCodeForDiff === 'string') {
      showAsDiffViewOptions = true;
      isIdentical = originalCodeForDiff === editedCodeForDiff;
    }
  }
  // --- End Diff setup ---

  return (
    <details className="tool-call-display my-2 rounded-lg border border-border bg-muted/20 shadow-sm">
      <summary className="cursor-pointer p-3 list-none flex items-center justify-between text-sm font-medium text-muted-foreground hover:bg-muted/40 rounded-t-lg">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-foreground">
            Tool: <span className="font-mono bg-muted px-2 py-1 rounded text-primary">{toolCall.name}</span>
          </span>
          {toolCall.status && (
            <span 
              className={`font-semibold text-xs ${
                toolCall.status === "Error" ? "text-destructive" : 
                toolCall.status === "Completed" ? "text-green-600 dark:text-green-500" :
                toolCall.status === "Pending..." || toolCall.status === "Streaming..." ? "text-blue-600 dark:text-blue-500" :
                "text-foreground"
              }`}
            >
              {toolCall.status === "Pending..." || toolCall.status === "Streaming..." ? (
                <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
              ) : null}
              {toolCall.status}
              {toolCall.is_error && <span className="text-destructive ml-1">(Error)</span>}
              {toolCall.is_partial && toolCall.status === "Streaming..." && <span className="text-blue-500 ml-1">(Partial)</span>}
            </span>
          )}
        </div>
        <ChevronDown className="w-5 h-5 transition-transform duration-200 details-arrow" />
      </summary>
      
      <div className="p-3 border-t border-border bg-background rounded-b-lg text-xs">
        <div className="mb-2">
          <span className="font-medium text-muted-foreground">Arguments:</span>
          {renderContent(toolCall.arguments, 'json', true)}
        </div>

        {toolCall.result !== undefined && toolCall.result !== null && (
          <div>
            <span className="font-medium text-muted-foreground">Result:</span>
            
            {/* View switcher for edit_python_code */} 
            {showAsDiffViewOptions && (
              <div className="my-2 flex space-x-2 border-b border-border pb-2 mb-2">
                <button 
                  onClick={() => setEditViewMode('diff')} 
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${editViewMode === 'diff' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                >
                  Diff
                </button>
                <button 
                  onClick={() => setEditViewMode('original')} 
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${editViewMode === 'original' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                >
                  Original
                </button>
                <button 
                  onClick={() => setEditViewMode('edited')} 
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${editViewMode === 'edited' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                >
                  Edited
                </button>
              </div>
            )}

            {/* Conditional rendering based on view mode for edit_python_code */} 
            {showAsDiffViewOptions && originalCodeForDiff !== null && editedCodeForDiff !== null ? (
              <div className="code-diff-container text-sm"> 
                {isIdentical ? (
                  <>
                    <p className="text-muted-foreground italic my-1 text-xs">No changes detected.</p>
                    {/* Show edited code (which is same as original) with syntax highlighting */}
                    {renderContent(editedCodeForDiff, 'python', false)} 
                  </>
                ) : editViewMode === 'diff' ? (
                  <ReactDiffViewer
                    oldValue={originalCodeForDiff}
                    newValue={editedCodeForDiff}
                    splitView={false} 
                    useDarkTheme={theme === 'dark'}
                    compareMethod={DiffMethod.LINES} 
                    styles={diffViewerStylesToApply} 
                    codeFoldMessageRenderer={(totalFoldedLines: number) => (
                      <span style={{fontStyle: 'italic', color: 'grey', cursor: 'pointer'}}>
                        {`... ${totalFoldedLines} lines folded ...`}
                      </span>
                    )}
                    disableWordDiff={false} 
                    hideLineNumbers={false} 
                    renderContent={(source:string) => (
                       <SyntaxHighlighter 
                         style={syntaxTheme} 
                         language="python" 
                         PreTag="span" 
                         customStyle={{ 
                           background: 'transparent', 
                           padding: '0',
                           display: 'inline' 
                         }}
                        >
                         {source}
                       </SyntaxHighlighter>
                    )}
                  />
                ) : editViewMode === 'original' ? (
                  renderContent(originalCodeForDiff, 'python', false)
                ) : editViewMode === 'edited' ? (
                  renderContent(editedCodeForDiff, 'python', false)
                ) : null}
              </div>
            ) : isCodeTool && resultIsJson && typeof parsedResult === 'object' ? (
              (() => {
                const responseKey = `${toolCall.name}_response`;
                const actualToolResultObject = parsedResult[responseKey];

                if (actualToolResultObject && typeof actualToolResultObject === 'object') {
                  return (
                    <div className="space-y-2 mt-1">
                      {Object.entries(actualToolResultObject).map(([key, value]) => {
                        let lang = 'text';
                        // Ensure value is a string for rendering. If it's an object/array, stringify.
                        let content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
                        
                        if (key === 'generated_code' || key === 'edited_code') {
                          lang = 'python';
                        } else if (key === 'stdout' || key === 'stderr') {
                          lang = 'bash'; 
                        } else if (key === 'function_result' || key === 'message' || key === 'status') {
                          lang = 'text';
                        } else if (typeof value === 'object' || Array.isArray(value)) {
                          // This case handles if a value itself is an object/array (e.g. complex function_result)
                          // content is already stringified above if it wasn't a string.
                          lang = 'json';
                        }

                        return (
                          <div key={key} className="pl-2 border-l-2 border-muted-foreground/30">
                            <strong className="text-muted-foreground">{key}:</strong>
                            {content.trim() ? renderContent(content, lang) : <span className="text-muted-foreground italic ml-1">empty</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                } else {
                  // Fallback if the expected [toolName]_response structure is not found
                  return renderContent(JSON.stringify(parsedResult, null, 2), 'json');
                }
              })()
            ) : resultIsJson ? (
              renderContent(JSON.stringify(parsedResult, null, 2), 'json')
            ) : (
              renderContent(String(parsedResult), 'text') // Ensure it's a string for non-JSON results
            )}
          </div>
        )}
      </div>
    </details>
  );
};

export default ToolCallDisplay; 