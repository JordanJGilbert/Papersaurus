import React from 'react';
import { Copy, Check } from 'lucide-react';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber?: number;
}

interface InlineDiffViewerProps {
  original: string;
  modified: string;
  filename?: string;
  language?: string;
  className?: string;
}

const InlineDiffViewer: React.FC<InlineDiffViewerProps> = ({
  original,
  modified,
  filename = 'file',
  language = 'text',
  className = ''
}) => {
  const [copied, setCopied] = React.useState(false);

  // Simple line-by-line diff algorithm
  const generateDiff = (originalText: string, modifiedText: string): DiffLine[] => {
    const originalLines = originalText.split('\n');
    const modifiedLines = modifiedText.split('\n');
    const diff: DiffLine[] = [];

    // Simple implementation - can be enhanced with proper diff algorithm
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    
    let originalIndex = 0;
    let modifiedIndex = 0;

    while (originalIndex < originalLines.length || modifiedIndex < modifiedLines.length) {
      const originalLine = originalLines[originalIndex];
      const modifiedLine = modifiedLines[modifiedIndex];

      if (originalIndex >= originalLines.length) {
        // Only modified lines left
        diff.push({
          type: 'added',
          content: modifiedLine,
          lineNumber: modifiedIndex + 1
        });
        modifiedIndex++;
      } else if (modifiedIndex >= modifiedLines.length) {
        // Only original lines left
        diff.push({
          type: 'removed',
          content: originalLine,
          lineNumber: originalIndex + 1
        });
        originalIndex++;
      } else if (originalLine === modifiedLine) {
        // Lines are the same
        diff.push({
          type: 'unchanged',
          content: originalLine,
          lineNumber: originalIndex + 1
        });
        originalIndex++;
        modifiedIndex++;
      } else {
        // Lines are different - mark as removed and added
        diff.push({
          type: 'removed',
          content: originalLine,
          lineNumber: originalIndex + 1
        });
        diff.push({
          type: 'added',
          content: modifiedLine,
          lineNumber: modifiedIndex + 1
        });
        originalIndex++;
        modifiedIndex++;
      }
    }

    return diff;
  };

  const handleCopy = async () => {
    try {
      const diffText = diffLines.map(line => {
        const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
        return `${prefix} ${line.content}`;
      }).join('\n');
      
      await navigator.clipboard.writeText(diffText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy diff:', err);
    }
  };

  const diffLines = generateDiff(original, modified);

  const getLineClassName = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500';
      case 'removed':
        return 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500';
      default:
        return 'bg-background';
    }
  };

  const getTextClassName = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'text-green-800 dark:text-green-200';
      case 'removed':
        return 'text-red-800 dark:text-red-200';
      default:
        return 'text-foreground';
    }
  };

  const getPrefix = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return '+';
      case 'removed':
        return '-';
      default:
        return ' ';
    }
  };

  return (
    <div className={`bg-background border rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{filename}</span>
          <span className="text-xs text-muted-foreground">({language})</span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
          {copied ? 'Copied!' : 'Copy Diff'}
        </button>
      </div>

      {/* Diff Content */}
      <div className="overflow-x-auto">
        <div className="font-mono text-sm">
          {diffLines.map((line, index) => (
            <div
              key={index}
              className={`flex ${getLineClassName(line.type)}`}
            >
              {/* Line prefix */}
              <div className="flex-shrink-0 w-8 px-2 py-1 text-center text-xs text-muted-foreground bg-muted/20">
                {getPrefix(line.type)}
              </div>
              
              {/* Line content */}
              <div className={`flex-1 px-3 py-1 ${getTextClassName(line.type)}`}>
                <pre className="whitespace-pre-wrap break-words">{line.content || ' '}</pre>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
        {diffLines.filter(l => l.type === 'added').length} additions, {' '}
        {diffLines.filter(l => l.type === 'removed').length} deletions
      </div>
    </div>
  );
};

export default InlineDiffViewer; 