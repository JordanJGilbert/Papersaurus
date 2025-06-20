"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Eye, 
  Code, 
  History, 
  Edit3, 
  ExternalLink, 
  Calendar, 
  GitBranch, 
  Loader2, 
  Copy, 
  Check, 
  RefreshCw, 
  Send, 
  Activity, 
  Brain, 
  MessageCircle, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ChevronRight, 
  ChevronDown, 
  Clock, 
  Zap, 
  FileCode, 
  Play, 
  GitCommit, 
  Plus, 
  Download, 
  Trash2, 
  Paperclip, 
  X, 
  Image,
  Zap as ZapIcon,
} from "lucide-react";
import { v4 as uuidv4 } from 'uuid';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CodeEditor from "./CodeEditor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Added

// Configure marked for better rendering
marked.setOptions({
  breaks: true,
  gfm: true,
  async: false // Ensure synchronous operation
});

// Markdown rendering component
interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = "" }) => {
  const renderMarkdown = (markdown: string) => {
    try {
      // Use marked.parse with explicit sync operation
      const html = marked.parse(markdown, { async: false }) as string;
      const sanitizedHtml = DOMPurify.sanitize(html);
      return { __html: sanitizedHtml };
    } catch (error) {
      console.error('Error rendering markdown:', error);
      return { __html: `<pre>${content}</pre>` };
    }
  };

  return (
    <div 
      className={`prose prose-sm max-w-none dark:prose-invert prose-pre:bg-muted prose-pre:border prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm ${className}`}
      dangerouslySetInnerHTML={renderMarkdown(content)}
    />
  );
};

interface ArtifactVersion {
  version: number;
  timestamp: string;
  file: string;
  user_request: string;
  commit_summary: string;
  size: number;
  edit_type?: string;
  line_count: number;
}

interface ArtifactMetadata {
  app_name: string;
  created_at: string;
  last_updated: string;
  description: string;
  current_version: number;
  versions: ArtifactVersion[];
}

// Simplified streaming interfaces - keep original approach
interface SampleCallPair {
  id: string;
  thoughts?: string;
  output?: string;
  lastChunkType?: string;
}

interface ConversationPart {
  id: string;
  type: "text" | "thought_summary" | "tool_call";
  content?: string;
  toolCall?: {
    name: string;
    arguments: string;
    status: string;
    result?: string;
    sampleCallPairs?: SampleCallPair[];
  };
}

interface CodeDiff {
  id: string;
  timestamp: string;
  before: string;
  after: string;
  commit_summary: string;
  search_replace_results?: any;
}

interface ArtifactEditorProps {
  artifactType: "web_app" | "pdf_document" | "mcp_server";
  artifactName: string;
  artifactUrl: string;
  userNumber?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  createMode?: boolean;
  onAppCreated?: (appName: string, appUrl: string) => void;
}

interface ArtifactsListProps {
  userNumber?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectApp?: (appName: string, appUrl: string, artifactType: "web_app" | "pdf_document" | "mcp_server") => void;
}

interface ArtifactTypeSectionProps {
  artifacts: Artifact[];
  type: "web_app" | "pdf_document" | "mcp_server";
  emptyTitle: string;
  emptyDescription: string;
  emptyHint: string;
  onSelect: (artifact: Artifact) => void;
  onDelete: (appName: string, artifactType: "web_app" | "pdf_document" | "mcp_server", event: React.MouseEvent) => void;
  deletingApp: string | null;
  formatDate: (dateString: string) => string;
}

interface Artifact {
  name: string;
  type: "web_app" | "pdf_document" | "mcp_server";
  url: string;
  current_version: number;
  created_at: string;
  last_updated: string;
  description: string;
  total_versions: number;
  latest_commit_summary?: string;
  line_count?: number;
  size?: number;
  pdf_size?: number; // For PDF documents
}

const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5001';

