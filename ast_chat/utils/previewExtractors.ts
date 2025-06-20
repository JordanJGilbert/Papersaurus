interface ToolCallData {
  call_id: string;
  name: string;
  arguments: string;
  result?: string;
  status?: "Pending..." | "Completed" | "Error" | "Streaming...";
  is_error?: boolean;
  is_partial?: boolean;
}

export interface ExtractedPreview {
  id: string;
  type: 'web_app' | 'code' | 'diff' | 'file_content';
  data: any;
  shouldShow: boolean;
}

// Extract web app preview data from create_web_app or edit_web_app tool calls
export const extractWebAppPreview = (toolCall: ToolCallData): ExtractedPreview | null => {
  if (!['create_web_app', 'edit_web_app'].includes(toolCall.name)) {
    return null;
  }

  if (!toolCall.result || toolCall.is_error || toolCall.is_partial) {
    return null;
  }

  try {
    const result = JSON.parse(toolCall.result);
    
    if (result.status === 'success' && result.url) {
      // Extract app name from arguments
      let appName = 'Web Application';
      try {
        const args = JSON.parse(toolCall.arguments);
        appName = args.app_name || appName;
      } catch (e) {
        console.warn('Failed to parse tool arguments for app name:', e);
      }

      // Use app name as the unique ID for persistence
      const id = appName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

      // Check if this is an edit with diff data
      if (toolCall.name === 'edit_web_app' && result.original_html && result.modified_html) {
        return {
          id: `${id}_diff`,
          type: 'diff',
          data: {
            original: result.original_html,
            modified: result.modified_html,
            filename: `${appName}.html`,
            language: 'html',
            url: result.url,
            appName,
            status: result.status,
            message: result.message,
            backup_created: result.backup_created,
          },
          shouldShow: true,
        };
      }

      // Regular web app preview (create or edit without diff data)
      return {
        id,
        type: 'web_app',
        data: {
          url: result.url,
          appName,
          status: result.status,
          message: result.message,
          backup_created: result.backup_created,
          htmlContent: result.html_content,
        },
        shouldShow: true,
      };
    }
  } catch (e) {
    console.warn('Failed to parse web app tool result:', e);
  }

  return null;
};

// Extract code diff preview from edit_mcp_server tool calls
export const extractCodeDiffPreview = (toolCall: ToolCallData): ExtractedPreview | null => {
  if (toolCall.name !== 'edit_mcp_server') {
    return null;
  }

  if (!toolCall.result || toolCall.is_error || toolCall.is_partial) {
    return null;
  }

  try {
    const result = JSON.parse(toolCall.result);
    
    if (result.original_code && result.modified_code) {
      const serverName = result.server_name || 'unknown_server';
      const id = `mcp_server_${serverName}`;

      return {
        id,
        type: 'diff',
        data: {
          original: result.original_code,
          modified: result.modified_code,
          filename: `${serverName}.py`,
          language: 'python',
          serverName,
          status: result.status,
          message: result.message,
          changesApplied: result.changes_applied,
          reloadResult: result.reload_result,
        },
        shouldShow: true,
      };
    }
  } catch (e) {
    console.warn('Failed to parse edit_mcp_server tool result:', e);
  }

  return null;
};

// NEW: Extract file content preview from read_file_content tool calls
export const extractFileContentPreview = (toolCall: ToolCallData): ExtractedPreview | null => {
  if (toolCall.name !== 'read_file_content') {
    return null;
  }

  if (!toolCall.result || toolCall.is_error || toolCall.is_partial) {
    return null;
  }

  try {
    const result = JSON.parse(toolCall.result);
    
    if (result.status === 'success' && result.content) {
      // Extract file path from arguments
      let filePath = 'unknown_file';
      try {
        const args = JSON.parse(toolCall.arguments);
        filePath = args.file_path || filePath;
      } catch (e) {
        console.warn('Failed to parse tool arguments for file path:', e);
      }

      // Use file path as the unique ID for persistence
      const id = `file_${filePath.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      return {
        id,
        type: 'file_content',
        data: {
          content: result.content,
          filename: filePath.split('/').pop() || filePath, // Get just the filename
          fullPath: filePath,
          fileSize: result.size,
          lines: result.lines,
          encoding: result.encoding || 'utf-8',
          absolutePath: result.absolute_path,
        },
        shouldShow: true,
      };
    }
  } catch (e) {
    console.warn('Failed to parse read_file_content tool result:', e);
  }

  return null;
};

// Extract code preview from other code-related tool calls
export const extractCodePreview = (toolCall: ToolCallData): ExtractedPreview | null => {
  // Add more code extraction logic here for other tools that generate code
  // For now, this is a placeholder for future expansion
  
  return null;
};

// Main function to extract any preview from a tool call
export const extractPreviewFromToolCall = (toolCall: ToolCallData): ExtractedPreview | null => {
  // Try each extractor in order
  const extractors = [
    extractWebAppPreview,
    extractCodeDiffPreview,
    extractFileContentPreview, // NEW: Add file content extractor
    extractCodePreview,
  ];

  for (const extractor of extractors) {
    const preview = extractor(toolCall);
    if (preview) {
      return preview;
    }
  }

  return null;
};

// Helper to determine if a tool call should trigger preview extraction
export const shouldExtractPreview = (toolCall: ToolCallData): boolean => {
  const previewToolNames = [
    'create_web_app',
    'edit_web_app', 
    'edit_mcp_server',
    'read_file_content', // NEW: Add read_file_content to preview tools
    // Add more tool names here as we support them
  ];

  const isValidTool = previewToolNames.includes(toolCall.name);
  const hasNoErrors = !toolCall.is_error;
  const isNotPartial = !toolCall.is_partial;
  const hasValidStatus = toolCall.status === 'Completed';
  
  console.log(`[shouldExtractPreview] Tool: ${toolCall.name}, Valid: ${isValidTool}, No errors: ${hasNoErrors}, Not partial: ${isNotPartial}, Valid status: ${hasValidStatus} (actual: ${toolCall.status})`);

  return isValidTool && hasNoErrors && isNotPartial && hasValidStatus;
}; 