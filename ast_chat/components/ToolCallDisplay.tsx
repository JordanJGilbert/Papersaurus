import React, { useState } from 'react';
import { CheckCircle, XCircle, Loader2, ChevronDown, Code2, FileText } from 'lucide-react';
import MonacoDiffViewer from './MonacoDiffViewer';

// Assuming ToolCallData is defined in page.tsx and imported or duplicated here
interface ToolCallData {
  call_id: string;
  name: string;
  arguments: string; // This is a JSON string
  result?: string;    // This can be a JSON string or plain text
  status?: "Pending..." | "Completed" | "Error" | "Streaming...";
  is_error?: boolean;
  is_partial?: boolean;
  // sampleStreamOutput?: string; // REMOVED
  // sampleThoughtOutput?: string; // REMOVED
  sampleCallPairs?: Array<{ id: string; thoughts?: string; output?: string; }>; // ADDED
}

interface ToolCallDisplayProps {
  toolCall: ToolCallData;
  renderSanitizedMarkdown: (text: string) => string; 
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall, renderSanitizedMarkdown }) => {
  const [viewMode, setViewMode] = useState<'diff' | 'raw'>('diff');

  // Debug logging for sampling data
  console.log(`[ToolCallDisplay] Rendering tool: ${toolCall.name}, call_id: ${toolCall.call_id}`);
  console.log(`[ToolCallDisplay] sampleCallPairs:`, toolCall.sampleCallPairs);
  console.log(`[ToolCallDisplay] sampleCallPairs length:`, toolCall.sampleCallPairs?.length || 0);
  
  // Parse the result for edit_mcp_server tools
  const getEditServerData = () => {
    if (toolCall.name !== 'edit_mcp_server' || !toolCall.result) return null;
    
    try {
      const result = JSON.parse(toolCall.result);
      if (result.original_code && result.modified_code) {
        return {
          original: result.original_code,
          modified: result.modified_code,
          serverName: result.server_name || 'unknown_server',
          changesApplied: result.changes_applied || 0,
          status: result.status,
          message: result.message,
          reloadResult: result.reload_result
        };
      }
    } catch (e) {
      console.warn('Failed to parse edit_mcp_server result:', e);
    }
    return null;
  };

  const editData = getEditServerData();
  const isEditTool = toolCall.name === 'edit_mcp_server';
  
  const getStatusIcon = () => {
    if (toolCall.status === "Completed" && !toolCall.is_error) return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (toolCall.is_error) return <XCircle className="w-4 h-4 text-red-500" />;
    if (toolCall.status === "Pending..." || toolCall.status === "Streaming...") return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    return null;
  };

  return (
    <details 
      key={toolCall.call_id} 
      className="tool-call-display my-2 rounded-lg border border-border bg-muted/20 shadow-sm" 
      open={false}
    >
      <summary className="tool-call-summary cursor-pointer p-3 list-none flex items-center justify-between text-sm font-medium text-foreground hover:bg-muted/40 rounded-t-lg">
        <div className="flex items-center">
          {getStatusIcon()}
          <span className="ml-2 font-mono text-xs sm:text-sm">Tool: {toolCall.name}</span>
          {toolCall.status === "Streaming..." && <span className='ml-2 text-xs italic text-muted-foreground'>streaming result...</span>}
        </div>
        <ChevronDown className="w-5 h-5 transition-transform duration-200 details-arrow" />
      </summary>
      <div className="tool-call-content p-3 border-t border-border bg-background rounded-b-lg space-y-2">
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Arguments:</h4>
          <pre className="w-full max-w-full p-2 border rounded-md bg-muted/30 text-xs overflow-x-auto overflow-y-auto max-h-40 min-w-0" style={{ 
            wordBreak: 'break-all', 
            whiteSpace: 'pre-wrap', 
            overflowWrap: 'anywhere',
            hyphens: 'auto'
          }}>
            {toolCall.arguments}
          </pre>
        </div>

        {toolCall.result && (
          <div>
            {/* Special handling for edit_mcp_server tools */}
            {isEditTool && editData ? (
              <div className="space-y-3">
                {/* Status Summary */}
                <div className="bg-muted/40 rounded-lg p-3 border">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-foreground">Server Edit Summary</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewMode('diff')}
                        className={`inline-flex items-center px-2 py-1 text-xs rounded-md transition-colors ${
                          viewMode === 'diff' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <Code2 className="w-3 h-3 mr-1" />
                        Diff View
                      </button>
                      <button
                        onClick={() => setViewMode('raw')}
                        className={`inline-flex items-center px-2 py-1 text-xs rounded-md transition-colors ${
                          viewMode === 'raw' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Raw Output
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-medium text-muted-foreground">Server:</span>
                      <span className="ml-1 font-mono">{editData.serverName}.py</span>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Status:</span>
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                        editData.status === 'success' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : editData.status === 'error'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                      }`}>
                        {editData.status}
                      </span>
                    </div>
                  </div>
                  
                  {editData.message && (
                    <p className="text-xs text-muted-foreground mt-2">{editData.message}</p>
                  )}
                  
                  {editData.reloadResult && (
                    <div className="mt-2 p-2 bg-background rounded border text-xs">
                      <span className="font-medium">Reload Status:</span>
                      <span className={`ml-1 ${
                        editData.reloadResult.status === 'success' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {editData.reloadResult.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* Code Diff or Raw View */}
                {viewMode === 'diff' ? (
                  <MonacoDiffViewer
                    original={editData.original}
                    modified={editData.modified}
                    language="python"
                    filename={`${editData.serverName}.py`}
                    height="500px"
                    className="w-full"
                  />
                ) : (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                      Raw Result ({toolCall.status === "Streaming..." && !toolCall.is_error ? "Streaming..." : toolCall.status}):
                    </h4>
                    <div
                      className={`w-full max-w-full p-2 border rounded-md overflow-x-auto overflow-y-auto max-h-60 text-xs min-w-0 ${
                        toolCall.is_error ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                          : 'border-border bg-muted/30'
                      }`}
                      style={{ 
                        wordBreak: 'break-all', 
                        overflowWrap: 'anywhere',
                        hyphens: 'auto'
                      }}
                      dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(toolCall.result) }}
                    />
                  </div>
                )}
              </div>
            ) : (
              /* Default result display for other tools */
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Result ({toolCall.status === "Streaming..." && !toolCall.is_error ? "Streaming..." : toolCall.status}):
                </h4>
                <div
                  className={`w-full max-w-full p-2 border rounded-md overflow-x-auto overflow-y-auto max-h-60 text-xs min-w-0 ${
                    toolCall.is_error ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                      : 'border-border bg-muted/30'
                  }`}
                  style={{ 
                    wordBreak: 'break-all', 
                    overflowWrap: 'anywhere',
                    hyphens: 'auto'
                  }}
                  dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(toolCall.result) }}
                />
              </div>
            )}
          </div>
        )}

        {/* NEW: Iterate over sampleCallPairs */}
        {toolCall.sampleCallPairs && toolCall.sampleCallPairs.length > 0 && (() => {
          console.log(`[ToolCallDisplay] About to render ${toolCall.sampleCallPairs.length} sampleCallPairs for ${toolCall.name}`);
          return toolCall.sampleCallPairs.map((pair, index) => (
            <React.Fragment key={`${pair.id || index}-${toolCall.call_id}-${index}`}>
              {pair.thoughts && (() => {
                console.log(`[ToolCallDisplay] Rendering thoughts for pair ${index + 1}:`, pair.thoughts.substring(0, 100));
                return (
                  <div className="mt-3 pt-3 border-t border-dashed border-border/50">
                    <h4 className="font-medium text-blue-500 dark:text-blue-400 text-xs mb-1">
                      ↳ LLM Sampling Thoughts (#{index + 1}):
                    </h4>
                    <pre className="mt-1 p-2 border rounded-md border-blue-500/30 bg-blue-500/5 whitespace-pre-wrap text-xs font-mono w-full max-w-full overflow-x-auto min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {pair.thoughts}
                    </pre>
                  </div>
                );
              })()}
              {pair.output && (() => {
                console.log(`[ToolCallDisplay] Rendering output for pair ${index + 1}:`, pair.output.substring(0, 100));
                return (
                  <div className="mt-3 pt-3 border-t border-dashed border-border/50">
                    <h4 className="font-medium text-green-600 dark:text-green-400 text-xs mb-1">
                      ↳ LLM Sampling Output (#{index + 1}):
                    </h4>
                    <pre className="mt-1 p-2 border rounded-md border-green-500/30 bg-green-500/5 whitespace-pre-wrap text-xs font-mono w-full max-w-full overflow-x-auto min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {pair.output}
                    </pre>
                  </div>
                );
              })()}
            </React.Fragment>
          ));
        })()}
        
        {/* UPDATED condition for "Awaiting first tool output..." */}
        {(toolCall.status === "Pending..." && !toolCall.result && (!toolCall.sampleCallPairs || toolCall.sampleCallPairs.length === 0)) && (
           <div className="flex items-center text-xs text-muted-foreground pt-2">
             <Loader2 className="w-3 h-3 mr-1 animate-spin" />
             Awaiting first tool output...
           </div>
        )}
      </div>
    </details>
  );
};

export default ToolCallDisplay; 