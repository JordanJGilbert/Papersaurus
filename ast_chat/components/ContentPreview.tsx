import React, { useState, useEffect } from 'react';
import { ExternalLink, Code2, Eye, FileText, Download, Copy, Check } from 'lucide-react';
import MonacoDiffViewer from './MonacoDiffViewer';
import { useTheme } from "next-themes";

interface WebAppData {
  url: string;
  appName?: string;
  status: 'success' | 'error';
  message: string;
  backup_created?: string;
  htmlContent?: string; // Add HTML content for code view
}

interface CodeData {
  content: string;
  language?: string;
  filename?: string;
  original?: string; // For diffs
  modified?: string; // For diffs
  // Web app diff specific fields
  url?: string;
  appName?: string;
  status?: 'success' | 'error';
  message?: string;
  backup_created?: string;
}

interface ContentPreviewProps {
  // Unique identifier for this preview instance (e.g., app_name for web apps)
  id: string;
  
  // Content type and data
  type: 'web_app' | 'code' | 'diff';
  data: WebAppData | CodeData;
  
  // Tool call context for additional info
  toolCall?: {
    name: string;
    call_id: string;
    status?: string;
  };
  
  // Update callback for when content changes
  onUpdate?: (id: string, newData: any) => void;
}

const ContentPreview: React.FC<ContentPreviewProps> = ({ 
  id, 
  type, 
  data, 
  toolCall,
  onUpdate 
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'diff'>('preview');
  const [copied, setCopied] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const { theme } = useTheme();

  // Determine available tabs based on content type
  const availableTabs = React.useMemo(() => {
    const tabs: Array<{ key: 'preview' | 'code' | 'diff'; label: string; icon: React.ReactNode }> = [];
    
    if (type === 'web_app') {
      tabs.push({ key: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" /> });
      tabs.push({ key: 'code', label: 'Code', icon: <Code2 className="w-4 h-4" /> });
    } else if (type === 'code') {
      tabs.push({ key: 'code', label: 'Code', icon: <Code2 className="w-4 h-4" /> });
    } else if (type === 'diff') {
      const codeData = data as CodeData;
      // If it's a web app diff (has URL), show preview tab too
      if (codeData.url) {
        tabs.push({ key: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" /> });
      }
      tabs.push({ key: 'code', label: 'Code', icon: <Code2 className="w-4 h-4" /> });
      tabs.push({ key: 'diff', label: 'Diff', icon: <FileText className="w-4 h-4" /> });
    }
    
    return tabs;
  }, [type, data]);

  // Set default active tab based on available tabs
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find(tab => tab.key === activeTab)) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

  // Function to fetch HTML content for web apps
  const fetchHtmlContent = async (url: string) => {
    if (htmlContent || loadingHtml) return; // Don't fetch if already loaded or loading
    
    setLoadingHtml(true);
    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        setHtmlContent(html);
      } else {
        setHtmlContent('// Failed to fetch HTML content');
      }
    } catch (error) {
      console.error('Failed to fetch HTML:', error);
      setHtmlContent('// Error fetching HTML content');
    } finally {
      setLoadingHtml(false);
    }
  };

  // Fetch HTML when switching to code tab for web apps
  useEffect(() => {
    if (type === 'web_app' && activeTab === 'code' && !htmlContent && !loadingHtml) {
      const webAppData = data as WebAppData;
      if (webAppData.url) {
        fetchHtmlContent(webAppData.url);
      }
    }
  }, [activeTab, type, htmlContent, loadingHtml, data]);

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const renderWebAppPreview = (webAppData: WebAppData) => (
    <div className="bg-background">
      <iframe
        src={webAppData.url}
        className="w-full h-64 sm:h-80 md:h-96"
        title={`Web App Preview: ${webAppData.appName || 'Untitled'}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
        loading="lazy"
      />
    </div>
  );

  const renderCodeView = (codeData: CodeData) => (
    <div className="bg-background">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4" />
          <span className="text-sm font-medium">
            {codeData.filename || `${codeData.language || 'text'} code`}
          </span>
        </div>
        <button
          onClick={() => handleCopy(codeData.content)}
          className="inline-flex items-center px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="p-0">
        <pre className="p-4 overflow-x-auto text-sm bg-muted/30 font-mono">
          <code>{codeData.content}</code>
        </pre>
      </div>
    </div>
  );

  const renderWebAppCodeView = () => {
    if (loadingHtml) {
      return (
        <div className="bg-background p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading HTML source...</p>
        </div>
      );
    }

    const content = htmlContent || '// No HTML content available';
    
    return (
      <div className="bg-background">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4" />
            <span className="text-sm font-medium">
              {(data as WebAppData).appName || 'Web App'}.html
            </span>
          </div>
          <button
            onClick={() => handleCopy(content)}
            className="inline-flex items-center px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="p-0">
          <pre className="p-4 overflow-x-auto text-sm bg-muted/30 font-mono">
            <code>{content}</code>
          </pre>
        </div>
      </div>
    );
  };

  const renderDiffView = (codeData: CodeData) => {
    if (!codeData.original || !codeData.modified) {
      return (
        <div className="p-4 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No diff data available</p>
        </div>
      );
    }

    return (
      <MonacoDiffViewer
        original={codeData.original}
        modified={codeData.modified}
        language={codeData.language || 'text'}
        filename={codeData.filename || 'file'}
        height="500px"
        className="w-full"
      />
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'preview':
        if (type === 'web_app') {
          return renderWebAppPreview(data as WebAppData);
        } else if (type === 'diff') {
          const codeData = data as CodeData;
          if (codeData.url) {
            // Render web app preview for web app diffs
            return renderWebAppPreview({
              url: codeData.url,
              appName: codeData.appName,
              status: codeData.status || 'success',
              message: codeData.message || '',
              backup_created: codeData.backup_created,
            } as WebAppData);
          }
        }
        break;
      case 'code':
        if (type === 'web_app') {
          return renderWebAppCodeView();
        } else if (type === 'code') {
          return renderCodeView(data as CodeData);
        } else if (type === 'diff') {
          const codeData = data as CodeData;
          // For web app diffs, show the modified code
          return renderCodeView({
            content: codeData.modified || '',
            language: codeData.language,
            filename: codeData.filename,
          } as CodeData);
        }
        break;
      case 'diff':
        if (type === 'diff') {
          return renderDiffView(data as CodeData);
        }
        break;
    }
    
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Content not available for this tab</p>
      </div>
    );
  };

  const getTitle = () => {
    if (type === 'web_app') {
      const webAppData = data as WebAppData;
      return webAppData.appName || 'Web Application';
    } else if (type === 'code') {
      const codeData = data as CodeData;
      return codeData.filename || `${codeData.language || 'Code'} Preview`;
    } else if (type === 'diff') {
      const codeData = data as CodeData;
      if (codeData.url && codeData.appName) {
        return `${codeData.appName} (Edited)`;
      }
      return codeData.filename || `${codeData.language || 'Code'} Diff`;
    }
    return 'Content Preview';
  };

  const getExternalUrl = () => {
    if (type === 'web_app') {
      return (data as WebAppData).url;
    } else if (type === 'diff') {
      const codeData = data as CodeData;
      return codeData.url || null;
    }
    return null;
  };

  return (
    <div className="mt-4 border rounded-lg shadow-md bg-muted/40 overflow-hidden">
      {/* Header with tabs */}
      <div className="flex items-center justify-between p-3 bg-background border-b border-border">
        <div className="flex items-center gap-4">
          <h4 className="text-sm font-semibold text-foreground">{getTitle()}</h4>
          
          {/* Tabs */}
          {availableTabs.length > 1 && (
            <div className="flex items-center gap-1">
              {availableTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center px-3 py-1 text-xs rounded-md transition-colors ${
                    activeTab === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {tab.icon}
                  <span className="ml-1">{tab.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {getExternalUrl() && (
            <button
              onClick={() => window.open(getExternalUrl()!, '_blank')}
              className="inline-flex items-center px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Open
            </button>
          )}
          
          {toolCall && (
            <span className="text-xs text-muted-foreground">
              {toolCall.name}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {renderTabContent()}
    </div>
  );
};

export default ContentPreview; 