// Component to render artifacts of a specific type
function ArtifactTypeSection({
  artifacts,
  type,
  emptyTitle,
  emptyDescription,
  emptyHint,
  onSelect,
  onDelete,
  deletingApp,
  formatDate
}: ArtifactTypeSectionProps) {
  const getTypeIcon = () => {
    switch (type) {
      case "web_app":
        return <ExternalLink className="w-16 h-16 mx-auto mb-4 opacity-50" />;
      case "pdf_document":
        return <FileCode className="w-16 h-16 mx-auto mb-4 opacity-50" />;
      case "mcp_server":
        return <Code className="w-16 h-16 mx-auto mb-4 opacity-50" />;
      default:
        return <FileCode className="w-16 h-16 mx-auto mb-4 opacity-50" />;
    }
  };

  const getOpenButtonText = () => {
    switch (type) {
      case "pdf_document":
        return "Download PDF";
      case "mcp_server":
        return "View Info";
      default:
        return "Open";
    }
  };

  if (artifacts.length === 0) {
    return (
      <div className="text-center py-12">
        {getTypeIcon()}
        <h3 className="text-lg font-semibold mb-2">{emptyTitle}</h3>
        <p className="text-muted-foreground mb-4">{emptyDescription}</p>
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-4 sm:gap-6">
        {artifacts.map((artifact) => (
          <Card 
            key={artifact.name}
            className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/50"
            onClick={() => onSelect(artifact)}
          >
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg truncate">
                    {artifact.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    v{artifact.current_version}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {type === "web_app" ? "App" : type === "pdf_document" ? "PDF" : "MCP"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {/* Only show open button for web apps and PDFs, not MCP servers */}
                  {type !== "mcp_server" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      onClick={(e) => e.stopPropagation()}
                      className="gap-1"
                    >
                      <a href={artifact.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3 h-3" />
                        <span className="hidden sm:inline">{getOpenButtonText()}</span>
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(artifact);
                    }}
                    className="gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => onDelete(artifact.name, artifact.type, e)}
                    disabled={deletingApp === artifact.name}
                    className="gap-1 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:border-red-800 dark:hover:border-red-700 dark:hover:bg-red-950"
                  >
                    {deletingApp === artifact.name ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    <span className="hidden sm:inline">
                      {deletingApp === artifact.name ? "Deleting..." : "Delete"}
                    </span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {artifact.description || "No description available"}
              </p>
              
              {artifact.latest_commit_summary && (
                <p className="text-xs text-muted-foreground mb-3 bg-muted/50 p-2 rounded italic">
                  Latest: {artifact.latest_commit_summary}
                </p>
              )}
              
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(artifact.last_updated)}
                </div>
                <div className="flex items-center gap-1">
                  <History className="w-3 h-3" />
                  {artifact.total_versions} version{artifact.total_versions !== 1 ? 's' : ''}
                </div>
                {artifact.line_count && (
                  <div className="flex items-center gap-1">
                    <FileCode className="w-3 h-3" />
                    {artifact.line_count} lines
                  </div>
                )}
                {artifact.size && (
                  <div className="flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    {(artifact.size / 1024).toFixed(1)}KB
                  </div>
                )}
                {artifact.pdf_size && (
                  <div className="flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    {(artifact.pdf_size / 1024).toFixed(1)}KB PDF
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

// Add new state for version comparison
interface VersionComparison {
  version1: number;
  version2: number;
  content1: string;
  content2: string;
  loading: boolean;
}

// NEW: Add ToolMeta type (can be shared or defined locally if not already global)
interface ToolMeta {
  name: string;
  description: string;
}

export default function ArtifactEditor({
  artifactType,
  artifactName,
  artifactUrl,
  userNumber = "+17145986105",
  trigger,
  open,
  onOpenChange,
  createMode = false,
  onAppCreated
}: ArtifactEditorProps) {
  const [activeTab, setActiveTab] = useState(createMode ? "editor" : "preview");
  const [metadata, setMetadata] = useState<ArtifactMetadata | null>(null);
  const [sourceCode, setSourceCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedStates, setCopiedStates] = useState<{[key: string]: boolean}>({});
  const [editorPrompt, setEditorPrompt] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  
  // Simplified streaming state - following page.tsx pattern
  const [editStatus, setEditStatus] = useState<"idle" | "pending" | "completed" | "error">("idle");
  const [sampleCallPairs, setSampleCallPairs] = useState<SampleCallPair[]>([]);
  const [currentToolCall, setCurrentToolCall] = useState<string>("");
  const [codeDiffs, setCodeDiffs] = useState<CodeDiff[]>([]);
  const [beforeEditContent, setBeforeEditContent] = useState<string>("");
  
  // NEW: Add version switching state
  const [switchingVersion, setSwitchingVersion] = useState<number | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Add new state for version comparison
  const [versionComparison, setVersionComparison] = useState<VersionComparison | null>(null);

  // Add state for creating new web app
  const [creatingNewApp, setCreatingNewApp] = useState(false);
  const [showCreateEditor, setShowCreateEditor] = useState(false);
  const [createArtifactType, setCreateArtifactType] = useState<"web_app" | "pdf_document" | "mcp_server">("web_app");
  const [deletingApp, setDeletingApp] = useState<string | null>(null);

  // Add new state to track created app details
  const [createdAppDetails, setCreatedAppDetails] = useState<{
    name: string;
    url: string;
  } | null>(null);

  // NEW: Add attachment state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // NEW: Add state for showing query content
  const [showQueryContent, setShowQueryContent] = useState(false);
  const [queryContentPreview, setQueryContentPreview] = useState<string>("");
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // NEW: Add state for tool selection
  const [availableTools, setAvailableTools] = useState<ToolMeta[]>([]);
  const [selectedEditorTools, setSelectedEditorTools] = useState<string[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);

  // NEW: Add state for current editor session ID
  const [currentEditorSessionId, setCurrentEditorSessionId] = useState<string | null>(null);

  // Load artifact data when component opens
  useEffect(() => {
    if (open) {
      // Generate a new session ID each time the dialog is opened
      setCurrentEditorSessionId(uuidv4().substring(0, 12));
      if (!createMode) {
        setSwitchError(null); // Clear any previous switch errors
        loadArtifactData();
        fetchAndLoadTools(); // NEW: Fetch tools and load selection
      } else if (open && createMode) {
        // For create mode, still fetch available tools for potential first query
        fetchAndLoadTools(true); // Pass true to default to all tools selected
      }
    }
  }, [open, artifactName, artifactType, createMode, userNumber]); // Added userNumber dependency

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (sampleCallPairs.length > 0) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollArea) {
          scrollArea.scrollTop = scrollArea.scrollHeight;
        }
      }, 100);
    }
  }, [sampleCallPairs]);

  // Auto-update query preview when prompt changes and dialog is open
  useEffect(() => {
    if (showQueryContent && editorPrompt.trim() && !createMode) {
      const timeoutId = setTimeout(() => {
        generateQueryPreview();
      }, 500); // Debounce updates
      
      return () => clearTimeout(timeoutId);
    }
  }, [editorPrompt, showQueryContent, createMode, metadata?.current_version]);

  // Reset streaming state and selected tools when starting new edit or create
  const resetStreamingState = () => {
    setEditStatus("idle");
    setCurrentToolCall("");
    setError(null);
    // Don't reset selectedEditorTools here, it's loaded from localStorage
  };

  const getStatusIcon = () => {
    switch (editStatus) {
      case "completed": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error": return <XCircle className="w-4 h-4 text-red-500" />;
      case "pending": return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      default: return null;
    }
  };

  // NEW: Function to fetch available tools and load/set selection
  const fetchAndLoadTools = async (defaultToAllSelected = false) => {
    if (!userNumber) return;
    setToolsLoading(true);
    try {
      const resp = await fetch(`${BACKEND_API_BASE_URL}/users/${userNumber.replace('+', '')}/tools`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.tools)) {
          const tools: ToolMeta[] = data.tools.map((t: any) => ({ name: t.name, description: t.description || "" }));
          setAvailableTools(tools);

          if (createMode && defaultToAllSelected) {
            setSelectedEditorTools(tools.map(t => t.name));
          } else if (!createMode) {
            // Load persisted selection for this artifact
            const storageKey = `artifactEditorToolSelection_${artifactType}_${artifactName}`;
            const storedSelection = localStorage.getItem(storageKey);
            if (storedSelection) {
              setSelectedEditorTools(JSON.parse(storedSelection));
            } else if (defaultToAllSelected) { // Fallback for existing artifacts if no selection stored yet
              setSelectedEditorTools(tools.map(t => t.name));
            } else {
              setSelectedEditorTools([]); // Default to none selected if nothing stored and not defaulting to all
            }
          }
        }
      } else {
        console.warn("Failed to fetch tools list for ArtifactEditor");
        setAvailableTools([]); // Ensure it's an empty array on failure
        setSelectedEditorTools([]);
      }
    } catch (e) {
      console.warn("Error fetching tools list for ArtifactEditor:", e);
      setAvailableTools([]);
      setSelectedEditorTools([]);
    } finally {
      setToolsLoading(false);
    }
  };

  // NEW: Persist tool selection when it changes for non-createMode
  useEffect(() => {
    if (open && !createMode && artifactName && artifactType) {
      const storageKey = `artifactEditorToolSelection_${artifactType}_${artifactName}`;
      localStorage.setItem(storageKey, JSON.stringify(selectedEditorTools));
    }
  }, [selectedEditorTools, open, createMode, artifactName, artifactType]);

  const loadArtifactData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Choose the right tool based on artifact type
      let toolName: string;
      let argumentKey: string;
      
      if (artifactType === "pdf_document") {
        toolName = "get_pdf_versions";
        argumentKey = "doc_name";
      } else if (artifactType === "mcp_server") {
        toolName = "get_mcp_server_versions"; 
        argumentKey = "server_name";
      } else {
        toolName = "get_app_versions";
        argumentKey = "app_name";
      }
      
      // Load metadata using appropriate tool
      const metadataResponse = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: toolName,
          arguments: {
            user_number: userNumber,
            [argumentKey]: artifactName
          }
        })
      });

      if (!metadataResponse.ok) {
        throw new Error(`Failed to load metadata: ${metadataResponse.status}`);
      }

      const metadataResult = await metadataResponse.json();
      if (metadataResult.error) {
        throw new Error(metadataResult.error);
      }

      const parsedMetadata = typeof metadataResult.result === 'string' 
        ? JSON.parse(metadataResult.result) 
        : metadataResult.result;

      if (parsedMetadata.status === "success") {
        setMetadata(parsedMetadata);
      }

      // Load current source code - for PDFs, load HTML; for web apps, load HTML; for MCP servers, load Python
      let sourceLoaded = false;
      
      if (parsedMetadata.current_version && (artifactType === "web_app" || artifactType === "pdf_document" || artifactType === "mcp_server")) {
        try {
          // Choose the right tool based on artifact type
          let sourceToolName: string = "";
          let sourceArgumentKey: string = "";
          
          if (artifactType === "pdf_document") {
            sourceToolName = "view_pdf_version";
            sourceArgumentKey = "doc_name";
          } else if (artifactType === "mcp_server") {
            sourceToolName = "view_mcp_server_version"; 
            sourceArgumentKey = "server_name";
          } else {
            // Default to web app
            sourceToolName = "view_web_app_version";
            sourceArgumentKey = "app_name";
          }
          
          console.log("[ArtifactEditor] Loading source code via backend tool:", sourceToolName, "for version:", parsedMetadata.current_version);
          const sourceResponse = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tool_name: sourceToolName,
              arguments: {
                user_number: userNumber,
                [sourceArgumentKey]: artifactName,
                version_number: parsedMetadata.current_version,
                include_content: true
              }
            })
          });

          if (sourceResponse.ok) {
            const result = await sourceResponse.json();
            if (!result.error) {
              const sourceResult = typeof result.result === 'string' 
                ? JSON.parse(result.result) 
                : result.result;

              // For MCP Servers, we want the python_code
              const contentField = artifactType === "mcp_server" ? sourceResult.python_code : sourceResult.html_content || sourceResult.content;
              if (sourceResult.status === "success" && contentField) {
                setSourceCode(contentField);
                console.log("[ArtifactEditor] Loaded source code via backend tool, length:", contentField.length, "for version:", parsedMetadata.current_version);
                sourceLoaded = true;
              }
            }
          }
        } catch (e) {
          console.warn("[ArtifactEditor] Failed to load source code via backend tool:", e);
        }
      }
      
      // Fallback to direct URL fetch if backend tool didn't work (not applicable for MCP servers)
      if (!sourceLoaded && (artifactType === "web_app" || artifactType === "pdf_document")) {
        try {
          let sourceUrl = artifactUrl;
          
          // For PDF documents, we want to show the HTML source, not the PDF binary
          if (artifactType === "pdf_document") {
            // Convert PDF URL to HTML URL (current.pdf -> current.html)
            sourceUrl = artifactUrl.replace('current.pdf', 'current.html');
          }
          
          // Add cache-busting parameter to ensure fresh content, especially after version switches
          const cacheBuster = `?t=${Date.now()}`;
          sourceUrl += cacheBuster;
          
          console.log("[ArtifactEditor] Fallback: Loading source code from URL:", sourceUrl);
          const sourceResponse = await fetch(sourceUrl);
          if (sourceResponse.ok) {
            const sourceText = await sourceResponse.text();
            setSourceCode(sourceText);
            console.log("[ArtifactEditor] Fallback: Loaded source code, length:", sourceText.length, "for version:", parsedMetadata.current_version);
          } else {
            console.warn("Failed to fetch source code via URL:", sourceResponse.status);
          }
        } catch (e) {
          console.warn("Could not load source code via URL:", e);
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artifact data");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // NEW: File handling functions
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      setSelectedFiles(prevFiles => [...prevFiles, ...files]);
      event.target.value = ''; // Reset file input
    }
  };

  const removeSelectedFile = (fileNameToRemove: string) => {
    setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileNameToRemove));
  };

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch(`${BACKEND_API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        return result.url; // Backend should return { url: "..." }
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        throw error;
      }
    });
    
    return Promise.all(uploadPromises);
  };

  const uploadSelectedFiles = async () => {
    if (selectedFiles.length === 0) return;
    
    setUploadingFiles(true);
    setUploadError(null);
    
    try {
      console.log("[ArtifactEditor] Uploading files:", selectedFiles.map(f => f.name));
      const urls = await uploadFiles(selectedFiles);
      console.log("[ArtifactEditor] Files uploaded successfully:", urls);
      
      setAttachmentUrls(prevUrls => [...prevUrls, ...urls]);
      setSelectedFiles([]); // Clear selected files after upload
    } catch (error) {
      console.error('[ArtifactEditor] File upload failed:', error);
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingFiles(false);
    }
  };

  const removeAttachmentUrl = (urlToRemove: string) => {
    setAttachmentUrls(prevUrls => prevUrls.filter(url => url !== urlToRemove));
  };

  const getFileNameFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      return pathname.split('/').pop() || 'Unknown file';
    } catch {
      return 'Unknown file';
    }
  };

  const isImageUrl = (url: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    return imageExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  const handleEditorSubmit = async () => {
    if (!editorPrompt.trim() || isEditing) return;
    
    setIsEditing(true);
    
    // NEW: Add the user's current prompt to the conversation display
    setSampleCallPairs(prev => [...prev, {
      id: uuidv4(),
      output: `👤 **You:**\n${editorPrompt}`,
      lastChunkType: 'user_prompt' // Special type for user prompt
    }]);
    
    // NEW: Upload any selected files first
    if (selectedFiles.length > 0) {
      try {
        await uploadSelectedFiles();
      } catch (error) {
        console.error('[ArtifactEditor] Failed to upload files before edit:', error);
        setIsEditing(false);
        return;
      }
    }
    
    // In create mode, we don't need to load current content
    if (!createMode) {
      // Use SHARED content fetching logic - IDENTICAL to preview
      const currentContent = await getCurrentVersionContent();
      
      // Update state with the fresh content
      setSourceCode(currentContent);
      
      // Set the before content after loading fresh content
      setBeforeEditContent(currentContent);
      console.log("[ArtifactEditor] Before edit content captured, length:", currentContent.length, "- This is the version AI will edit");
      
      // Diagnostic: Log first 200 characters of content for debugging
      if (currentContent) {
        console.log("[ArtifactEditor] Content preview:", currentContent.substring(0, 200) + "...");
      }
    }
    
    resetStreamingState(); // Now called AFTER adding user prompt and it won't clear sampleCallPairs
    setEditStatus("pending");
    
          // Use SHARED query building logic - IDENTICAL to preview
      const contentToUse = beforeEditContent || sourceCode || ""; // Use the content we just loaded
      const query = buildQueryContext(editorPrompt, contentToUse);
      
      // Construct conversation_id for the backend
      let convId = null;
      if (currentEditorSessionId) {
        const baseName = createMode ? `new_artifact_${artifactType}` : artifactName;
        convId = `${userNumber}-${artifactType}-${baseName}-${currentEditorSessionId}`;
      }
      
      console.log(`[ArtifactEditor] Starting ${createMode ? 'create' : 'edit'} request:`, editorPrompt);
      console.log(`[ArtifactEditor] ✅ Using SHARED query building logic - identical to preview`);
      console.log(`[ArtifactEditor] Query length:`, query.length, "characters");
    console.log(`[ArtifactEditor] Attachment URLs:`, attachmentUrls);
    
    try {
      const response = await fetch(`${BACKEND_API_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: userNumber,
          query: query,
          timestamp: Date.now(),
          stream: true,
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : undefined, // NEW: Include attachment URLs
          system_prompt: artifactType === "pdf_document" ? "pdf_document" : artifactType === "mcp_server" ? "mcp_server" : "artifact_editor", // NEW: Use appropriate system prompt flag
          // conversation_history: [], // REMOVED: Let backend load history from conversation_id
          allowed_tools: selectedEditorTools.length > 0 ? selectedEditorTools : undefined, // NEW: Pass selected tools
          conversation_id: convId, // NEW: Pass the generated conversation_id
        }),
      });

      console.log("[ArtifactEditor] Response received:", response.status, response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetail = `HTTP error! status: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error || errorJson.detail || errorDetail;
        } catch (parseError) {
          if (errorText) errorDetail += ` - ${errorText}`;
        }
        throw new Error(errorDetail);
      }

      if (!response.body) throw new Error('Response body is null');

      console.log("[ArtifactEditor] Starting to read stream...");

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log("[ArtifactEditor] Stream finished. Total chunks processed:", chunkCount);
          // Process any remaining buffer
          if (buffer.trim() !== '') {
            console.log("[ArtifactEditor] Processing final buffer:", buffer.substring(0, 100));
            try {
              const parsedChunk = JSON.parse(buffer);
              processStreamChunk(parsedChunk);
              chunkCount++;
            } catch (err) {
              console.error('[ArtifactEditor] Error parsing final stream chunk:', err, "Buffer:", buffer.substring(0, 200));
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;

        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);

          if (line.trim() === '') continue;
          
          console.log("[ArtifactEditor] Processing line:", line.substring(0, 100) + "...");
          
          try {
            const parsedChunk = JSON.parse(line);
            console.log("[ArtifactEditor] Parsed chunk:", parsedChunk.type, parsedChunk);
            processStreamChunk(parsedChunk);
            chunkCount++;
          } catch (err) {
            console.error('[ArtifactEditor] Error parsing stream chunk:', err, "Line:", line.substring(0, 200));
          }
        }
      }

      console.log("[ArtifactEditor] Stream processing completed");

      // Clear the prompt on successful completion
      setEditorPrompt("");
      
      // NEW: Handle create mode transition
      if (createMode && createdAppDetails && editStatus === "completed" && artifactType !== "mcp_server") { // <--- ADDED artifactType !== "mcp_server"
        console.log("[ArtifactEditor] Transitioning from create mode to edit mode for non-MCP artifact:", createdAppDetails);
        
        setTimeout(async () => {
          try {
            if (onOpenChange) {
              onOpenChange(false); // This closes the current "create" dialog
              setTimeout(() => {
                // Parent component handles transition (likely by opening a new editor for the created app)
              }, 500);
            }
          } catch (e) { /* ... */ }
        }, 1000);
      } else if (createMode && artifactType === "mcp_server" && editStatus === "completed") {
        console.log("[ArtifactEditor] MCP Server creation completed in createMode. Dialog remains open for agent iteration.");
        // Here, createdAppDetails will be set, and the AI can use createdAppDetails.name for subsequent edits.
        // The editor's internal artifactName prop might still be "new_artifact", but the AI has the real name.
      }
      
    } catch (error) {
      console.error('[ArtifactEditor] Error editing artifact:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to edit artifact';
      setError(errorMessage);
      setEditStatus("error");
    } finally {
      setIsEditing(false);
    }
  };

  const processStreamChunk = (chunk: any) => {
    console.log("[ArtifactEditor] Processing chunk:", chunk.type, chunk);
    
    if (chunk.type === 'text_chunk' && chunk.content) {
      console.log("[ArtifactEditor] Text chunk:", chunk.content.substring(0, 100));
      appendOrCreateNew(chunk.content, 'output', 'text_chunk');
      
    } else if (chunk.type === 'tool_sample_text_chunk' && chunk.content) {
      console.log("[ArtifactEditor] Tool sample text chunk:", chunk.content.substring(0, 100));
      appendOrCreateNew(chunk.content, 'output', 'tool_sample_text_chunk');
      
    } else if (chunk.type === 'tool_sample_thought_chunk' && chunk.content) {
      console.log("[ArtifactEditor] Tool sample thought chunk:", chunk.content.substring(0, 100));
      appendOrCreateNew(chunk.content, 'thoughts', 'tool_sample_thought_chunk');
      
    } else if (chunk.type === 'thought_summary' && chunk.content) {
      console.log("[ArtifactEditor] Thought summary:", chunk.content.substring(0, 100));
      appendOrCreateNew(chunk.content, 'thoughts', 'thought_summary');
      
    } else if (chunk.type === 'tool_call_pending' && chunk.name) {
      console.log("[ArtifactEditor] Tool call pending:", chunk.name);
      setCurrentToolCall(chunk.name);
      
      // Tool calls always create new pairs
      setSampleCallPairs(prev => [...prev, {
        id: uuidv4(),
        output: `🔧 Calling tool: ${chunk.name}${chunk.arguments ? `\nArguments: ${JSON.stringify(chunk.arguments, null, 2)}` : ''}`,
        lastChunkType: 'tool_call_pending'
      }]);
      
    } else if (chunk.type === 'tool_result' && chunk.call_id) {
      console.log("[ArtifactEditor] Tool result:", chunk.name, typeof chunk.result);
      setCurrentToolCall("");
      
      // Handle tool result...
      let resultContent = '';
      let shouldSwitchToPreview = false;
      
      // Standardize access to tool name from chunk
      const toolNameFromResult = chunk.name || (chunk.tool_call ? chunk.tool_call.name : null);

      if (toolNameFromResult && (toolNameFromResult === 'create_web_app' || toolNameFromResult === 'edit_web_app' || toolNameFromResult === 'create_pdf_document' || toolNameFromResult === 'edit_pdf_document' || toolNameFromResult === 'create_mcp_server' || toolNameFromResult === 'edit_mcp_server')) {
        try {
          const result = typeof chunk.result === 'string' ? JSON.parse(chunk.result) : chunk.result;
          if (result.status === 'success') {
            setEditStatus("completed");
            shouldSwitchToPreview = true; // Flag for immediate switch
            const isWebApp = toolNameFromResult === 'create_web_app' || toolNameFromResult === 'edit_web_app';
            const isPdf = toolNameFromResult === 'create_pdf_document' || toolNameFromResult === 'edit_pdf_document';
            const isMcpServer = toolNameFromResult === 'create_mcp_server' || toolNameFromResult === 'edit_mcp_server';
            const artifactTypeName = isPdf ? 'PDF document' : isMcpServer ? 'MCP Server' : 'Web app';
            
            resultContent = `✅ ${artifactTypeName} ${createMode ? 'created' : 'edited'} successfully!\n\n📝 ${result.commit_summary || 'No commit summary'}`;
            
            if (result.url) {
              resultContent += `\n🔗 URL: ${result.url}`;
            }
            if (result.pdf_url) {
              resultContent += `\n📄 PDF: ${result.pdf_url}`;
            }
            if (result.html_url) {
              resultContent += `\n🌐 HTML: ${result.html_url}`;
            }
            
            if (result.search_replace_results) {
              resultContent += `\n\nSearch/Replace Results:\n- Total blocks: ${result.search_replace_results.total_blocks}\n- Successful: ${result.search_replace_results.successful}\n- Failed: ${result.search_replace_results.failed}`;
            }
            
            // NEW: If this is create mode and we have artifact details, capture them
            const artifactName = result.app_name || result.doc_name || result.server_name;
            const artifactUrl = result.url || result.pdf_url || result.server_url;
            
            if (createMode && artifactName && artifactUrl) {
              console.log("[ArtifactEditor] Capturing created artifact details:", artifactName, artifactUrl);
              setCreatedAppDetails({
                name: artifactName,
                url: artifactUrl
              });
            }
            
            // NEW: If this is create mode and we have artifact details, call the callback
            // MODIFICATION: Only call onAppCreated if NOT an MCP server, to allow agent iteration
            if (createMode && artifactName && artifactUrl && onAppCreated && artifactType !== "mcp_server") { // <--- ADDED artifactType !== "mcp_server"
              console.log("[ArtifactEditor] Calling onAppCreated for non-MCP artifact:", artifactName, artifactUrl);
              setTimeout(() => {
                onAppCreated(artifactName, artifactUrl);
              }, 1500);
            } else if (createMode && artifactType === "mcp_server") {
              console.log("[ArtifactEditor] MCP Server created in createMode. Deferring onAppCreated/dialog close for agent iteration.");
              // Agent can now use 'artifactName' for subsequent edit_mcp_server calls within this dialog
              // The 'artifactName' prop of this dialog is still the placeholder, but that's okay for the AI's internal logic.
            }
            
            // Diff capture logic for edit mode...
            if (!createMode) {
              setTimeout(async () => {
                try {
                  const newVersionNumber = result.version_number;
                  let afterContent = "";

                  // Prefer fetching content by new version number if available, as it's the most reliable method
                  if (newVersionNumber) {
                    afterContent = await fetchVersionContent(newVersionNumber);
                  } 
                  // Fallback for web/pdf if version number is missing from tool result
                  else if (artifactUrl && (artifactType === 'web_app' || artifactType === 'pdf_document')) {
                    let sourceUrl = artifactUrl;
                    if (artifactType === "pdf_document") {
                      // The artifactUrl for a PDF is the .pdf link, but we need the .html source for diffing
                      sourceUrl = sourceUrl.replace(/current\.pdf(\?.*)?$/, 'current.html');
                    }
                    const updatedResponse = await fetch(`${sourceUrl}?t=${Date.now()}`);
                    if (updatedResponse.ok) {
                      afterContent = await updatedResponse.text();
                    }
                  }
                  
                  if (afterContent && beforeEditContent !== afterContent && beforeEditContent.length > 0) {
                    const newDiff: CodeDiff = {
                      id: uuidv4(),
                      timestamp: new Date().toISOString(),
                      before: beforeEditContent,
                      after: afterContent,
                      commit_summary: result.commit_summary || 'Code updated',
                      search_replace_results: result.search_replace_results
                    };
                    setCodeDiffs(prev => [...prev, newDiff]);
                    setSourceCode(afterContent);
                  }
                } catch (e) {
                  console.error('[ArtifactEditor] Failed to capture diff:', e);
                }
              }, 1000);
            }
          } else {
            setEditStatus("error");
            setError(result.message || 'Unknown error');
            resultContent = `❌ ${createMode ? 'Creation' : 'Edit'} failed: ${result.message || 'Unknown error'}`;
          }
        } catch (e) {
          resultContent = `✅ Tool completed: ${chunk.name}`;
        }
      } else {
        const resultData = typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result, null, 2);
        resultContent = `✅ Tool: ${chunk.name || 'Unknown'}\n\nResult:\n${resultData.substring(0, 1000)}${resultData.length > 1000 ? '...' : ''}`;
      }
      
      setSampleCallPairs(prev => [...prev, {
        id: uuidv4(),
        output: resultContent,
        lastChunkType: 'tool_result'
      }]);
      
      // Simplified: Just switch immediately on successful web app operations
      if (shouldSwitchToPreview) {
        console.log("[ArtifactEditor] Switching to preview after successful tool result");
        // setActiveTab("preview"); // << MODIFIED: Commented out for create/edit_mcp_server

        // For edit mode, reload artifact data to show updated version
        // Only do this if NOT mcp_server, as agent might iterate
        if (!createMode && toolNameFromResult !== 'create_mcp_server' && toolNameFromResult !== 'edit_mcp_server') {
          setTimeout(() => {
            loadArtifactData();
          }, 500);
        } else if (toolNameFromResult === 'create_mcp_server' || toolNameFromResult === 'edit_mcp_server') {
          // For MCP servers, we explicitly DO NOT switch tab or auto-reload here to allow agent iteration.
          // The agent will signal when it's done, or user can manually check.
          console.log("[ArtifactEditor] MCP Server operation: Tab switch and auto-reload deferred for agent iteration.");
        } else if (createMode && (toolNameFromResult === 'create_web_app' || toolNameFromResult === 'create_pdf_document')){
          // For other create modes (web_app, pdf), still switch and reload if needed by onAppCreated flow
          setActiveTab("preview"); 
           setTimeout(() => {
            loadArtifactData();
          }, 500);
        }
      }
      
    } else if (chunk.type === 'stream_end') {
      console.log("[ArtifactEditor] Stream end");
      if (editStatus === "pending") {
        setEditStatus("completed");
      }
      
    } else if (chunk.type === 'error') {
      console.log("[ArtifactEditor] Error chunk:", chunk.content);
      setEditStatus("error");
      setError(chunk.content);
      
      setSampleCallPairs(prev => [...prev, {
        id: uuidv4(),
        output: `❌ Error: ${chunk.content}`,
        lastChunkType: 'error'
      }]);
    } else {
      console.log("[ArtifactEditor] Unknown chunk type:", chunk.type, chunk);
    }
  };

  // SUPER SIMPLE: Just check if chunk type changed from last one
  const appendOrCreateNew = (content: string, field: 'output' | 'thoughts', chunkType: string) => {
    setSampleCallPairs(prev => {
      const lastPair = prev[prev.length - 1];
      
      // If no pairs exist, or chunk type changed, or if last chunk was a user_prompt, create new pair
      if (!lastPair || 
          (lastPair as any).lastChunkType !== chunkType || 
          (lastPair as any).lastChunkType === 'user_prompt'
      ) {
        return [...prev, {
          id: uuidv4(),
          [field]: content,
          lastChunkType: chunkType
        }];
      }
      
      // Same chunk type - append to existing pair
      return prev.map((pair, index) => 
        index === prev.length - 1 
          ? { ...pair, [field]: (pair[field] || '') + content }
          : pair
      );
    });
  };

  const retryEdit = () => {
    resetStreamingState();
    handleEditorSubmit();
  };

  const simplifyPrompt = () => {
    setEditorPrompt("Please make some small improvements");
  };

  // SHARED: Function to fetch current content - used by both preview and submit
  const getCurrentVersionContent = async (): Promise<string> => {
    let currentContent = "";
    
    // First, try to get content directly from the backend tool which knows the exact current version
    if (metadata && metadata.current_version) {
      try {
        // Choose the right tool based on artifact type
        const toolName = artifactType === "pdf_document" ? "view_pdf_version" : "view_web_app_version";
        const argumentKey = artifactType === "pdf_document" ? "doc_name" : "app_name";
        
        console.log("[ArtifactEditor] Fetching current version content via backend tool:", toolName, "version:", metadata.current_version);
        const response = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: toolName,
            arguments: {
              user_number: userNumber,
              [argumentKey]: artifactName,
              version_number: metadata.current_version,
              include_content: true
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (!result.error) {
            const parsedResult = typeof result.result === 'string' 
              ? JSON.parse(result.result) 
              : result.result;

            // For both web apps and PDFs, we want the HTML content
            const contentField = parsedResult.html_content || parsedResult.content;
            if (parsedResult.status === "success" && contentField) {
              currentContent = contentField;
              console.log("[ArtifactEditor] Successfully loaded version-specific content via backend tool, length:", currentContent.length);
            }
          }
        }
      } catch (e) {
        console.warn("[ArtifactEditor] Failed to load content via backend tool:", e);
      }
    }
    
    // Fallback: if backend tool didn't work, try direct URL fetch with cache busting
    if (!currentContent) {
      try {
        let sourceUrl = artifactUrl;
        // For PDF documents, we want to edit the HTML source, not the PDF binary
        if (artifactType === "pdf_document") {
          sourceUrl = artifactUrl.replace('current.pdf', 'current.html');
        }
        
        // Add cache-busting parameter to ensure fresh content
        const cacheBuster = `?t=${Date.now()}`;
        sourceUrl += cacheBuster;
        
        console.log("[ArtifactEditor] Fallback: Loading fresh current content before edit from:", sourceUrl);
        const response = await fetch(sourceUrl);
        if (response.ok) {
          currentContent = await response.text();
          console.log("[ArtifactEditor] Fallback: Loaded fresh content, length:", currentContent.length, "for current version:", metadata?.current_version);
        } else {
          throw new Error(`Failed to fetch content: ${response.status}`);
        }
      } catch (e) {
        console.warn("[ArtifactEditor] Failed to load current content via URL:", e);
        // Final fallback to existing sourceCode if both methods fail
        currentContent = beforeEditContent || sourceCode || "";
      }
    }

    return currentContent;
  };

  // SHARED: Function to build query context - used by both preview and submit
  const buildQueryContext = (userPrompt: string, currentContent: string): string => {
    let query = userPrompt;
    
    // Add comprehensive context for editing mode
    if (!createMode && currentContent && metadata) {
      const recentCommits = metadata.versions?.slice(-3) || [];
      const recentCommitsText = recentCommits.length > 0 
        ? recentCommits.map(v => `  v${v.version}: ${v.commit_summary}`).join('\n')
        : '  (No previous versions)';

      if (artifactType === "pdf_document") {
        query = `Context: I'm editing the PDF document \"${artifactName}\".

Document Info:
- Current Version: ${metadata.current_version}
- Total Versions: ${metadata.versions?.length || 0}
- Last Updated: ${metadata.last_updated ? new Date(metadata.last_updated).toLocaleDateString() : 'Unknown'}

Recent Changes:
${recentCommitsText}

Current HTML Content (will be converted to PDF):
\`\`\`html
${currentContent}
\`\`\`

User Request: ${userPrompt}`;
      } else if (artifactType === "mcp_server") {
        query = `Context: I'm editing the MCP Server \"${artifactName}\".

Server Info:
- Current Version: ${metadata.current_version}
- Total Versions: ${metadata.versions?.length || 0}
- Last Updated: ${metadata.last_updated ? new Date(metadata.last_updated).toLocaleDateString() : 'Unknown'}

Recent Changes:
${recentCommitsText}

Current Python Code:
\`\`\`python
${currentContent}
\`\`\`

User Request: ${userPrompt}`;
      } else {
        query = `Context: I'm editing the web app \"${artifactName}\".

App Info:
- Current Version: ${metadata.current_version}
- Total Versions: ${metadata.versions?.length || 0}
- Last Updated: ${metadata.last_updated ? new Date(metadata.last_updated).toLocaleDateString() : 'Unknown'}

Recent Changes:
${recentCommitsText}

Current HTML Content:
\`\`\`html
${currentContent}
\`\`\`

User Request: ${userPrompt}`;
      }
    }
    
    // Mention attachments naturally without dictating tool usage
    if (attachmentUrls.length > 0) {
      const attachmentContext = `\n\nI've attached ${attachmentUrls.length} file${attachmentUrls.length > 1 ? 's' : ''} as visual references that may be helpful.`;
      query += attachmentContext;
    }

    return query;
  };

  // NEW: Function to generate query content preview using SHARED logic
  const generateQueryPreview = async () => {
    if (createMode || !editorPrompt.trim()) {
      setQueryContentPreview("No content preview available in create mode or with empty prompt.");
      return;
    }

    setIsGeneratingPreview(true);
    
    try {
      // Use SAME content fetching logic as handleEditorSubmit
      const currentContent = await getCurrentVersionContent();
      
      // Use SAME query building logic as handleEditorSubmit
      const previewQuery = buildQueryContext(editorPrompt, currentContent);
      
      setQueryContentPreview(previewQuery);
      
      // Diagnostic: Log first 200 characters of content for debugging
      if (currentContent) {
        console.log("[ArtifactEditor] Preview content loaded, length:", currentContent.length);
        console.log("[ArtifactEditor] Preview content sample:", currentContent.substring(0, 200) + "...");
        console.log("[ArtifactEditor] ✅ Preview using SHARED functions - guaranteed identical to submission");
        console.log("[ArtifactEditor] Preview query length:", previewQuery.length, "characters");
      }
    } catch (error) {
      console.error("[ArtifactEditor] Failed to generate query preview:", error);
      setQueryContentPreview("Error generating preview: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // NEW: Function to handle version switching
  const handleVersionSwitch = async (targetVersion: number) => {
    if (switchingVersion || !metadata) return;
    
    // Don't switch if already on this version
    if (targetVersion === metadata.current_version) {
      return;
    }
    
    setSwitchingVersion(targetVersion);
    setSwitchError(null);
    
    try {
      let switchToolName: string;
      let nameKey: string;
      if (artifactType === "mcp_server") {
        switchToolName = "switch_mcp_server_version";
        nameKey = "server_name";
      } else if (artifactType === "pdf_document") {
        // Assuming a similar tool for PDFs, or handle differently
        switchToolName = "switch_web_app_version"; // Placeholder, adjust if PDF switch tool exists
        nameKey = "doc_name"; // Placeholder
      } else {
        switchToolName = "switch_web_app_version";
        nameKey = "app_name";
      }

      const response = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: switchToolName,
          arguments: {
            [nameKey]: artifactName,
            target_version: targetVersion,
            user_number: userNumber
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to switch version: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      const parsedResult = typeof result.result === 'string' 
        ? JSON.parse(result.result) 
        : result.result;

      if (parsedResult.status === "success") {
        // Add a small delay to ensure the backend has completed the version switch
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reload artifact data to reflect the new current version
        // Note: loadArtifactData() already fetches the current content and sets sourceCode
        await loadArtifactData();
        
        // Switch to preview tab to show the switched version
        setActiveTab("preview");
        
        // Show success message briefly
        setSwitchError(null);
        
        console.log("[ArtifactEditor] Successfully switched to version", targetVersion, "- sourceCode updated by loadArtifactData");
      } else {
        throw new Error(parsedResult.message || "Failed to switch version");
      }
    } catch (error) {
      console.error('Version switch failed:', error);
      setSwitchError(error instanceof Error ? error.message : "Failed to switch version");
    } finally {
      setSwitchingVersion(null);
    }
  };

  // Add function to fetch version content
  const fetchVersionContent = async (version: number): Promise<string> => {
    try {
      let viewToolName: string;
      let argumentKey: string;
      let contentFieldKey: string;

      if (artifactType === "mcp_server") {
        viewToolName = "view_mcp_server_version";
        argumentKey = "server_name";
        contentFieldKey = "python_code";
      } else if (artifactType === "pdf_document") {
        viewToolName = "view_pdf_version";
        argumentKey = "doc_name";
        contentFieldKey = "html_content";
      } else {
        viewToolName = "view_web_app_version";
        argumentKey = "app_name";
        contentFieldKey = "html_content";
      }

      const response = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: viewToolName,
          arguments: {
            user_number: userNumber,
            [argumentKey]: artifactName,
            version_number: version,
            include_content: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch version ${version}: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      const parsedResult = typeof result.result === 'string' 
        ? JSON.parse(result.result) 
        : result.result;

      if (parsedResult.status === "success" && parsedResult[contentFieldKey]) {
        return parsedResult[contentFieldKey];
      } else {
        throw new Error("Failed to get version content");
      }
    } catch (error) {
      console.error(`Error fetching version ${version}:`, error);
      throw error;
    }
  };

  // Add function to compare two versions
  const compareVersions = async (version1: number, version2: number) => {
    setVersionComparison({
      version1,
      version2,
      content1: "",
      content2: "",
      loading: true
    });

    try {
      const [content1, content2] = await Promise.all([
        fetchVersionContent(version1),
        fetchVersionContent(version2)
      ]);

      setVersionComparison({
        version1,
        version2,
        content1,
        content2,
        loading: false
      });
    } catch (error) {
      console.error("Error comparing versions:", error);
      setVersionComparison(null);
      // Show error to user
      setSwitchError(error instanceof Error ? error.message : "Failed to compare versions");
    }
  };

  // Add function to create new web app from current version
  const createNewAppFromVersion = async (version?: number, customName?: string) => {
    setCreatingNewApp(true);
    
    try {
      const baseName = customName || `${artifactName}_copy`;
      const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const newAppName = `${baseName}_${timestamp}`;
      
      let cloneToolName: string;
      let sourceArgKey: string;
      let newArgKey: string;
      let versionArgKey: string;
      let descriptionArgKey: string;


      if (artifactType === "mcp_server") {
        cloneToolName = "clone_mcp_server";
        sourceArgKey = "source_server_name";
        newArgKey = "new_server_name";
        versionArgKey = "source_version";
        descriptionArgKey = "description_override";
      } else if (artifactType === "pdf_document") {
        // Assuming a clone_pdf_document tool exists or handle differently
        cloneToolName = "clone_web_app"; // Placeholder, adjust if clone_pdf_document tool exists
        sourceArgKey = "source_app_name"; // Placeholder
        newArgKey = "new_app_name"; // Placeholder
        versionArgKey = "source_version";
        descriptionArgKey = "description_override";
      } else {
        cloneToolName = "clone_web_app";
        sourceArgKey = "source_app_name";
        newArgKey = "new_app_name";
        versionArgKey = "source_version";
        descriptionArgKey = "description_override";
      }
      
      const response = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: cloneToolName,
          arguments: {
            [sourceArgKey]: artifactName,
            [newArgKey]: newAppName,
            user_number: userNumber,
            [versionArgKey]: version, 
            [descriptionArgKey]: version 
              ? `Clone of ${artifactName} v${version} - Created from artifact editor`
              : `Clone of ${artifactName} (current) - Created from artifact editor`
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to clone app: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      const parsedResult = typeof result.result === 'string' 
        ? JSON.parse(result.result) 
        : result.result;

      if (parsedResult.status === "success") {
        // Show success message and offer to open the new app
        const confirmOpen = window.confirm(
          `New web app "${newAppName}" cloned successfully!\n\nWould you like to open it in a new tab?`
        );
        
        if (confirmOpen && parsedResult.url) {
          window.open(parsedResult.url, '_blank');
        }
        
        // Optionally close this editor and open the new one
        const confirmEdit = window.confirm(
          `Would you like to edit the new app "${newAppName}"?`
        );
        
        if (confirmEdit) {
          // Close current editor and signal to parent to open new one
          if (onOpenChange) {
            onOpenChange(false);
          }
          // You might want to add a callback here to open the new app editor
        }
      } else {
        throw new Error(parsedResult.message || "Failed to clone web app");
      }
      
    } catch (error) {
      console.error('Error cloning web app:', error);
      setSwitchError(error instanceof Error ? error.message : "Failed to clone web app");
    } finally {
      setCreatingNewApp(false);
    }
  };

  // Add function to create a brand new web app from scratch
  const createBrandNewApp = async () => {
    setCreatingNewApp(true);
    
    try {
      // Get app name and description from user
      const appName = prompt("Enter a name for your new web app:", "my_new_app");
      if (!appName) {
        setCreatingNewApp(false);
        return; // User cancelled
      }
      
      const userRequest = prompt(
        "Describe what you want your new web app to do:", 
        "Create a simple web application"
      );
      if (!userRequest) {
        setCreatingNewApp(false);
        return; // User cancelled
      }
      
      // Switch to editor tab to show streaming
      setActiveTab("editor");
      
      // Reset streaming state and start
      resetStreamingState();
      setEditStatus("pending");
      
      // Generate unique name with timestamp to avoid conflicts
      const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const uniqueAppName = `${appName}_${timestamp}`;
      
      console.log("[ArtifactEditor] Starting brand new app creation:", uniqueAppName);
      
      // Use the streaming query endpoint instead of direct tool call
      const response = await fetch(`${BACKEND_API_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: userNumber,
          query: `I want to create a web app called "${uniqueAppName}". ${userRequest}`,
          timestamp: Date.now(),
          stream: true,
          // NEW: For brand new app, pass all available tools or a sensible default
          // For simplicity, let's allow all tools for initial creation, assuming fetchAndLoadTools (with defaultToAll) was called.
          allowed_tools: selectedEditorTools.length > 0 ? selectedEditorTools : undefined,
        }),
      });

      console.log("[ArtifactEditor] Response received:", response.status, response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetail = `HTTP error! status: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error || errorJson.detail || errorDetail;
        } catch (parseError) {
          if (errorText) errorDetail += ` - ${errorText}`;
        }
        throw new Error(errorDetail);
      }

      if (!response.body) throw new Error('Response body is null');

      console.log("[ArtifactEditor] Starting to read stream for new app...");

      // Handle streaming response (same as handleEditorSubmit)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log("[ArtifactEditor] Stream finished. Total chunks processed:", chunkCount);
          // Process any remaining buffer
          if (buffer.trim() !== '') {
            console.log("[ArtifactEditor] Processing final buffer:", buffer.substring(0, 100));
            try {
              const parsedChunk = JSON.parse(buffer);
              processStreamChunk(parsedChunk);
              chunkCount++;
            } catch (err) {
              console.error('[ArtifactEditor] Error parsing final stream chunk:', err, "Buffer:", buffer.substring(0, 200));
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;

        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);

          if (line.trim() === '') continue;
          
          console.log("[ArtifactEditor] Processing line:", line.substring(0, 100) + "...");
          
          try {
            const parsedChunk = JSON.parse(line);
            console.log("[ArtifactEditor] Parsed chunk:", parsedChunk.type, parsedChunk);
            processStreamChunk(parsedChunk);
            chunkCount++;
          } catch (err) {
            console.error('[ArtifactEditor] Error parsing stream chunk:', err, "Line:", line.substring(0, 200));
          }
        }
      }

      console.log("[ArtifactEditor] New app creation stream processing completed");

      // On successful completion, reload artifact data to show the new app
      // Note: The new app will be created, but we're still in the old app's editor
      // The user will see the creation process and can then navigate to the new app
      
      // Show success message after streaming completes
      if (editStatus === "completed") {
        setTimeout(() => {
          const confirmOpen = window.confirm(
            `New web app "${uniqueAppName}" created successfully!\n\nWould you like to open it in a new tab?`
          );
          
          if (confirmOpen) {
            // Construct the URL for the new app
            const newAppUrl = `${BACKEND_API_BASE_URL.replace(/:\d+/, ':5002')}/user_data/${userNumber.replace(/^\+/, '').replace(/\W+/g, '')}/web_apps/${uniqueAppName}/current.html`;
            window.open(newAppUrl, '_blank');
          }
        }, 1000);
      }
      
    } catch (error) {
      console.error('[ArtifactEditor] Error creating new web app:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create new web app';
      setError(errorMessage);
      setEditStatus("error");
    } finally {
      setCreatingNewApp(false);
    }
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <Edit3 className="w-4 h-4" />
      Edit Artifact
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      console.log("[ArtifactEditor] Dialog onOpenChange called with:", newOpen);
      if (onOpenChange) {
        onOpenChange(newOpen);
      }
    }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {/* Removed default trigger - component now only opens when explicitly triggered */}
      
      <DialogContent 
        className="max-w-7xl h-[85vh] sm:h-[90vh] sm:max-w-7xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden p-0 sm:p-0 my-2 sm:my-auto [&>button]:hidden"
        onEscapeKeyDown={(e) => {
          console.log("[ArtifactEditor] Escape key pressed");
          if (onOpenChange) {
            onOpenChange(false);
          }
        }}
        onPointerDownOutside={(e) => {
          console.log("[ArtifactEditor] Clicked outside dialog");
          if (onOpenChange) {
            onOpenChange(false);
          }
        }}
      >
        <DialogHeader className="px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-1 text-sm flex-1 min-w-0">
              <Edit3 className="w-3 h-3" />
              <span className="truncate text-xs sm:text-sm">
                {createMode 
                  ? `Create New ${
                      artifactType === "pdf_document" ? "PDF Document" : 
                      artifactType === "mcp_server" ? "MCP Server" : 
                      "Web App"
                    }` 
                  : artifactName
                }
              </span>
              {!createMode && metadata && (
                <Badge variant="outline" className="text-xs h-4 px-1">
                  v{metadata.current_version}
                </Badge>
              )}
            </DialogTitle>
            
            {/* Mobile-friendly close button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("[ArtifactEditor] Mobile close button clicked");
                if (onOpenChange) {
                  onOpenChange(false);
                }
              }}
              className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label="Close dialog"
            >
              <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </DialogHeader>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading artifact data...</p>
            </div>
          </div>
        ) : error && !isEditing ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={loadArtifactData} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-4 flex-shrink-0 h-6 p-0 mx-0 border-t-0 rounded-t-none -mt-px">
              <TabsTrigger value="preview" className="gap-0.5 text-xs px-0.5 py-0.5 h-6 rounded-t-none">
                <Eye className="w-3 h-3" />
                <span className="hidden sm:inline ml-0.5">Preview</span>
                <span className="sm:hidden">Prev</span>
              </TabsTrigger>
              <TabsTrigger value="code" className="gap-0.5 text-xs px-0.5 py-0.5 h-6 rounded-t-none">
                <Code className="w-3 h-3" />
                <span className="hidden sm:inline ml-0.5">Code</span>
                <span className="sm:hidden">Code</span>
              </TabsTrigger>
              <TabsTrigger value="versions" className="gap-0.5 text-xs px-0.5 py-0.5 h-6 rounded-t-none">
                <History className="w-3 h-3" />
                <span className="hidden sm:inline ml-0.5">History</span>
                <span className="sm:hidden">Hist</span>
              </TabsTrigger>
              <TabsTrigger value="editor" className="gap-0.5 text-xs px-0.5 py-0.5 h-6 rounded-t-none">
                <Edit3 className="w-3 h-3" />
                <span className="flex items-center gap-0.5">
                  <span className="hidden sm:inline">Chat</span>
                  <span className="sm:hidden">Chat</span>
                  {isEditing && getStatusIcon()}
                </span>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-hidden px-1 sm:px-2 pb-1 sm:pb-2 pt-0">
                <TabsContent value="preview" className="h-full m-0">
                  <Card className="h-full">
                    <CardHeader className="pb-3 px-4 pt-3 sm:px-6 sm:pt-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base sm:text-lg">
                          {artifactType === "pdf_document" ? "PDF Preview" :
                           artifactType === "mcp_server" ? "Server Info" :
                           "Live Preview"}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {artifactType === "pdf_document" && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={artifactUrl.replace('current.pdf', 'current.html')} target="_blank" rel="noopener noreferrer" className="gap-2 text-xs sm:text-sm">
                                <Code className="w-3 h-3 sm:w-4 sm:h-4" />
                                View HTML
                              </a>
                            </Button>
                          )}
                          {artifactType !== 'mcp_server' && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={artifactUrl} target="_blank" rel="noopener noreferrer" className="gap-2 text-xs sm:text-sm">
                                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                                {artifactType === "pdf_document" ? "Download PDF" : "Open in New Tab"}
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[calc(100%-4rem)] sm:h-[calc(100%-5rem)] p-0">
                      {artifactType === "pdf_document" ? (
                        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-b-lg flex items-center justify-center">
                          <embed
                            src={artifactUrl}
                            type="application/pdf"
                            className="w-full h-full rounded-b-lg"
                            title={`PDF Preview of ${artifactName}`}
                          />
                        </div>
                      ) : artifactType === 'mcp_server' ? (
                          <div className="w-full h-full bg-muted/20 rounded-b-lg flex items-center justify-center text-center p-4">
                            <div>
                              <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <h3 className="text-lg font-semibold">No Live Preview Available</h3>
                              <p className="mt-2 text-sm text-muted-foreground">
                                MCP Servers are backend components and do not have a visual interface.
                              </p>
                              <Button variant="link" className="mt-2" onClick={() => setActiveTab('code')}>
                                View Source Code
                              </Button>
                            </div>
                          </div>
                      ) : (
                        <iframe
                          src={artifactUrl}
                          className="w-full h-full border-0 rounded-b-lg"
                          title={`Preview of ${artifactName}`}
                          key={metadata?.current_version}
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="code" className="h-full m-0">
                  <Card className="h-full flex flex-col">
                    <CardHeader className="pb-3 px-4 pt-1 sm:px-6 sm:pt-2 flex-shrink-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                        <div>
                          <CardTitle className="text-base sm:text-lg">
                            {artifactType === "pdf_document" ? "HTML Source (for PDF)" : "Source Code"}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm mt-1">
                            <span>Current (v{metadata?.current_version || '?'})</span>
                            {sourceCode && (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  {sourceCode.split('\n').length} lines
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {formatFileSize(new Blob([sourceCode]).size)}
                                </Badge>
                              </>
                            )}
                          </CardDescription>
                        </div>
                        {sourceCode && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => copyToClipboard(sourceCode, 'source')}
                            className="gap-2 text-xs sm:text-sm mt-2 sm:mt-0"
                          >
                            {copiedStates.source ? (
                              <>
                                <Check className="w-4 h-4" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 min-h-0 overflow-hidden">
                      {sourceCode ? (
                        <div className="h-full w-full min-h-0" style={{ minHeight: '400px' }}>
                          <CodeEditor
                            value={sourceCode}
                            language={artifactType === "mcp_server" ? "python" : "html"}
                            height="100%"
                            readOnly={true}
                            minimap={sourceCode.split('\n').length > 100}
                            className="h-full w-full"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-center text-muted-foreground py-8">
                          <div>
                            <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No source code available</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="versions" className="h-full m-0">
                  <Card className="h-full">
                    <CardHeader className="pb-3 px-4 pt-1 sm:px-6 sm:pt-2">
                      <CardTitle className="text-base sm:text-lg">Version History</CardTitle>
                      <CardDescription className="text-xs sm:text-sm mt-1">
                        {metadata ? `${metadata.versions.length} versions` : "Loading..."}
                        {versionComparison && (
                          <span className="ml-2">
                            • Comparing v{versionComparison.version1} vs v{versionComparison.version2}
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[calc(100%-5rem)] sm:h-[calc(100%-6rem)] p-0">
                      <ScrollArea className="h-full w-full px-3 sm:px-6 pb-3 sm:pb-6">
                        {switchError && (
                          <Alert variant="destructive" className="mb-3 sm:mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{switchError}</AlertDescription>
                          </Alert>
                        )}

                        {/* Version Comparison View - Mobile Optimized */}
                        {versionComparison && (
                          <div className="mb-4 sm:mb-6">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <h3 className="text-sm sm:text-base font-semibold">
                                v{versionComparison.version1} → v{versionComparison.version2}
                              </h3>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setVersionComparison(null)}
                                className="text-xs h-7 px-2"
                              >
                                ✕
                              </Button>
                            </div>
                            
                            {versionComparison.loading ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                <span className="text-sm">Loading...</span>
                              </div>
                            ) : (
                              <div className="border rounded-lg overflow-hidden">
                                <ReactDiffViewer
                                  oldValue={versionComparison.content1}
                                  newValue={versionComparison.content2}
                                  splitView={false}
                                  compareMethod={DiffMethod.WORDS}
                                  leftTitle=""
                                  rightTitle=""
                                  disableWordDiff={false}
                                  extraLinesSurroundingDiff={0}
                                  renderContent={(str) => (
                                    <pre style={{ 
                                      display: 'inline', 
                                      margin: 0, 
                                      padding: 0, 
                                      whiteSpace: 'pre-wrap',
                                      fontSize: '11px',
                                      lineHeight: '1.3'
                                    }}>
                                      {str.replace(/^[\+\-\s]/, '')}
                                    </pre>
                                  )}
                                  styles={{
                                    variables: {
                                      dark: {
                                        diffViewerBackground: '#1e1e1e',
                                        diffViewerColor: '#d4d4d4',
                                        addedBackground: '#1e3a1e',
                                        addedColor: '#4ec9b0',
                                        removedBackground: '#3a1e1e', 
                                        removedColor: '#f48771',
                                        wordAddedBackground: '#2ea04326',
                                        wordRemovedBackground: '#f8514926',
                                        addedGutterBackground: 'transparent',
                                        removedGutterBackground: 'transparent',
                                        gutterBackground: 'transparent',
                                        gutterBackgroundDark: 'transparent',
                                        highlightBackground: '#2a2d2e',
                                        highlightGutterBackground: 'transparent',
                                        codeFoldGutterBackground: 'transparent',
                                        codeFoldBackground: 'transparent',
                                        emptyLineBackground: '#1e1e1e',
                                        gutterColor: 'transparent',
                                        addedGutterColor: 'transparent',
                                        removedGutterColor: 'transparent',
                                        codeFoldContentColor: 'transparent',
                                        diffViewerTitleBackground: 'transparent',
                                        diffViewerTitleColor: 'transparent',
                                        diffViewerTitleBorderColor: 'transparent'
                                      }
                                    },
                                    diffContainer: {
                                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                                      fontSize: '10px',
                                      lineHeight: '1.3'
                                    },
                                    marker: {
                                      display: 'none'
                                    },
                                    gutter: {
                                      display: 'none'
                                    },
                                    codeFold: {
                                      display: 'none'
                                    },
                                    codeFoldGutter: {
                                      display: 'none'
                                    }
                                  }}
                                  useDarkTheme={true}
                                  hideLineNumbers={true}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Version List */}
                        {metadata?.versions ? (
                          <div className="space-y-3 sm:space-y-4">
                            {[...metadata.versions].reverse().map((version, index) => (
                              <div 
                                key={version.version}
                                className={`border rounded-lg p-3 sm:p-4 ${version.version === metadata.current_version 
                                    ? 'border-primary bg-primary/5' 
                                    : 'border-border'}`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-2 gap-2 sm:gap-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={version.version === metadata.current_version ? "default" : "secondary"}>
                                      v{version.version}
                                    </Badge>
                                    {version.version === metadata.current_version && (
                                      <Badge variant="outline" className="text-xs">Current</Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-2 sm:gap-3">
                                      <span className="flex items-center gap-1">
                                        <FileCode className="w-3 h-3" />
                                        {version.line_count || 'N/A'} lines
                                      </span>
                                      <span>
                                        {formatFileSize(version.size)}
                                      </span>
                                    </div>
                                    
                                    {/* Comparison Buttons */}
                                    <div className="flex items-center gap-1">
                                      {/* Compare with Previous */}
                                      {index < metadata.versions.length - 1 && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            const previousVersion = [...metadata.versions].reverse()[index + 1];
                                            compareVersions(previousVersion.version, version.version);
                                          }}
                                          className="gap-1 text-xs px-2 py-1 h-7"
                                        >
                                          <GitCommit className="w-3 h-3" />
                                          <span className="hidden sm:inline">vs Prev</span>
                                          <span className="sm:hidden">Prev</span>
                                        </Button>
                                      )}
                                      
                                      {/* Compare with Current */}
                                      {version.version !== metadata.current_version && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => compareVersions(version.version, metadata.current_version)}
                                          className="gap-1 text-xs px-2 py-1 h-7"
                                        >
                                          <GitCommit className="w-3 h-3" />
                                          <span className="hidden sm:inline">vs Curr</span>
                                          <span className="sm:hidden">Curr</span>
                                        </Button>
                                      )}
                                      
                                      {/* NEW: Create New App from This Version */}
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => createNewAppFromVersion(version.version)}
                                        disabled={creatingNewApp}
                                        className="gap-1 text-xs px-2 py-1 h-7"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span className="hidden sm:inline">New App</span>
                                        <span className="sm:hidden">New</span>
                                      </Button>
                                    </div>

                                    {/* Switch Version Button */}
                                    {version.version !== metadata.current_version && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleVersionSwitch(version.version)}
                                        disabled={switchingVersion !== null}
                                        className="gap-1 text-xs px-2 py-1 h-7"
                                      >
                                        {switchingVersion === version.version ? (
                                          <>
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span className="hidden sm:inline">Switching...</span>
                                            <span className="sm:hidden">...</span>
                                          </>
                                        ) : (
                                          <>
                                            <RefreshCw className="w-3 h-3" />
                                            <span className="hidden sm:inline">Switch</span>
                                            <span className="sm:hidden">Switch</span>
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                
                                <h4 className="font-medium text-sm mb-1">
                                  {version.commit_summary}
                                </h4>
                                
                                <p className="text-xs text-muted-foreground mb-2 sm:mb-3 line-clamp-2 sm:line-clamp-3">
                                  {version.user_request}
                                </p>
                                
                                <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(version.timestamp)}
                                  </div>
                                  {version.edit_type && (
                                    <div className="flex items-center gap-1">
                                      <GitBranch className="w-3 h-3" />
                                      {version.edit_type}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground py-8">
                            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No version history available</p>
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="editor" className="h-full m-0">
                  <div className="h-full flex flex-col bg-background border rounded-lg">
                    {/* Chat-like header */}
                    <div className="px-3 py-2 border-b bg-muted/40 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* NEW: Tool Selection Dropdown for Artifact Editor */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1 text-xs h-7 px-2" disabled={isEditing || toolsLoading}>
                                <ZapIcon className="w-3 h-3" />
                                Tools ({selectedEditorTools.length})
                                {toolsLoading && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-h-60 overflow-y-auto w-56">
                              <DropdownMenuLabel>Allowed Tools</DropdownMenuLabel>
                              {/* Bulk selection controls */}
                              <DropdownMenuItem className="text-xs font-medium" onSelect={(e) => { e.preventDefault(); setSelectedEditorTools(availableTools.map(t => t.name)); }}>
                                Select All ({availableTools.length})
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs font-medium" onSelect={(e) => { e.preventDefault(); setSelectedEditorTools([]); }}>
                                Deselect All
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {availableTools.length > 0 ? availableTools.map(tool => (
                                <DropdownMenuItem key={tool.name} className="gap-2" onSelect={(e) => { e.preventDefault(); }}>
                                  <input
                                    type="checkbox"
                                    className="flex-shrink-0 h-3 w-3 accent-primary mr-1"
                                    checked={selectedEditorTools.includes(tool.name)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setSelectedEditorTools(prev => {
                                        if (checked) { return [...prev, tool.name]; }
                                        return prev.filter(n => n !== tool.name);
                                      });
                                    }}
                                  />
                                  <TooltipProvider delayDuration={300}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-xs truncate cursor-default">{tool.name}</span>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" align="start" className="max-w-xs">
                                        <p className="text-xs">{tool.description || "No description"}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </DropdownMenuItem>
                              )) : <DropdownMenuItem disabled className="text-xs text-muted-foreground">No tools available</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {isEditing && (
                            <Badge variant="secondary" className="gap-1">
                              <Activity className="w-3 h-3 animate-pulse" />
                              {editStatus}
                            </Badge>
                          )}
                          {!isEditing && !createMode && (
                            <Badge variant="outline" className="text-xs">
                              Editor
                            </Badge>
                          )}
                        </div>
                        
                        {/* NEW: Query Content Preview Button */}
                        {!createMode && editorPrompt.trim() && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              generateQueryPreview();
                              setShowQueryContent(true);
                            }}
                            className="gap-2 text-xs"
                            disabled={isEditing || isGeneratingPreview}
                          >
                            {isGeneratingPreview ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3" />
                                View Full Query
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col min-h-0">
                      {/* Chat messages area */}
                      <div className="flex-1 min-h-0 overflow-auto p-3">
                        {/* Streaming display */}
                        {(isEditing || sampleCallPairs.length > 0) ? (
                          <div className="space-y-3">
                            {/* LLM Sampling Display - Chat app style */}
                            {sampleCallPairs.length > 0 && (
                              <div className="space-y-3">
                                {sampleCallPairs.map((pair, index) => (
                                  <div key={pair.id} className="space-y-2">
                                    {pair.thoughts && (
                                      <details className="rounded-lg border border-border bg-muted/20 shadow-sm">
                                        <summary className="cursor-pointer p-3 list-none flex items-center justify-between text-sm font-medium text-muted-foreground hover:bg-muted/40 rounded-t-lg">
                                          <div className="flex items-center">
                                            <Brain className="w-4 h-4 mr-2" />
                                            <span className="italic">AST. thinking (#{index + 1})</span>
                                          </div>
                                          <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                                        </summary>
                                        <div className="p-3 border-t border-border bg-background rounded-b-lg">
                                          <div className="prose prose-sm italic text-muted-foreground dark:prose-invert">
                                            <MarkdownRenderer 
                                              content={pair.thoughts} 
                                              className="prose-xs" 
                                            />
                                          </div>
                                        </div>
                                      </details>
                                    )}
                                    {pair.output && (
                                      (() => {
                                        // Check if this is a tool call output
                                        const isToolCall = pair.output.startsWith('🔧 Calling tool:');
                                        const isToolResult = pair.output.startsWith('✅ Web app') || pair.output.startsWith('❌');
                                        
                                        if (isToolCall) {
                                          // Extract tool name for display
                                          const toolNameMatch = pair.output.match(/🔧 Calling tool: (\w+)/);
                                          const toolName = toolNameMatch ? toolNameMatch[1] : 'Unknown';
                                          
                                          return (
                                            <details className="my-2 rounded-lg border border-border bg-muted/20 shadow-sm">
                                              <summary className="cursor-pointer p-3 list-none flex items-center justify-between text-sm font-medium text-foreground hover:bg-muted/40 rounded-t-lg">
                                                <div className="flex items-center">
                                                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                                  <span className="ml-2 font-mono text-xs">🔧 {toolName}</span>
                                                </div>
                                                <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                                              </summary>
                                              <div className="p-3 border-t border-border bg-background rounded-b-lg">
                                                <div className="prose dark:prose-invert w-full max-w-full min-w-0" 
                                                     style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                  <MarkdownRenderer 
                                                    content={pair.output} 
                                                    className="prose-xs" 
                                                  />
                                                </div>
                                              </div>
                                            </details>
                                          );
                                        } else {
                                          // Regular output (including tool results)
                                          return (
                                            <div className="w-full self-start py-1 text-foreground">
                                              <div className={`prose dark:prose-invert w-full max-w-full min-w-0 ${
                                                pair.lastChunkType === 'user_prompt' ? 'bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg' : ''
                                              }`} 
                                                   style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                <MarkdownRenderer 
                                                  content={pair.output} 
                                                  className="prose-xs" 
                                                />
                                              </div>
                                            </div>
                                          );
                                        }
                                      })()
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-center">
                            <div className="text-muted-foreground">
                              <Edit3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p className="text-sm">
                                {createMode 
                                  ? "Describe what you want to build and I'll create it for you"
                                  : artifactType === "mcp_server"
                                  ? "Describe changes to the MCP server..."
                                  : "Tell me what changes you'd like to make" 
                                }.
                                <br/>
                                <span className="text-xs">(Conversation will be persisted in this session)</span>
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Chat input area at bottom */}
                      <div className="flex-shrink-0 p-3 border-t bg-muted/40">
                        {/* Attachment Section */}
                        {(selectedFiles.length > 0 || attachmentUrls.length > 0 || uploadError) && (
                          <div className="mb-3 space-y-2">
                            {/* Upload Error */}
                            {uploadError && (
                              <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                  Upload failed: {uploadError}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setUploadError(null)}
                                    className="ml-2 h-6"
                                  >
                                    Dismiss
                                  </Button>
                                </AlertDescription>
                              </Alert>
                            )}

                            {/* Selected Files (before upload) */}
                            {selectedFiles.length > 0 && (
                              <div className="text-xs text-muted-foreground bg-background rounded-md p-2 border">
                                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                                <Button
                                  type="button"
                                  variant="default"
                                  size="sm"
                                  onClick={uploadSelectedFiles}
                                  disabled={uploadingFiles || isEditing}
                                  className="gap-1 ml-2 h-6 text-xs"
                                >
                                  {uploadingFiles ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-3 h-3" />
                                      Upload
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}

                            {/* Uploaded Attachments */}
                            {attachmentUrls.length > 0 && (
                              <div className="text-xs text-muted-foreground bg-background rounded-md p-2 border">
                                {attachmentUrls.length} file{attachmentUrls.length > 1 ? 's' : ''} attached
                              </div>
                            )}
                          </div>
                        )}

                        {/* Chat input */}
                        <div className="flex items-center bg-background border border-input rounded-xl shadow-sm p-2 focus-within:ring-2 focus-within:ring-ring">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isEditing}
                            className="text-muted-foreground hover:text-foreground h-8 w-8 flex-shrink-0"
                          >
                            <Paperclip className="w-4 h-4" />
                          </Button>
                          
                          <textarea
                            id="editor-prompt"
                            value={editorPrompt}
                            onChange={(e) => setEditorPrompt(e.target.value)}
                            placeholder={createMode 
                              ? "Describe what you want to build..."
                              : artifactType === "mcp_server"
                              ? "Edit MCP server: add a tool, modify parameters..."
                              : "What would you like to change?"
                            }
                            className="flex-grow p-2 bg-transparent focus:outline-none border-0 focus:ring-0 placeholder:text-muted-foreground text-base resize-none min-h-8 max-h-32"
                            disabled={isEditing}
                            rows={1}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                            }}
                          />
                          
                          <Button 
                            onClick={handleEditorSubmit}
                            disabled={!editorPrompt.trim() || isEditing}
                            className="gap-2 h-8 px-3 flex-shrink-0"
                            size="sm"
                          >
                            {isEditing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        
                        {/* Hidden file input */}
                        <input
                          type="file"
                          multiple
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                          accept="image/*,.heic,.heif,application/pdf,.txt,.md,.py,.js,.html,.css,.json,.csv"
                        />
                        
                        {/* Error handling */}
                        {error && editStatus === "error" && (
                          <Alert variant="destructive" className="mt-3">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Edit Failed</AlertTitle>
                            <AlertDescription className="mt-2 text-xs">
                              {error}
                              <div className="flex gap-2 mt-3">
                                <Button variant="outline" size="sm" onClick={retryEdit}>
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Retry
                                </Button>
                                <Button variant="outline" size="sm" onClick={simplifyPrompt}>
                                  <Edit3 className="w-3 h-3 mr-1" />
                                  Simplify Request
                                </Button>
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
        )}
      </DialogContent>
      
      {/* NEW: Query Content Preview Dialog */}
      <Dialog open={showQueryContent} onOpenChange={setShowQueryContent}>
        <DialogContent className="max-w-4xl h-[80vh] w-full flex flex-col overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Query Content Preview
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This is the exact content that will be sent to the AI when you submit your edit request.
              <br />
              <strong>✅ Guaranteed identical:</strong> Uses the same functions as the actual submission.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden p-6">
            <ScrollArea className="h-full">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Full Query Content</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {queryContentPreview.length.toLocaleString()} characters
                    </Badge>
                                         <Button
                       variant="outline"
                       size="sm"
                       onClick={generateQueryPreview}
                       disabled={isGeneratingPreview || !editorPrompt.trim()}
                       className="gap-2 text-xs"
                     >
                       <RefreshCw className="w-3 h-3" />
                       Refresh
                     </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={async () => {
                         // Verify that preview matches what would actually be sent
                         const currentContent = await getCurrentVersionContent();
                         const actualQuery = buildQueryContext(editorPrompt, currentContent);
                         const isIdentical = actualQuery === queryContentPreview;
                         alert(isIdentical 
                           ? "✅ Verified: Preview is identical to what will be sent!" 
                           : "⚠️ Warning: Preview differs from what would be sent. Try refreshing."
                         );
                       }}
                       disabled={isGeneratingPreview || !queryContentPreview}
                       className="gap-2 text-xs"
                     >
                       <CheckCircle className="w-3 h-3" />
                       Verify
                     </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => copyToClipboard(queryContentPreview, 'query-preview')}
                       disabled={!queryContentPreview || isGeneratingPreview}
                       className="gap-2 text-xs"
                     >
                       {copiedStates['query-preview'] ? (
                         <>
                           <Check className="w-3 h-3" />
                           Copied
                         </>
                       ) : (
                         <>
                           <Copy className="w-3 h-3" />
                           Copy
                         </>
                       )}
                     </Button>
                  </div>
                </div>
                
                <div className="border rounded-lg bg-muted/20 p-4">
                  {isGeneratingPreview ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Generating query preview...</span>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words overflow-x-auto">
                      {queryContentPreview || "No content to preview. Enter a prompt and try again."}
                    </pre>
                  )}
                </div>
                
                {queryContentPreview && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Note:</strong> This preview shows the complete context that will be sent to the AI, including:</p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Artifact metadata (version info, recent changes)</li>
                      <li>Complete HTML source code of the current version</li>
                      <li>Your edit request</li>
                      {attachmentUrls.length > 0 && <li>References to {attachmentUrls.length} attached file(s)</li>}
                    </ul>
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md p-2 mt-3">
                      <p className="text-green-800 dark:text-green-200 font-medium">
                        ✅ <strong>Accuracy Guarantee:</strong> This preview uses the exact same `getCurrentVersionContent()` and `buildQueryContext()` functions as the actual submission. What you see here is precisely what the AI will receive.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export function ArtifactsList({
  userNumber = "+17145986105",
  trigger,
  open,
  onOpenChange,
  onSelectApp
}: ArtifactsListProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateEditor, setShowCreateEditor] = useState(false);
  const [createArtifactType, setCreateArtifactType] = useState<"web_app" | "pdf_document" | "mcp_server">("web_app");
  const [deletingApp, setDeletingApp] = useState<string | null>(null);

  const loadArtifacts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch web apps, PDF documents, and MCP servers in parallel
      const responses = await Promise.all([
        fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: "list_web_apps",
            arguments: {
              user_number: userNumber,
              limit: 50
            }
          })
        }),
        fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: "list_pdf_documents",
            arguments: {
              user_number: userNumber,
              limit: 50
            }
          })
        }),
        fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: "list_mcp_servers",
            arguments: {
              user_number: userNumber,
              limit: 50
            }
          })
        })
      ]);

      const [webAppsResponse, pdfDocsResponse, mcpServersResponse] = responses;

      if (!webAppsResponse.ok) {
        throw new Error(`Failed to load web apps: ${webAppsResponse.status}`);
      }
      if (!pdfDocsResponse.ok) {
        throw new Error(`Failed to load PDF documents: ${pdfDocsResponse.status}`);
      }
      if (!mcpServersResponse.ok) { 
        throw new Error(`Failed to load MCP servers: ${mcpServersResponse.status}`);
      }

      const results = await Promise.all(responses.map(res => res.json()));
      const [webAppsResult, pdfDocsResult, mcpServersResult] = results;

      if (webAppsResult.error) {
        throw new Error(webAppsResult.error);
      }
      if (pdfDocsResult.error) {
        throw new Error(pdfDocsResult.error);
      }
      if (mcpServersResult.error) {
        throw new Error(mcpServersResult.error);
      }

      const webAppsParsed = typeof webAppsResult.result === 'string' 
        ? JSON.parse(webAppsResult.result) 
        : webAppsResult.result;

      const pdfDocsParsed = typeof pdfDocsResult.result === 'string' 
        ? JSON.parse(pdfDocsResult.result) 
        : pdfDocsResult.result;

      const mcpServersParsed = typeof mcpServersResult.result === 'string' 
        ? JSON.parse(mcpServersResult.result) 
        : mcpServersResult.result;

      // Convert web apps to unified artifact format
      const webAppArtifacts: Artifact[] = (webAppsParsed.web_apps || []).map((app: any) => ({
        name: app.app_name,
        type: "web_app" as const,
        url: app.url,
        current_version: app.current_version,
        created_at: app.created_at,
        last_updated: app.last_updated,
        description: app.description,
        total_versions: app.total_versions,
        latest_commit_summary: app.latest_commit_summary,
        line_count: app.line_count,
        size: app.size
      }));

      // Convert PDF documents to unified artifact format
      const pdfArtifacts: Artifact[] = (pdfDocsParsed.pdf_documents || []).map((doc: any) => ({
        name: doc.doc_name,
        type: "pdf_document" as const,
        url: doc.pdf_url,
        current_version: doc.current_version,
        created_at: doc.created_at,
        last_updated: doc.last_updated,
        description: doc.description,
        total_versions: doc.total_versions,
        latest_commit_summary: doc.latest_commit_summary,
        pdf_size: doc.pdf_size
      }));

      // Convert MCP servers to unified artifact format
      const mcpServerArtifacts: Artifact[] = (mcpServersParsed.mcp_servers || []).map((server: any) => ({
        name: server.server_name,
        type: "mcp_server" as const,
        url: server.server_url, // This will be an mcp:// URL, might need adjustment for UI
        current_version: server.current_version,
        created_at: server.created_at,
        last_updated: server.last_updated,
        description: server.description,
        total_versions: server.total_versions,
        latest_commit_summary: server.latest_commit_summary,
        // MCP servers don't have line_count/size in the same way yet, can add later
      }));

      // Combine and sort by last_updated (most recent first)
      const allArtifacts = [...webAppArtifacts, ...pdfArtifacts, ...mcpServerArtifacts];
      allArtifacts.sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());

      setArtifacts(allArtifacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artifacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadArtifacts();
    }
  }, [open, userNumber]);

  const handleArtifactSelect = (artifact: Artifact) => {
    if (onSelectApp) {
      onSelectApp(artifact.name, artifact.url, artifact.type);
    }
    if (onOpenChange) {
      onOpenChange(false);
    }
  };

  const handleDeleteApp = async (appName: string, artifactTypeToDelete: "web_app" | "pdf_document" | "mcp_server", event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click
    
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete \"${appName}\"?\n\nThis action cannot be undone. All versions and history will be permanently lost.`
    );
    
    if (!confirmed) return;
    
    setDeletingApp(appName);
    
    try {
      let deleteToolName: string;
      let nameKey: string;

      if (artifactTypeToDelete === "mcp_server") {
        deleteToolName = "delete_mcp_server";
        nameKey = "server_name";
      } else if (artifactTypeToDelete === "pdf_document") {
        // deleteToolName = "delete_pdf_document"; // Assuming this tool exists
        // nameKey = "doc_name";
        // For now, let's disable delete for PDF until tool is confirmed
        alert("PDF document deletion is not yet implemented.");
        setDeletingApp(null);
        return;
      } else { // Default to web_app
        deleteToolName = "delete_web_app";
        nameKey = "app_name";
      }

      const response = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: deleteToolName,
          arguments: {
            [nameKey]: appName,
            user_number: userNumber,
            confirm: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to delete app: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      const parsedResult = typeof result.result === 'string' 
        ? JSON.parse(result.result) 
        : result.result;

      if (parsedResult.status === "success") {
        // Remove the artifact from the local state
        setArtifacts(prev => prev.filter(artifact => artifact.name !== appName));
        
        // Show success message
        alert(`Artifact "${appName}" has been successfully deleted.`);
      } else {
        throw new Error(parsedResult.message || "Failed to delete artifact");
      }
      
    } catch (error) {
      console.error('Error deleting artifact:', error);
      alert(`Failed to delete "${appName}": ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeletingApp(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  // Function to open the create editor with selected type
  const createNewArtifact = (type: "web_app" | "pdf_document" | "mcp_server") => {
    setCreateArtifactType(type);
    setShowCreateEditor(true);
  };

  const handleCreateEditorClose = (open: boolean) => {
    setShowCreateEditor(open);
    if (!open) {
      // Reload artifacts list when editor closes in case a new artifact was created
      loadArtifacts();
    }
  };

  // Handle successful artifact creation
  const handleArtifactCreated = (artifactName: string, artifactUrl: string) => {
    console.log("[ArtifactsList] Artifact created successfully:", artifactName, artifactUrl);
    
    // Close the create editor
    setShowCreateEditor(false);
    
    // Reload the artifacts list
    loadArtifacts();
    
    // Open the newly created artifact in edit mode
    if (onSelectApp) {
      setTimeout(() => {
        onSelectApp(artifactName, artifactUrl, createArtifactType);
      }, 500);
    }
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <FileCode className="w-4 h-4" />
      My Artifacts
    </Button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        {!trigger && <DialogTrigger asChild>{defaultTrigger}</DialogTrigger>}
        
        <DialogContent className="max-w-4xl h-[80vh] sm:max-w-4xl sm:h-[80vh] w-full h-full max-h-screen sm:max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-2 sm:px-6 sm:py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileCode className="w-4 h-4 sm:w-5 sm:h-5" />
              My Artifacts
              <div className="ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" size="sm" className="gap-2">
                      <Plus className="w-4 h-4" />
                      Create New
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Choose Artifact Type</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => createNewArtifact("web_app")}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Web Application
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => createNewArtifact("pdf_document")}>
                      <FileCode className="w-4 h-4 mr-2" />
                      PDF Document
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => createNewArtifact("mcp_server")}>
                      <Code className="w-4 h-4 mr-2" />
                      MCP Server
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <p className="text-muted-foreground">Loading your artifacts...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-destructive mb-4">{error}</p>
                  <Button onClick={() => { setError(null); loadArtifacts(); }} variant="outline" className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <Tabs defaultValue="web_apps" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-3 mx-4 sm:mx-6 mt-2">
                  <TabsTrigger value="web_apps" className="gap-2 text-xs sm:text-sm">
                    <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Web Apps</span>
                    <span className="sm:hidden">Apps</span>
                    <Badge variant="secondary" className="text-xs ml-1">
                      {artifacts.filter(a => a.type === "web_app").length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="pdf_documents" className="gap-2 text-xs sm:text-sm">
                    <FileCode className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">PDF Docs</span>
                    <span className="sm:hidden">PDFs</span>
                    <Badge variant="secondary" className="text-xs ml-1">
                      {artifacts.filter(a => a.type === "pdf_document").length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="mcp_servers" className="gap-2 text-xs sm:text-sm">
                    <Code className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">MCP Servers</span>
                    <span className="sm:hidden">MCP</span>
                    <Badge variant="secondary" className="text-xs ml-1">
                      {artifacts.filter(a => a.type === "mcp_server").length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-hidden px-4 sm:px-6 pb-4 sm:pb-6">
                  <TabsContent value="web_apps" className="h-full m-0 mt-4">
                    <ArtifactTypeSection
                      artifacts={artifacts.filter(a => a.type === "web_app")}
                      type="web_app"
                      emptyTitle="No Web Apps Yet"
                      emptyDescription="You haven't created any web applications yet."
                      emptyHint="Ask the AI to create a web app for you to get started!"
                      onSelect={handleArtifactSelect}
                      onDelete={handleDeleteApp}
                      deletingApp={deletingApp}
                      formatDate={formatDate}
                    />
                  </TabsContent>

                  <TabsContent value="pdf_documents" className="h-full m-0 mt-4">
                    <ArtifactTypeSection
                      artifacts={artifacts.filter(a => a.type === "pdf_document")}
                      type="pdf_document"
                      emptyTitle="No PDF Documents Yet"
                      emptyDescription="You haven't created any PDF documents yet."
                      emptyHint="Ask the AI to create a PDF document for you to get started!"
                      onSelect={handleArtifactSelect}
                      onDelete={handleDeleteApp}
                      deletingApp={deletingApp}
                      formatDate={formatDate}
                    />
                  </TabsContent>

                  <TabsContent value="mcp_servers" className="h-full m-0 mt-4">
                    <ArtifactTypeSection
                      artifacts={artifacts.filter(a => a.type === "mcp_server")}
                      type="mcp_server"
                      emptyTitle="No MCP Servers Yet"
                      emptyDescription="You haven't created any MCP servers yet."
                      emptyHint="Ask the AI to create an MCP server for you to get started!"
                      onSelect={handleArtifactSelect}
                      onDelete={handleDeleteApp}
                      deletingApp={deletingApp}
                      formatDate={formatDate}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Create New App Editor */}
      <ArtifactEditor
        artifactType={createArtifactType}
        artifactName="new_artifact" // Placeholder name
        artifactUrl="" // Not needed in create mode
        userNumber={userNumber}
        open={showCreateEditor}
        onOpenChange={handleCreateEditorClose}
        createMode={true}
        onAppCreated={handleArtifactCreated} // NEW: Pass the callback
      />
    </>
  ); 
}