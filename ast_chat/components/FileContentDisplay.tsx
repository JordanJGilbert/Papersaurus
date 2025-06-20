import React, { useState, useEffect } from 'react';
import { FileText, Code2, Copy, Check, Download, Eye, BookOpen } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from "next-themes";

interface FileContentDisplayProps {
  content: string;
  filename?: string;
  fileSize?: number;
  lines?: number;
  encoding?: string;
  className?: string;
}

const FileContentDisplay: React.FC<FileContentDisplayProps> = ({
  content,
  filename = 'untitled',
  fileSize,
  lines,
  encoding = 'utf-8',
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  // Determine file type from extension
  const getFileType = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    
    const typeMap: Record<string, { type: string; language: string; icon: React.ReactNode }> = {
      // Programming languages
      'js': { type: 'code', language: 'javascript', icon: <Code2 className="w-4 h-4" /> },
      'jsx': { type: 'code', language: 'jsx', icon: <Code2 className="w-4 h-4" /> },
      'ts': { type: 'code', language: 'typescript', icon: <Code2 className="w-4 h-4" /> },
      'tsx': { type: 'code', language: 'tsx', icon: <Code2 className="w-4 h-4" /> },
      'py': { type: 'code', language: 'python', icon: <Code2 className="w-4 h-4" /> },
      'java': { type: 'code', language: 'java', icon: <Code2 className="w-4 h-4" /> },
      'cpp': { type: 'code', language: 'cpp', icon: <Code2 className="w-4 h-4" /> },
      'c': { type: 'code', language: 'c', icon: <Code2 className="w-4 h-4" /> },
      'cs': { type: 'code', language: 'csharp', icon: <Code2 className="w-4 h-4" /> },
      'php': { type: 'code', language: 'php', icon: <Code2 className="w-4 h-4" /> },
      'rb': { type: 'code', language: 'ruby', icon: <Code2 className="w-4 h-4" /> },
      'go': { type: 'code', language: 'go', icon: <Code2 className="w-4 h-4" /> },
      'rs': { type: 'code', language: 'rust', icon: <Code2 className="w-4 h-4" /> },
      'swift': { type: 'code', language: 'swift', icon: <Code2 className="w-4 h-4" /> },
      'kt': { type: 'code', language: 'kotlin', icon: <Code2 className="w-4 h-4" /> },
      
      // Web technologies
      'html': { type: 'code', language: 'markup', icon: <Code2 className="w-4 h-4" /> },
      'htm': { type: 'code', language: 'markup', icon: <Code2 className="w-4 h-4" /> },
      'css': { type: 'code', language: 'css', icon: <Code2 className="w-4 h-4" /> },
      'scss': { type: 'code', language: 'scss', icon: <Code2 className="w-4 h-4" /> },
      'sass': { type: 'code', language: 'sass', icon: <Code2 className="w-4 h-4" /> },
      'less': { type: 'code', language: 'less', icon: <Code2 className="w-4 h-4" /> },
      
      // Data formats
      'json': { type: 'code', language: 'json', icon: <Code2 className="w-4 h-4" /> },
      'xml': { type: 'code', language: 'xml', icon: <Code2 className="w-4 h-4" /> },
      'yaml': { type: 'code', language: 'yaml', icon: <Code2 className="w-4 h-4" /> },
      'yml': { type: 'code', language: 'yaml', icon: <Code2 className="w-4 h-4" /> },
      'toml': { type: 'code', language: 'toml', icon: <Code2 className="w-4 h-4" /> },
      'csv': { type: 'table', language: 'csv', icon: <FileText className="w-4 h-4" /> },
      
      // Shell and config
      'sh': { type: 'code', language: 'bash', icon: <Code2 className="w-4 h-4" /> },
      'bash': { type: 'code', language: 'bash', icon: <Code2 className="w-4 h-4" /> },
      'zsh': { type: 'code', language: 'bash', icon: <Code2 className="w-4 h-4" /> },
      'fish': { type: 'code', language: 'bash', icon: <Code2 className="w-4 h-4" /> },
      'ps1': { type: 'code', language: 'powershell', icon: <Code2 className="w-4 h-4" /> },
      'bat': { type: 'code', language: 'batch', icon: <Code2 className="w-4 h-4" /> },
      'cmd': { type: 'code', language: 'batch', icon: <Code2 className="w-4 h-4" /> },
      
      // Markup and documentation
      'md': { type: 'markdown', language: 'markdown', icon: <BookOpen className="w-4 h-4" /> },
      'markdown': { type: 'markdown', language: 'markdown', icon: <BookOpen className="w-4 h-4" /> },
      'txt': { type: 'text', language: 'text', icon: <FileText className="w-4 h-4" /> },
      'log': { type: 'text', language: 'log', icon: <FileText className="w-4 h-4" /> },
      
      // SQL
      'sql': { type: 'code', language: 'sql', icon: <Code2 className="w-4 h-4" /> },
      
      // Other formats
      'dockerfile': { type: 'code', language: 'docker', icon: <Code2 className="w-4 h-4" /> },
      'gitignore': { type: 'text', language: 'gitignore', icon: <FileText className="w-4 h-4" /> },
      'env': { type: 'text', language: 'properties', icon: <FileText className="w-4 h-4" /> },
    };

    return typeMap[ext] || { type: 'text', language: 'text', icon: <FileText className="w-4 h-4" /> };
  };

  const fileInfo = getFileType(filename);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMarkdown = (text: string) => {
    const html = marked.parse(text, { gfm: true, breaks: true }) as string;
    return DOMPurify.sanitize(html);
  };

  const renderTable = (csvContent: string) => {
    const lines = csvContent.trim().split('\n');
    if (lines.length === 0) return <div>Empty CSV file</div>;

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => 
      line.split(',').map(cell => cell.trim().replace(/"/g, ''))
    );

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              {headers.map((header, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-background divide-y divide-border">
            {rows.slice(0, 100).map((row, i) => ( // Limit to 100 rows for performance
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap text-sm text-muted-foreground">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 100 && (
          <div className="p-3 text-center text-sm text-muted-foreground bg-muted/50">
            Showing first 100 rows of {rows.length} total rows
          </div>
        )}
      </div>
    );
  };

  const renderFormattedContent = () => {
    switch (fileInfo.type) {
      case 'markdown':
        return (
          <div 
            className="prose dark:prose-invert max-w-none p-4"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        );
      
      case 'table':
        return (
          <div className="p-4">
            {renderTable(content)}
          </div>
        );
      
      case 'code':
        return (
          <div className="relative">
            <SyntaxHighlighter
              language={fileInfo.language}
              style={theme === 'dark' ? oneDark : oneLight}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                background: 'transparent',
                fontSize: '0.875rem',
                lineHeight: '1.5',
              }}
              showLineNumbers={Boolean(lines && lines > 10)}
              wrapLines={true}
              wrapLongLines={true}
            >
              {content}
            </SyntaxHighlighter>
          </div>
        );
      
      default:
        return (
          <div className="p-4">
            <pre className="whitespace-pre-wrap text-sm font-mono text-foreground overflow-x-auto">
              {content}
            </pre>
          </div>
        );
    }
  };

  const renderRawContent = () => (
    <div className="relative">
      <pre className="p-4 overflow-x-auto text-sm bg-muted/30 font-mono whitespace-pre-wrap">
        <code>{content}</code>
      </pre>
    </div>
  );

  const shouldShowTabs = fileInfo.type === 'markdown' || fileInfo.type === 'table' || fileInfo.type === 'code';

  return (
    <div className={`mt-4 border rounded-lg shadow-md bg-muted/40 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-background border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {fileInfo.icon}
            <span className="text-sm font-semibold text-foreground truncate">{filename}</span>
          </div>
          
          {/* File info badges */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {fileSize && (
              <span className="px-2 py-1 bg-muted rounded-md whitespace-nowrap">
                {formatFileSize(fileSize)}
              </span>
            )}
            {lines && (
              <span className="px-2 py-1 bg-muted rounded-md whitespace-nowrap">
                {lines} lines
              </span>
            )}
            <span className="px-2 py-1 bg-muted rounded-md whitespace-nowrap">
              {encoding}
            </span>
            <span className="px-2 py-1 bg-muted rounded-md whitespace-nowrap">
              {fileInfo.language}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab buttons */}
          {shouldShowTabs && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('formatted')}
                className={`inline-flex items-center px-2 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'formatted'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Eye className="w-3 h-3 mr-1" />
                Formatted
              </button>
              <button
                onClick={() => setActiveTab('raw')}
                className={`inline-flex items-center px-2 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'raw'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Code2 className="w-3 h-3 mr-1" />
                Raw
              </button>
            </div>
          )}

          <button
            onClick={handleCopy}
            className="inline-flex items-center px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          
          <button
            onClick={handleDownload}
            className="inline-flex items-center px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
          >
            <Download className="w-3 h-3 mr-1" />
            Download
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-background">
        {shouldShowTabs && activeTab === 'formatted' ? renderFormattedContent() : renderRawContent()}
      </div>
    </div>
  );
};

export default FileContentDisplay; 