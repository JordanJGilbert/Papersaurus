"use client";

import React, { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Menu, Lock, Paperclip, ArrowUp, MapPin, Loader2, Edit3, ExternalLink, Settings, Bot, Zap, Sparkles } from "lucide-react";
import Link from "next/link";
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { toast } from "sonner";
import ToolCallDisplay from "@/components/ToolCallDisplay";
import MapDisplay, { defaultTheme, nightTheme } from "@/components/MapDisplay";
import DirectionsSteps from "@/components/DirectionsSteps";
import ImageDisplay from "@/components/ImageDisplay";
import { useTheme } from "next-themes";
import { useContentPreviews } from "@/hooks/useContentPreviews";
import ContentPreview from "@/components/ContentPreview";
import { extractPreviewFromToolCall, shouldExtractPreview } from "@/utils/previewExtractors";
import ArtifactEditor, { ArtifactsList } from "@/components/ArtifactEditor";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Ensure marked runs synchronously for this page too, if not already global
marked.setOptions({ async: false });

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5001'; // Default to localhost:5001

interface ToolCallData {
  call_id: string;
  name: string;
  arguments: string;
  result?: string;
  status?: "Pending..." | "Completed" | "Error" | "Streaming...";
  is_error?: boolean;
  is_partial?: boolean;
  sampleCallPairs?: Array<{ id: string; thoughts?: string; output?: string; }>;
}

// NEW: Define a type for individual parts of a message
type MessagePart =
  | { type: "text"; id: string; content: string }
  | { type: "tool_call"; id: string; toolCall: ToolCallData }
  | { type: "thought_summary"; id: string; content: string };

interface Message {
  id: string;
  sender: "user" | "bot";
  parts: MessagePart[]; // REPLACES content and tool_calls
  timestamp: number;
  thinking?: boolean;
  is_error_message?: boolean; // To flag bot messages that are errors
  showMapToggleForThisMessage?: boolean; // <-- New flag
  directionsData?: any;
  showWebAppForThisMessage?: boolean; // <-- New flag for web apps
  webAppUrl?: string; // <-- Store web app URL
  showImagesForThisMessage?: boolean; // <-- New flag for generated images
  generatedImageUrls?: string[]; // <-- Store generated image URLs
}

// Add ToolMeta type for available tools
interface ToolMeta {
  name: string;
  description: string;
}

export default function ChatPage() {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]); // <-- New state for selected files
  const fileInputRef = useRef<HTMLInputElement>(null); // <-- Ref for file input
  const [fileProcessingStatus, setFileProcessingStatus] = useState<string | null>(null); // <-- Status for file processing
  const [isPasteReady, setIsPasteReady] = useState(false); // <-- NEW: State for paste readiness indicator
  const [showInitialView, setShowInitialView] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref for the ScrollArea's viewport element
  const [status, setStatus] = useState('Ready');
  const [apiSender] = useState('+17145986105');
  const [currentUserLocation, setCurrentUserLocation] = useState<string | null>(null);
  const [sendLocation, setSendLocation] = useState(false); // New state for toggle
  const [directionsData, setDirectionsData] = useState<any | null>(null);
  const [googleMapsApiKey] = useState(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "");
  const [mapDisplayKey, setMapDisplayKey] = useState(0); // Key for forcing MapDisplay re-render
  const [showTraffic, setShowTraffic] = useState(false); // State for traffic layer
  const [isMapSectionVisible, setIsMapSectionVisible] = useState(false); // <-- State for map section visibility
  const [availableTools, setAvailableTools] = useState<ToolMeta[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const { theme: appTheme } = useTheme(); // Get current application theme

  // NEW: Add content previews hook
  const { 
    upsertPreview, 
    updatePreview, 
    getPreviewsForMessage, 
    removePreview 
  } = useContentPreviews();

  // Define available models as an array of objects for the dropdown
  const modelOptions = [
    { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite-preview-06-17", label: "Gemini 2.5 Flash Lite" },
    { value: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
    // Add more models here in the future
    // { value: "gpt-4.1-2025-04-14", label: "GPT-4.1" }, 
  ];
  const [selectedModel, setSelectedModel] = useState(modelOptions[1].value); // Default to the second model (Flash Lite)

  // NEW: Define available system prompts
  const systemPromptOptions = [
    { value: "default", label: "Default", description: "Standard AI assistant" },
    { value: "artifact_editor", label: "Artifact Editor", description: "Specialized for creating/editing web apps" },
    { value: "professional", label: "Professional", description: "Formal business communication" },
    { value: "web_chat", label: "Web Chat", description: "Casual conversational style" },
  ];
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState(systemPromptOptions[0].value); // Default to "default"

  // NEW: Helper function to process tool calls for preview extraction
  const processToolCallForPreview = (toolCall: ToolCallData, messageId: string) => {
    console.log(`[PAGE.TSX] Processing tool call for preview: ${toolCall.name}, status: ${toolCall.status}, call_id: ${toolCall.call_id}`);
    
    if (shouldExtractPreview(toolCall)) {
      const extractedPreview = extractPreviewFromToolCall(toolCall);
      console.log(`[PAGE.TSX] Extracted preview for tool ${toolCall.name}:`, extractedPreview);
      
      if (extractedPreview && extractedPreview.shouldShow) {
        console.log(`[PAGE.TSX] Upserting preview with id: ${extractedPreview.id}, type: ${extractedPreview.type}`);
        upsertPreview(
          extractedPreview.id,
          extractedPreview.type,
          extractedPreview.data,
          messageId,
          {
            name: toolCall.name,
            call_id: toolCall.call_id,
            status: toolCall.status,
          }
        );
      } else {
        console.log(`[PAGE.TSX] Preview extraction returned null or shouldShow=false for ${toolCall.name}`);
      }
    } else {
      console.log(`[PAGE.TSX] Tool ${toolCall.name} should not extract preview (status: ${toolCall.status})`);
    }
  };

  // Function to detect and convert HEIC files to JPEG
  const convertHeicToJpeg = async (file: File): Promise<File> => {
    const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                   file.name.toLowerCase().endsWith('.heif') || 
                   file.type === 'image/heic' || 
                   file.type === 'image/heif';

    if (!isHeic) {
      return file; // Return original file if not HEIC
    }

    try {
      console.log(`🔄 Converting HEIC file "${file.name}" to JPEG...`);
      
      // Dynamic import to avoid SSR issues
      const { default: heic2any } = await import('heic2any');
      
      // Try heic2any conversion
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.85,
      }) as Blob;
      
      // Create new filename with .jpg extension
      const originalName = file.name.replace(/\.(heic|heif)$/i, '');
      const newFileName = `${originalName}.jpg`;

      // Create new File object with converted blob
      const convertedFile = new File([convertedBlob], newFileName, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      });

      console.log(`✅ Successfully converted "${file.name}" to "${newFileName}" (${Math.round(convertedFile.size / 1024)}KB)`);
      return convertedFile;
      
    } catch (error) {
      console.warn(`⚠️ Frontend HEIC conversion failed for "${file.name}":`, error);
      
      // Try Canvas API fallback
      try {
        console.log(`🔄 Attempting Canvas API fallback for "${file.name}"...`);
        
        const imageBitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }
        
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        ctx.drawImage(imageBitmap, 0, 0);
        
        const canvasBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          }, 'image/jpeg', 0.85);
        });
        
        const originalName = file.name.replace(/\.(heic|heif)$/i, '');
        const newFileName = `${originalName}.jpg`;
        
        const convertedFile = new File([canvasBlob], newFileName, {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        });
        
        console.log(`✅ Canvas API fallback succeeded for "${file.name}" → "${newFileName}"`);
        return convertedFile;
        
      } catch (canvasError) {
        console.warn(`⚠️ Canvas API fallback also failed for "${file.name}":`, canvasError);
        
        // Final fallback: Upload HEIC file and let backend handle conversion
        console.log(`🔄 Will upload "${file.name}" for server-side conversion...`);
        
        // Mark this file for server-side conversion by adding a special property
        const fileWithConversionFlag = new File([file], file.name, {
          type: file.type || 'image/heic',
          lastModified: file.lastModified,
        });
        
        // Add a custom property to indicate this needs server-side conversion
        (fileWithConversionFlag as any).needsServerConversion = true;
        
        return fileWithConversionFlag;
      }
    }
  };

  const examplePrompts = [
    { title: "What are the advantages", detail: "of using Next.js?" },
    { title: "Write code to", detail: "demonstrate dijkstra\\'s algorithm" },
    { title: "Help me write an essay", detail: "about silicon valley" },
    { title: "What is the weather", detail: "in San Francisco?" },
  ];

  // Helper to ensure markdown block elements are properly spaced
  const normalizeFragment = (fragment: string, _prevContent: string): string => {
    // TEMPORARILY A PASS-THROUGH
    return fragment;
  };

  // NEW: Function to convert standalone image/video URLs to HTML elements
  const convertMediaUrls = (text: string): string => {
    // Common image extensions
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)(\?[^)\s"']*)?$/i;
    // Common video extensions  
    const videoExtensions = /\.(mp4|webm|ogg|mov|avi|wmv|flv|m4v)(\?[^)\s"']*)?$/i;
    
    // More comprehensive URL pattern that handles URLs in various contexts
    // This pattern looks for http/https URLs that are not already in markdown image/link format
    const urlPattern = /(?<!!\[)(?<!\]\()(?<!\[.*?\]\()https?:\/\/[^\s<>"'\]\)]+/g;
    
    let processedText = text.replace(urlPattern, (url) => {
      // Remove trailing punctuation that might not be part of the URL
      const cleanUrl = url.replace(/[.,;:!?)"']+$/, '');
      
      if (imageExtensions.test(cleanUrl)) {
        return `![Image](${cleanUrl})`;
      } else if (videoExtensions.test(cleanUrl)) {
        return `<video controls style="max-width: 100%; height: auto; max-height: 400px; border-radius: 0.375rem; margin: 0.5em auto; display: block;">
          <source src="${cleanUrl}" type="video/${cleanUrl.split('.').pop()?.split('?')[0] || 'mp4'}">
          Your browser does not support the video tag.
          <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">View video</a>
        </video>`;
      }
      
      return url; // Return original URL if not media
    });

    // Additional aggressive pattern to catch any URLs that might be in quotes or other contexts
    const aggressiveUrlPattern = /https?:\/\/[^\s<>"'\]\)\}]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|mp4|webm|ogg|mov|avi|wmv|flv|m4v)(\?[^\s<>"'\]\)\}]*)?/gi;
    
    processedText = processedText.replace(aggressiveUrlPattern, (url) => {
      // Check if this URL is already converted to markdown
      if (processedText.includes(`![Image](${url})`)) {
        return url;
      }
      const cleanUrl = url.replace(/[.,;:!?)"'\}]+$/, '');
      return `![Image](${cleanUrl})`;
    });
    
    return processedText;
  };

  const renderSanitizedMarkdown = (text: string): string => {
    // First convert standalone media URLs to proper markdown/HTML
    const textWithMedia = convertMediaUrls(text);
    
    // This function assumes it's running in a browser environment
    // due to the "use client" directive on the component and use of DOMPurify.
    // marked.parse is configured to run synchronously.
    const dirtyHtml = marked.parse(textWithMedia, { gfm: true, breaks: true }) as string;
    return DOMPurify.sanitize(dirtyHtml);
  };

  const getCurrentLocation = (): Promise<string> => {
    console.log("[PAGE.TSX] getCurrentLocation called");
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        console.error("[PAGE.TSX] Geolocation not supported");
        reject("Geolocation is not supported by your browser.");
        return;
      }
      
      const timeoutId = setTimeout(() => {
        console.error("[PAGE.TSX] Geolocation timeout");
        reject("Failed to get location: Timeout.");
      }, 10000); // 10 second timeout

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          const coords = `${position.coords.latitude},${position.coords.longitude}`;
          console.log("[PAGE.TSX] Geolocation success:", coords);
          setCurrentUserLocation(coords); // Update state here as well
          resolve(coords);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.error("[PAGE.TSX] Geolocation error:", error);
          let message = "Unable to retrieve your location. Please ensure location services are enabled.";
          switch(error.code) {
            case error.PERMISSION_DENIED:
              message = "Location permission denied. Please enable it in your browser settings.";
              break;
            case error.POSITION_UNAVAILABLE:
              message = "Location information is unavailable.";
              break;
            case error.TIMEOUT:
              message = "Request to get user location timed out."; // This case might be preempted by our own setTimeout
              break;
          }
          reject(message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 } // Added options
      );
    });
  };
  
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      
      // Check if any files are HEIC
      const heicFiles = files.filter(file => 
        file.name.toLowerCase().endsWith('.heic') || 
        file.name.toLowerCase().endsWith('.heif') || 
        file.type === 'image/heic' || 
        file.type === 'image/heif'
      );
      
      if (heicFiles.length > 0) {
        setFileProcessingStatus(`Converting ${heicFiles.length} HEIC file${heicFiles.length > 1 ? 's' : ''} to JPEG...`);
      }
      
      try {
        // Convert any HEIC files to JPEG
        const convertedFiles = await Promise.all(
          files.map(file => convertHeicToJpeg(file))
        );
        
        // Check if any files need server-side conversion
        const serverConversionFiles = convertedFiles.filter(file => (file as any).needsServerConversion);
        
        if (serverConversionFiles.length > 0) {
          setFileProcessingStatus(`📤 Sending ${serverConversionFiles.length} HEIC file${serverConversionFiles.length > 1 ? 's' : ''} for server-side conversion...`);
        } else {
          setFileProcessingStatus(null); // Clear status when done
        }
        
        setSelectedFiles(prevFiles => [...prevFiles, ...convertedFiles]);
      } catch (error) {
        console.error('Error processing selected files:', error);
        
        // Show user-friendly error message
        if (error instanceof Error && error.message.includes('Unable to convert HEIC')) {
          setFileProcessingStatus(`❌ HEIC conversion failed. Please try a different image format.`);
          setTimeout(() => setFileProcessingStatus(null), 5000);
        } else {
          // Fall back to adding original files if conversion fails
          setSelectedFiles(prevFiles => [...prevFiles, ...files]);
          setFileProcessingStatus(null); // Clear status on error
        }
      }
      
      event.target.value = ''; // Reset file input to allow selecting the same file again
    }
  };

  const removeSelectedFile = (fileNameToRemove: string) => {
    setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileNameToRemove));
  };

  // NEW: Handle clipboard paste events for images
  // Supports pasting images from:
  // - Screenshots (Cmd/Ctrl + Shift + 4 on Mac, Print Screen on Windows)
  // - Copied images from web browsers
  // - Images copied from image editing software
  // - Images copied from file managers
  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    
    // Check all clipboard items for images
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Handle image files
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          // Create a more descriptive filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const extension = item.type.split('/')[1] || 'png';
          const fileName = `pasted-image-${timestamp}.${extension}`;
          
          // Create a new File object with a proper name
          const namedFile = new File([file], fileName, {
            type: file.type,
            lastModified: file.lastModified,
          });
          
          imageFiles.push(namedFile);
          console.log(`📋 Pasted image: ${fileName} (${Math.round(file.size / 1024)}KB)`);
        }
      }
    }

    // Process pasted images if any were found
    if (imageFiles.length > 0) {
      event.preventDefault(); // Prevent default paste behavior
      
      try {
        setFileProcessingStatus(`Processing ${imageFiles.length} pasted image${imageFiles.length > 1 ? 's' : ''}...`);
        
        // Convert any HEIC files (though rare from clipboard)
        const convertedFiles = await Promise.all(
          imageFiles.map(file => convertHeicToJpeg(file))
        );
        
        setSelectedFiles(prevFiles => [...prevFiles, ...convertedFiles]);
        setFileProcessingStatus(null);
        
        // Show success toast
        toast.success(`Added ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} from clipboard`, {
          description: `${imageFiles.map(f => f.name).join(', ')}`
        });
        
      } catch (error) {
        console.error('Error processing pasted images:', error);
        setFileProcessingStatus(null);
        toast.error("Failed to process pasted images", {
          description: error instanceof Error ? error.message : "Unknown error occurred"
        });
      }
    }
  }, [convertHeicToJpeg, setFileProcessingStatus, setSelectedFiles]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Get data part after comma
      };
      reader.onerror = error => reject(error);
    });
  };

  // NEW: Upload files immediately and get URLs
  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Check if this file needs server-side HEIC conversion
      const needsServerConversion = (file as any).needsServerConversion;
      if (needsServerConversion) {
        formData.append('convert_heic', 'true');
        console.log(`📤 Uploading "${file.name}" for server-side HEIC conversion...`);
      }
      
      try {
        const response = await fetch(`${BACKEND_API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Log server-side HEIC conversion if it occurred
        if (result.converted_from_heic) {
          console.log(`✅ Server converted HEIC file "${result.original_filename}" to JPEG: "${result.filename}"`);
        }
        
        return result.url; // Backend should return { url: "..." }
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        throw error;
      }
    });
    
    return Promise.all(uploadPromises);
  };

  const handleSend = async (e?: FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (e && typeof (e as FormEvent<HTMLFormElement>).preventDefault === 'function') {
      (e as FormEvent<HTMLFormElement>).preventDefault();
    }
    
    let currentMessageText = userInput.trim(); // Use a mutable variable for message text
    if (!currentMessageText && selectedFiles.length === 0) return; // Return if no text and no files

    // --- NEW: Upload files immediately and get URLs ---
    let attachmentUrls: string[] = [];
    if (selectedFiles.length > 0) {
      try {
        setStatus('Uploading files...');
        toast.loading(`Uploading ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}...`, {
          id: 'file-upload'
        });
        attachmentUrls = await uploadFiles(selectedFiles);
        console.log('Files uploaded successfully:', attachmentUrls);
        toast.success(`Successfully uploaded ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`, {
          id: 'file-upload'
        });
      } catch (error) {
        console.error('File upload failed:', error);
        setStatus('Ready');
        // Show error to user with toast instead of inline message
        toast.error("Upload failed. Please try again.", {
          id: 'file-upload',
          description: error instanceof Error ? error.message : "Unknown error occurred"
        });
        return;
      }
    }

    // --- Location Appending Logic ---
    let resolvedOriginForQuery: string | undefined = undefined;
    if (sendLocation) {
      if (currentUserLocation) {
        resolvedOriginForQuery = currentUserLocation;
      } else {
        try {
          console.log("Attempting to get current location because toggle is on...");
          const location = await getCurrentLocation();
          resolvedOriginForQuery = location;
          console.log("Current location obtained for query:", location);
        } catch (locationError: any) {
          console.error("Error getting location for query:", locationError);
          // Show location error with toast instead of chat message
          toast.error("Location Error", {
            description: locationError.toString()
          });
          if (showInitialView) setShowInitialView(false);
          setUserInput(""); // Clear input
          setSelectedFiles([]); // Clear files
          setStatus('Ready');
          return; 
        }
      }
      if (resolvedOriginForQuery) {
        // Append to the message text that will be sent
        currentMessageText = `${currentMessageText} (My current location is: ${resolvedOriginForQuery})`;
      }
    }
    // --- End Location Appending Logic ---

    // --- NEW: Include attachment URLs directly in the message ---
    if (attachmentUrls.length > 0) {
      const attachmentList = attachmentUrls.map((url, index) => {
        const fileName = selectedFiles[index]?.name || `Attachment ${index + 1}`;
        return `- ${fileName}: ${url}`;
      }).join('\n');
      
      currentMessageText += `\n\nAttached files:\n${attachmentList}`;
    }

    const userMessageId = uuidv4();
    const userMessageParts: MessagePart[] = [];
    if (currentMessageText) { // Use potentially modified message text
      userMessageParts.push({ type: "text", id: uuidv4(), content: currentMessageText });
    }

    const userMessage: Message = {
      id: userMessageId,
      sender: "user",
      parts: userMessageParts,
      timestamp: Date.now(),
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setUserInput(""); 
    if (showInitialView) setShowInitialView(false);

    const botMessageId = uuidv4();
    setMessages((prevMessages) => [
      ...prevMessages,
      { 
        id: botMessageId, 
        sender: 'bot', 
        parts: [{ type: "thought_summary", id: uuidv4(), content: "" }],
        timestamp: Date.now(),
        thinking: true
      },
    ]);

    try {
      // --- NEW: Simplified payload with URLs instead of base64 ---
      const payload = {
        sender: apiSender,
        query: currentMessageText, // This now includes attachment URLs
        timestamp: Date.now(),
        stream: true,
        model: selectedModel,
        attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : undefined, // NEW: Direct URL array
        system_prompt: selectedSystemPrompt !== "default" ? selectedSystemPrompt : undefined, // NEW: Include system prompt if not default
        allowed_tools: selectedTools, // Always send the array, even if empty
      };

      // Clear selected files now that they're uploaded and in the message
      setSelectedFiles([]);
      setStatus('Processing...');

      const response = await fetch(`${BACKEND_API_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; // Buffer for accumulating stream data

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
            if (buffer.trim() !== '') {
                try {
                    const parsedChunk = JSON.parse(buffer);
                    console.log('[PAGE.TSX] Final Buffer Chunk:', JSON.stringify(parsedChunk));
                    if (parsedChunk.type === 'text_chunk' && parsedChunk.content) {
                        setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                let currentContent = parsedChunk.content;
                                let newParts = [...msg.parts];
                                const lastPart = newParts.length > 0 ? newParts[newParts.length - 1] : null;

                                if (lastPart && lastPart.type === "text") {
                                    currentContent = normalizeFragment(currentContent, lastPart.content);
                                    lastPart.content += currentContent;
                                } else {
                                    currentContent = normalizeFragment(currentContent, "");
                                    newParts.push({ type: "text", id: uuidv4(), content: currentContent });
                                }
                                return { ...msg, parts: newParts, thinking: true };
                            }
                            return msg;
                        }));
                    } else if (parsedChunk.type === 'thought_summary' && parsedChunk.content) {
                        setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                const newParts = msg.parts.map(part => {
                                    if (part.type === "thought_summary") {
                                        const contentFromChunk = normalizeFragment(
                                            parsedChunk.content,
                                            part.content
                                        );
                                        return { ...part, content: part.content + contentFromChunk };
                                    }
                                    return part;
                                });
                                return { ...msg, parts: newParts, thinking: true };
                            }
                            return msg;
                        }));
                    } else if (parsedChunk.type === 'tool_call_pending' && parsedChunk.name && parsedChunk.arguments) {
                        const call_id_from_chunk = parsedChunk.call_id || `tool-${uuidv4()}`;
                        setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                const existingToolCallPart = msg.parts.find(part =>
                                    part.type === "tool_call" && part.toolCall.call_id === call_id_from_chunk
                                );
                                if (existingToolCallPart) {
                                    console.log(`[PAGE.TSX] (final buffer) Tool call with ID ${call_id_from_chunk} already exists. Ignoring duplicate pending.`);
                                    return msg; 
                                }
                                const newToolCallData: ToolCallData = {
                                    call_id: call_id_from_chunk,
                                    name: parsedChunk.name,
                                    arguments: typeof parsedChunk.arguments === 'string' ? parsedChunk.arguments : JSON.stringify(parsedChunk.arguments),
                                    status: "Pending...",
                                };
                                console.log('[PAGE.TSX] (final buffer) Tool Call Pending (New):', JSON.parse(JSON.stringify(newToolCallData)));
                                const newParts = [...msg.parts];
                                newParts.push({ type: "tool_call" as const, id: uuidv4(), toolCall: newToolCallData });
                                newParts.push({ type: "text" as const, id: uuidv4(), content: "" });
                                return { ...msg, parts: newParts, thinking: true };
                            }
                            return msg;
                        }));
                    } else if (parsedChunk.type === 'tool_result' && parsedChunk.call_id && typeof parsedChunk.result !== 'undefined') {
                         setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                if (parsedChunk.name === "get_directions") {
                                    console.log("[PAGE.TSX] (Final Buffer) RAW get_directions tool_result CHUNK:", JSON.stringify(parsedChunk));
                                }
                                let matchedToolCallInParts = false;
                                const newParts = msg.parts.map(part => {
                                    if (part.type === "tool_call" && part.toolCall.call_id === parsedChunk.call_id) {
                                        matchedToolCallInParts = true;
                                        const tc = part.toolCall;
                                        let finalResult = typeof parsedChunk.result === 'string' ? parsedChunk.result : JSON.stringify(parsedChunk.result);
                                        const isPartial = typeof parsedChunk.is_partial === 'boolean' ? parsedChunk.is_partial : false;
                                        const isError = typeof parsedChunk.is_error === 'boolean' ? parsedChunk.is_error : false;
                                        const newStatus: ToolCallData['status'] = isPartial ? "Streaming..." : (isError ? "Error" : "Completed");
                                        const updatedToolCall: ToolCallData = {
                                            ...tc,
                                            result: isPartial && tc.result && tc.status === "Streaming..." ? tc.result + '\n---\n' + finalResult : finalResult,
                                            status: newStatus,
                                            is_error: isError,
                                            is_partial: isPartial,
                                        };
                                        let toolResponse = null;
                                        if (tc.name === "get_directions" && parsedChunk.result) {
                                            // Handle both old wrapped format and new direct format
                                            if (typeof parsedChunk.result === 'object') {
                                                const responseKey = `${tc.name}_response`;
                                                if (parsedChunk.result[responseKey]) {
                                                    // Old wrapped format
                                                    toolResponse = parsedChunk.result[responseKey];
                                                    console.log("[PAGE.TSX] (Stream Loop) Using wrapped format for directions, toolResponse:", JSON.stringify(toolResponse).substring(0, 200) + "...");
                                                } else {
                                                    // New direct format from FastMCP
                                                    toolResponse = parsedChunk.result;
                                                    console.log("[PAGE.TSX] (Stream Loop) Using direct format for directions, toolResponse:", JSON.stringify(toolResponse).substring(0, 200) + "...");
                                                }
                                            }
                                        }
                                        if (tc.name === "get_directions" && toolResponse && toolResponse.status === "success" && toolResponse.data && !isError && !isPartial) {
                                            console.log("[PAGE.TSX] (Final Buffer) Setting directionsData with:", JSON.stringify(toolResponse.data).substring(0, 200) + "...");
                                            setDirectionsData(toolResponse.data);
                                            setMapDisplayKey(prevKey => prevKey + 1);
                                            setIsMapSectionVisible(true);
                                        } else if (tc.name === "get_directions" && !toolResponse) {
                                            console.error("[PAGE.TSX] (Final Buffer) ERROR: get_directions_response missing!");
                                        }
                                        // NEW: Process tool call for preview extraction
                                        processToolCallForPreview(updatedToolCall, msg.id);
                                        // NEW: Web app detection logic
                                        if ((tc.name === "create_web_app" || tc.name === "edit_web_app") && !isError && !isPartial && tc.result) {
                                            try {
                                                const resultData = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result;
                                                if (resultData.status === "success" && resultData.url) {
                                                    console.log("[PAGE.TSX] (Final Buffer) Setting webAppUrl with:", resultData.url);
                                                    // This will be set on the message object below
                                                }
                                            } catch (e) {
                                                console.warn("[PAGE.TSX] (Final Buffer) Failed to parse web app result:", e);
                                            }
                                        }
                                        // NEW: Image generation detection logic
                                        if (tc.name === "generate_images_with_prompts" && !isError && !isPartial && tc.result) {
                                            try {
                                                const resultData = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result;
                                                if (resultData.status === "success" && resultData.results) {
                                                    // Extract all image URLs from the results array
                                                    const imageUrls: string[] = [];
                                                    resultData.results.forEach((resultArray: any) => {
                                                        if (Array.isArray(resultArray)) {
                                                            imageUrls.push(...resultArray);
                                                        }
                                                    });
                                                    if (imageUrls.length > 0) {
                                                        console.log("[PAGE.TSX] (Stream Loop) Setting generatedImageUrls with:", imageUrls.length, "images");
                                                        // This will be set on the message object below
                                                    }
                                                }
                                            } catch (e) {
                                                console.warn("[PAGE.TSX] (Stream Loop) Failed to parse image generation result:", e);
                                            }
                                        }
                                        return { ...part, toolCall: updatedToolCall };
                                    }
                                    return part;
                                });
                                if (!matchedToolCallInParts) { console.warn(`[PAGE.TSX] (Final Buffer) Tool call id ${parsedChunk.call_id} not found in ${msg.id}`); }
                                let toolResponse = null;
                                if (parsedChunk.name === "get_directions" && parsedChunk.result) {
                                    if (typeof parsedChunk.result === 'object') {
                                        const responseKey = `${parsedChunk.name}_response`;
                                        if (parsedChunk.result[responseKey]) {
                                            toolResponse = parsedChunk.result[responseKey];
                                        } else {
                                            toolResponse = parsedChunk.result;
                                        }
                                    }
                                }
                                let finalMsgObject = { ...msg, parts: newParts, thinking: true };
                                if (
                                    parsedChunk.name === "get_directions" &&
                                    toolResponse &&
                                    !(typeof parsedChunk.is_partial === 'boolean' && parsedChunk.is_partial) &&
                                    !(typeof parsedChunk.is_error === 'boolean' && parsedChunk.is_error) &&
                                    toolResponse.status === "success" &&
                                    toolResponse.data
                                ) {
                                    finalMsgObject.showMapToggleForThisMessage = true;
                                    finalMsgObject.directionsData = toolResponse.data;
                                    console.log("[PAGE.TSX] (Final Buffer) Setting message directions data:", JSON.stringify(toolResponse.data).substring(0, 200) + "...");
                                }
                                // NEW: Web app message object updates
                                if ((parsedChunk.name === "create_web_app" || parsedChunk.name === "edit_web_app") && !(typeof parsedChunk.is_partial === 'boolean' && parsedChunk.is_partial) && !(typeof parsedChunk.is_error === 'boolean' && parsedChunk.is_error) && parsedChunk.result) {
                                    try {
                                        const resultData = typeof parsedChunk.result === 'string' ? JSON.parse(parsedChunk.result) : parsedChunk.result;
                                        if (resultData.status === "success" && resultData.url) {
                                            finalMsgObject.showWebAppForThisMessage = true;
                                            finalMsgObject.webAppUrl = resultData.url;
                                        }
                                    } catch (e) {
                                        console.warn("[PAGE.TSX] (Final Buffer) Failed to parse web app result for message:", e);
                                    }
                                }
                                // NEW: Image generation message object updates
                                if (parsedChunk.name === "generate_images_with_prompts" && !(typeof parsedChunk.is_partial === 'boolean' && parsedChunk.is_partial) && !(typeof parsedChunk.is_error === 'boolean' && parsedChunk.is_error) && parsedChunk.result) {
                                    try {
                                        const resultData = typeof parsedChunk.result === 'string' ? JSON.parse(parsedChunk.result) : parsedChunk.result;
                                        if (resultData.status === "success" && resultData.results) {
                                            // Extract all image URLs from the results array
                                            const imageUrls: string[] = [];
                                            resultData.results.forEach((resultArray: any) => {
                                                if (Array.isArray(resultArray)) {
                                                    imageUrls.push(...resultArray);
                                                }
                                            });
                                            if (imageUrls.length > 0) {
                                                finalMsgObject.showImagesForThisMessage = true;
                                                finalMsgObject.generatedImageUrls = imageUrls;
                                                console.log("[PAGE.TSX] (Final Buffer) Setting generatedImageUrls with:", imageUrls.length, "images");
                                            }
                                        }
                                    } catch (e) {
                                        console.warn("[PAGE.TSX] (Final Buffer) Failed to parse image generation result for message:", e);
                                    }
                                }
                                return finalMsgObject;
                            }
                            return msg;
                        }));
                    } 
                    // ---- START: New chunk types for final buffer processing ----
                    else if (parsedChunk.type === 'tool_sample_text_chunk' && parsedChunk.parent_tool_call_id && typeof parsedChunk.content === 'string') {
                        setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                const newParts = msg.parts.map(part => {
                                    if (part.type === "tool_call" && part.toolCall.call_id === parsedChunk.parent_tool_call_id) {
                                        const tc = part.toolCall;
                                        const currentPairs = tc.sampleCallPairs || [];
                                        let newPairs;
                                        
                                        if (currentPairs.length > 0) {
                                            const lastPair = currentPairs[currentPairs.length - 1];
                                            // Create new pair object with updated output
                                            const updatedLastPair = {
                                                ...lastPair,
                                                output: (lastPair.output || "") + parsedChunk.content
                                            };
                                            // Create new array with updated last pair
                                            newPairs = [...currentPairs.slice(0, -1), updatedLastPair];
                                        } else {
                                            // Create new pair
                                            newPairs = [{ id: uuidv4(), output: parsedChunk.content }];
                                        }
                                        
                                        console.log(`[PAGE.TSX] (Final Buffer) Updated sampleCallPairs (output) for ${parsedChunk.parent_tool_call_id}:`, JSON.parse(JSON.stringify(newPairs)));
                                        return { ...part, toolCall: { ...tc, sampleCallPairs: newPairs } };
                                    }
                                    return part;
                                });
                                return { ...msg, parts: newParts, thinking: true }; 
                            }
                            return msg;
                        }));
                    } else if (parsedChunk.type === 'tool_sample_thought_chunk' && parsedChunk.parent_tool_call_id && typeof parsedChunk.content === 'string') {
                        setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                const newParts = msg.parts.map(part => {
                                    if (part.type === "tool_call" && part.toolCall.call_id === parsedChunk.parent_tool_call_id) {
                                        const tc = part.toolCall;
                                        const currentPairs = tc.sampleCallPairs || [];
                                        let newPairs;

                                        // If lastPair exists and is still 'open' (no output yet), append thoughts.
                                        // Otherwise, this is a new sampling call's thoughts, so create a new pair.
                                        if (currentPairs.length > 0) {
                                            const lastPair = currentPairs[currentPairs.length - 1];
                                            if (typeof lastPair.output === 'undefined') {
                                                // Update existing pair with thoughts
                                                const updatedLastPair = {
                                                    ...lastPair,
                                                    thoughts: (lastPair.thoughts || "") + parsedChunk.content
                                                };
                                                newPairs = [...currentPairs.slice(0, -1), updatedLastPair];
                                            } else {
                                                // Create new pair for new sampling call
                                                newPairs = [...currentPairs, { id: uuidv4(), thoughts: parsedChunk.content }];
                                            }
                                        } else {
                                            // Create first pair
                                            newPairs = [{ id: uuidv4(), thoughts: parsedChunk.content }];
                                        }
                                        
                                        console.log(`[PAGE.TSX] (Final Buffer) Updated sampleCallPairs (thoughts) for ${parsedChunk.parent_tool_call_id}:`, JSON.parse(JSON.stringify(newPairs)));
                                        return { ...part, toolCall: { ...tc, sampleCallPairs: newPairs } };
                                    }
                                    return part;
                                });
                                return { ...msg, parts: newParts, thinking: true };
                            }
                            return msg;
                        }));
                    }
                    // ---- END: New chunk types for final buffer processing ----
                    else if (parsedChunk.type === 'stream_end') {
                        setMessages(prev => prev.map(msg => msg.id === botMessageId ? {...msg, thinking: false } : msg));
                        setStatus('Ready');
                    } else if (parsedChunk.type === 'error' && parsedChunk.content) {
                         setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                const errorTextPart: MessagePart = {
                                    type: "text",
                                    id: uuidv4(),
                                    content: `<strong style="color: red;">Stream Error:</strong> ${renderSanitizedMarkdown(parsedChunk.content)}`
                                };
                                const newParts = [...msg.parts, errorTextPart];
                                return { 
                                    ...msg, 
                                    parts: newParts,
                                    thinking: false, 
                                    is_error_message: true 
                                };
                            }
                            return msg;
                        }));
                        setStatus('Ready'); // Reset status after error
                    }
                } catch (err) {
                    console.error('Error parsing final stream chunk JSON:', err, 'Raw final buffer:', buffer);
                }
            }
            console.log('[PAGE.TSX] HTTP Response Stream Reader finished.');
            setMessages(prev => prev.map(msg => msg.id === botMessageId && msg.thinking ? {...msg, thinking: false } : msg));
            if (status !== 'Ready') setStatus('Ready');
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;

        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.substring(0, newlineIndex);
            buffer = buffer.substring(newlineIndex + 1);

            if (line.trim() === '') continue;
            try {
                const parsedChunk = JSON.parse(line);
                // console.log('[PAGE.TSX] Streamed Chunk:', JSON.stringify(parsedChunk)); // General log exists
            
                if (parsedChunk.type === 'text_chunk' && parsedChunk.content) {
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === botMessageId) {
                            console.log(`[PAGE.TSX] Updating message ${msg.id} with text_chunk (stream loop). Current parts:`, JSON.parse(JSON.stringify(msg.parts))); // DEEP COPY LOGGING
                            
                            const newParts = [...msg.parts]; // Shallow copy of parts array
                            const lastPartIndex = newParts.length > 0 ? newParts.length - 1 : -1;
                            const lastPart = lastPartIndex !== -1 ? newParts[lastPartIndex] : null;
                            
                            // Normalize the incoming chunk's content.
                            // The second argument to normalizeFragment was lastPart.content or "" in the original logic.
                            const contentFromChunk = normalizeFragment(
                                parsedChunk.content, 
                                lastPart && lastPart.type === "text" ? lastPart.content : ""
                            );

                            if (lastPart && lastPart.type === "text") {
                                // Update the last part immutably by creating a new object
                                newParts[lastPartIndex] = {
                                    ...(lastPart as { type: "text"; id: string; content: string }), // Ensure correct type for spread
                                    content: lastPart.content + contentFromChunk 
                                };
                            } else {
                                // Add a new text part if no previous text part or parts array is empty
                                newParts.push({ 
                                    type: "text", 
                                    id: uuidv4(), 
                                    content: contentFromChunk 
                                });
                            }
                            return { ...msg, parts: newParts, thinking: true };
                        }
                        return msg;
                    }));
                } else if (parsedChunk.type === 'thought_summary' && parsedChunk.content) {
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === botMessageId) {
                            console.log(`[PAGE.TSX] Updating message ${msg.id} with thought_summary. Current parts:`, JSON.parse(JSON.stringify(msg.parts)));
                            const newParts = [...msg.parts];
                            const lastPartIndex = newParts.length > 0 ? newParts.length - 1 : -1;
                            const lastPart = lastPartIndex !== -1 ? newParts[lastPartIndex] : null;
                            const contentFromChunk = normalizeFragment(
                                parsedChunk.content,
                                lastPart && lastPart.type === "thought_summary" ? lastPart.content : ""
                            );

                            if (lastPart && lastPart.type === "thought_summary") {
                                newParts[lastPartIndex] = {
                                    ...(lastPart as { type: "thought_summary"; id: string; content: string }),
                                    content: lastPart.content + contentFromChunk
                                };
                            } else {
                                newParts.push({
                                    type: "thought_summary",
                                    id: uuidv4(),
                                    content: contentFromChunk
                                });
                            }
                            return { ...msg, parts: newParts, thinking: true };
                        }
                        return msg;
                    }));
                } else if (parsedChunk.type === 'tool_call_pending' && parsedChunk.name && parsedChunk.arguments) {
                    const call_id_from_chunk = parsedChunk.call_id || `tool-${uuidv4()}`;
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === botMessageId) {
                            const existingToolCallPart = msg.parts.find(part =>
                                part.type === "tool_call" && part.toolCall.call_id === call_id_from_chunk
                            );

                            if (existingToolCallPart) {
                                console.log(`[PAGE.TSX] (stream loop) Tool call with ID ${call_id_from_chunk} already exists in pending state. Ignoring duplicate pending message.`);
                                return msg;
                            }

                            const newToolCallData: ToolCallData = {
                                call_id: call_id_from_chunk,
                                name: parsedChunk.name,
                                arguments: typeof parsedChunk.arguments === 'string' ? parsedChunk.arguments : JSON.stringify(parsedChunk.arguments),
                                status: "Pending...",
                            };
                            console.log('[PAGE.TSX] Tool Call Pending (New):', JSON.parse(JSON.stringify(newToolCallData))); 
                            const newParts = [...msg.parts];
                            newParts.push({ type: "tool_call" as const, id: uuidv4(), toolCall: newToolCallData });
                            newParts.push({ type: "text" as const, id: uuidv4(), content: "" });
                            return { ...msg, parts: newParts, thinking: true };
                        }
                        return msg;
                    }));
                } else if (parsedChunk.type === 'tool_result' && parsedChunk.call_id && typeof parsedChunk.result !== 'undefined') {
                    console.log('[PAGE.TSX] Received tool_result chunk:', JSON.parse(JSON.stringify(parsedChunk))); // DEEP COPY LOGGING
                    if (parsedChunk.name === "get_directions") {
                        console.log("[PAGE.TSX] RAW get_directions tool_result CHUNK (repeated block):", JSON.stringify(parsedChunk));
                    }
                    // console.log(`[PAGE.TSX] Parsed chunk is_partial value: ${parsedChunk.is_partial}`); // Keep for debugging if needed

                    setMessages(prev => prev.map(msg => {
                        if (msg.id === botMessageId) {
                            console.log(`[PAGE.TSX] Updating message ${msg.id} with tool_result. Current parts:`, JSON.parse(JSON.stringify(msg.parts))); // DEEP COPY LOGGING
                            let matchedToolCallInParts = false;
                            const newParts = msg.parts.map(part => {
                                if (part.type === "tool_call" && part.toolCall.call_id === parsedChunk.call_id) {
                                    matchedToolCallInParts = true;
                                    const tc = part.toolCall;
                                    // console.log(`[PAGE.TSX] Existing tool call data for ${tc.call_id}:`, JSON.parse(JSON.stringify(tc)));

                                    let finalResult = typeof parsedChunk.result === 'string' ? parsedChunk.result : JSON.stringify(parsedChunk.result);
                                    const isPartial = typeof parsedChunk.is_partial === 'boolean' ? parsedChunk.is_partial : false;
                                    const isError = typeof parsedChunk.is_error === 'boolean' ? parsedChunk.is_error : false;
                                    const newStatus: ToolCallData['status'] = isPartial ? "Streaming..." : (isError ? "Error" : "Completed");
                                    
                                    // console.log(`[PAGE.TSX] Updating tool: ${tc.call_id}, New Status: ${newStatus}, Is Partial (derived): ${isPartial}, Is Error (derived): ${isError}`);

                                    const updatedToolCall: ToolCallData = {
                                        ...tc,
                                        result: isPartial && tc.result && tc.status === "Streaming..." ? tc.result + '\n---\n' + finalResult : finalResult,
                                        status: newStatus,
                                        is_error: isError,
                                        is_partial: isPartial,
                                    };
                                    // console.log(`[PAGE.TSX] New tool call data for ${tc.call_id}:`, JSON.parse(JSON.stringify(updatedToolCall)));

                                    // --- NEW: Extract get_directions_response ---
                                    let toolResponse = null;
                                    if (tc.name === "get_directions" && parsedChunk.result) {
                                        // Handle both old wrapped format and new direct format
                                        if (typeof parsedChunk.result === 'object') {
                                            const responseKey = `${tc.name}_response`;
                                            if (parsedChunk.result[responseKey]) {
                                                // Old wrapped format
                                                toolResponse = parsedChunk.result[responseKey];
                                                console.log("[PAGE.TSX] (Stream Loop) Using wrapped format for directions, toolResponse:", JSON.stringify(toolResponse).substring(0, 200) + "...");
                                            } else {
                                                // New direct format from FastMCP
                                                toolResponse = parsedChunk.result;
                                                console.log("[PAGE.TSX] (Stream Loop) Using direct format for directions, toolResponse:", JSON.stringify(toolResponse).substring(0, 200) + "...");
                                            }
                                        }
                                    }
                                    // --- END NEW ---

                                    // If this is the final result for get_directions, set map data
                                    if (
                                        tc.name === "get_directions" &&
                                        toolResponse &&
                                        toolResponse.status === "success" &&
                                        toolResponse.data &&
                                        !isError &&
                                        !isPartial
                                    ) {
                                        console.log("[PAGE.TSX] (Stream Loop) Setting directionsData with:", JSON.stringify(toolResponse.data).substring(0, 200) + "...");
                                        setDirectionsData(toolResponse.data);
                                        setMapDisplayKey(prevKey => prevKey + 1);
                                        setIsMapSectionVisible(true); // MODIFIED: Show map section automatically
                                    } else if (
                                        tc.name === "get_directions" &&
                                        !toolResponse
                                    ) {
                                        console.error(
                                            "[PAGE.TSX] ERROR (stream loop): get_directions_response missing in parsedChunk.result!"
                                        );
                                    }

                                    // NEW: Web app detection logic
                                    if ((tc.name === "create_web_app" || tc.name === "edit_web_app") && !isError && !isPartial && tc.result) {
                                        try {
                                            const resultData = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result;
                                            if (resultData.status === "success" && resultData.url) {
                                                console.log("[PAGE.TSX] (Final Buffer) Setting webAppUrl with:", resultData.url);
                                                // This will be set on the message object below
                                            }
                                        } catch (e) {
                                            console.warn("[PAGE.TSX] (Final Buffer) Failed to parse web app result:", e);
                                        }
                                    }

                                    // NEW: Image generation detection logic
                                    if (tc.name === "generate_images_with_prompts" && !isError && !isPartial && tc.result) {
                                        try {
                                            const resultData = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result;
                                            if (resultData.status === "success" && resultData.results) {
                                                // Extract all image URLs from the results array
                                                const imageUrls: string[] = [];
                                                resultData.results.forEach((resultArray: any) => {
                                                    if (Array.isArray(resultArray)) {
                                                        imageUrls.push(...resultArray);
                                                    }
                                                });
                                                if (imageUrls.length > 0) {
                                                    console.log("[PAGE.TSX] (Stream Loop) Setting generatedImageUrls with:", imageUrls.length, "images");
                                                    // This will be set on the message object below
                                                }
                                            }
                                        } catch (e) {
                                            console.warn("[PAGE.TSX] (Stream Loop) Failed to parse image generation result:", e);
                                        }
                                    }

                                    // NEW: Process tool call for preview extraction (streaming loop)
                                    processToolCallForPreview(updatedToolCall, msg.id);

                                    return { ...part, toolCall: updatedToolCall };
                                }
                                return part;
                            });
                            if (!matchedToolCallInParts) {
                                console.warn(
                                    `[PAGE.TSX] (stream loop) Tool call with id ${parsedChunk.call_id} not found in message ${msg.id} parts`
                                );
                            }

                            // --- NEW: Attach directionsData to message for rendering ---
                            let toolResponse = null;
                            if (parsedChunk.name === "get_directions" && parsedChunk.result) {
                              // Handle both old wrapped format and new direct format
                              if (typeof parsedChunk.result === 'object') {
                                  const responseKey = `${parsedChunk.name}_response`;
                                  if (parsedChunk.result[responseKey]) {
                                      // Old wrapped format
                                      toolResponse = parsedChunk.result[responseKey];
                                      console.log("[PAGE.TSX] (Stream Loop Message) Using wrapped format for directions, toolResponse:", JSON.stringify(toolResponse).substring(0, 200) + "...");
                                  } else {
                                      // New direct format from FastMCP
                                      toolResponse = parsedChunk.result;
                                      console.log("[PAGE.TSX] (Stream Loop Message) Using direct format for directions, toolResponse:", JSON.stringify(toolResponse).substring(0, 200) + "...");
                                  }
                              }
                          }
                            let finalMsgObject = { ...msg, parts: newParts, thinking: true };
                            if (
                                parsedChunk.name === "get_directions" &&
                                toolResponse &&
                                !(typeof parsedChunk.is_partial === 'boolean' && parsedChunk.is_partial) &&
                                !(typeof parsedChunk.is_error === 'boolean' && parsedChunk.is_error) &&
                                toolResponse.status === "success" &&
                                toolResponse.data
                            ) {
                                finalMsgObject.showMapToggleForThisMessage = true;
                                finalMsgObject.directionsData = toolResponse.data;
                                console.log("[PAGE.TSX] (Stream Loop Message) Setting message directions data:", JSON.stringify(toolResponse.data).substring(0, 200) + "...");
                            }
                            // NEW: Web app message object updates for streaming loop
                            if ((parsedChunk.name === "create_web_app" || parsedChunk.name === "edit_web_app") && !(typeof parsedChunk.is_partial === 'boolean' && parsedChunk.is_partial) && !(typeof parsedChunk.is_error === 'boolean' && parsedChunk.is_error) && parsedChunk.result) {
                                try {
                                    const resultData = typeof parsedChunk.result === 'string' ? JSON.parse(parsedChunk.result) : parsedChunk.result;
                                    if (resultData.status === "success" && resultData.url) {
                                        finalMsgObject.showWebAppForThisMessage = true;
                                        finalMsgObject.webAppUrl = resultData.url;
                                    }
                                } catch (e) {
                                    console.warn("[PAGE.TSX] (Stream Loop) Failed to parse web app result for message:", e);
                                }
                            }
                            // NEW: Image generation message object updates
                            if (parsedChunk.name === "generate_images_with_prompts" && !(typeof parsedChunk.is_partial === 'boolean' && parsedChunk.is_partial) && !(typeof parsedChunk.is_error === 'boolean' && parsedChunk.is_error) && parsedChunk.result) {
                                try {
                                    const resultData = typeof parsedChunk.result === 'string' ? JSON.parse(parsedChunk.result) : parsedChunk.result;
                                    if (resultData.status === "success" && resultData.results) {
                                        // Extract all image URLs from the results array
                                        const imageUrls: string[] = [];
                                        resultData.results.forEach((resultArray: any) => {
                                            if (Array.isArray(resultArray)) {
                                                imageUrls.push(...resultArray);
                                            }
                                        });
                                        if (imageUrls.length > 0) {
                                            finalMsgObject.showImagesForThisMessage = true;
                                            finalMsgObject.generatedImageUrls = imageUrls;
                                            console.log("[PAGE.TSX] (Final Buffer) Setting generatedImageUrls with:", imageUrls.length, "images");
                                        }
                                    }
                                } catch (e) {
                                    console.warn("[PAGE.TSX] (Final Buffer) Failed to parse image generation result for message:", e);
                                }
                            }
                            return finalMsgObject;
                        }
                        return msg;
                    }));
                } else if (parsedChunk.type === 'stream_end') {
                    console.log('[PAGE.TSX] Stream ended for botMessageId:', botMessageId);
                    setMessages(prev => prev.map(msg => msg.id === botMessageId ? {...msg, thinking: false } : msg));
                    setStatus('Ready');
                } else if (parsedChunk.type === 'error' && parsedChunk.content) {
                    console.error('[PAGE.TSX] Received stream error chunk:', parsedChunk);
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === botMessageId) {
                            const errorTextPart: MessagePart = {
                                type: "text",
                                id: uuidv4(),
                                content: `<strong style="color: red;">Stream Error:</strong> ${renderSanitizedMarkdown(parsedChunk.content)}`
                            };
                            const newParts = [...msg.parts, errorTextPart];
                            return { 
                                ...msg, 
                                parts: newParts,
                                thinking: false, 
                                is_error_message: true 
                            };
                        }
                        return msg;
                    }));
                    setStatus('Ready'); // Reset status after error
                }
                // ---- START: New chunk types for per-line stream processing ----
                else if (parsedChunk.type === 'tool_sample_text_chunk' && parsedChunk.parent_tool_call_id && typeof parsedChunk.content === 'string') {
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === botMessageId) {
                            const newParts = msg.parts.map(part => {
                                if (part.type === "tool_call" && part.toolCall.call_id === parsedChunk.parent_tool_call_id) {
                                     const tc = part.toolCall;
                                    const currentPairs = tc.sampleCallPairs || [];
                                    let newPairs;
                                    
                                    if (currentPairs.length > 0) {
                                        const lastPair = currentPairs[currentPairs.length - 1];
                                        // Create new pair object with updated output
                                        const updatedLastPair = {
                                            ...lastPair,
                                            output: (lastPair.output || "") + parsedChunk.content
                                        };
                                        // Create new array with updated last pair
                                        newPairs = [...currentPairs.slice(0, -1), updatedLastPair];
                                    } else {
                                        // Create new pair
                                        newPairs = [{ id: uuidv4(), output: parsedChunk.content }];
                                    }
                                    
                                    console.log(`[PAGE.TSX] (Stream Line) Updated sampleCallPairs (output) for ${parsedChunk.parent_tool_call_id}:`, JSON.parse(JSON.stringify(newPairs)));
                                    return { ...part, toolCall: { ...tc, sampleCallPairs: newPairs } };
                                }
                                return part;
                            });
                            return { ...msg, parts: newParts, thinking: true }; 
                        }
                        return msg;
                    }));
                } else if (parsedChunk.type === 'tool_sample_thought_chunk' && parsedChunk.parent_tool_call_id && typeof parsedChunk.content === 'string') {
                    setMessages(prev => prev.map(msg => {
                        if (msg.id === botMessageId) {
                            const newParts = msg.parts.map(part => {
                                if (part.type === "tool_call" && part.toolCall.call_id === parsedChunk.parent_tool_call_id) {
                                    const tc = part.toolCall;
                                    const currentPairs = tc.sampleCallPairs || [];
                                    let newPairs;

                                    // If lastPair exists and is still 'open' (no output yet), append thoughts.
                                    // Otherwise, this is a new sampling call's thoughts, so create a new pair.
                                    if (currentPairs.length > 0) {
                                        const lastPair = currentPairs[currentPairs.length - 1];
                                        if (typeof lastPair.output === 'undefined') {
                                            // Update existing pair with thoughts
                                            const updatedLastPair = {
                                                ...lastPair,
                                                thoughts: (lastPair.thoughts || "") + parsedChunk.content
                                            };
                                            newPairs = [...currentPairs.slice(0, -1), updatedLastPair];
                                        } else {
                                            // Create new pair for new sampling call
                                            newPairs = [...currentPairs, { id: uuidv4(), thoughts: parsedChunk.content }];
                                        }
                                    } else {
                                        // Create first pair
                                        newPairs = [{ id: uuidv4(), thoughts: parsedChunk.content }];
                                    }
                                    
                                    console.log(`[PAGE.TSX] (Stream Line) Updated sampleCallPairs (thoughts) for ${parsedChunk.parent_tool_call_id}:`, JSON.parse(JSON.stringify(newPairs)));
                                    return { ...part, toolCall: { ...tc, sampleCallPairs: newPairs } };
                                }
                                return part;
                            });
                            return { ...msg, parts: newParts, thinking: true };
                        }
                        return msg;
                    }));
                }
                // ---- END: New chunk types for per-line stream processing ----
            } catch (err) {
                console.error('Error parsing stream chunk JSON:', err, 'Raw line:', line);
            }
        }
      }
    } catch (error) {
      console.error('Error sending message or processing stream:', error);
      const errorContent = error instanceof Error ? error.message : 'Sorry, I encountered an error processing your request.';
      const renderedErrorContent = renderSanitizedMarkdown(errorContent);
      
      let botMessageFoundAndUpdated = false;
      setMessages(prev => prev.map(msg => {
        if (msg.id === botMessageId) {
          botMessageFoundAndUpdated = true;
          const newErrorPart: MessagePart = { type: "text", id: uuidv4(), content: renderedErrorContent };
          const updatedParts = [...(msg.parts || []), newErrorPart]; // Ensure msg.parts exists
          return { ...msg, parts: updatedParts, thinking: false, is_error_message: true };
        }
        return msg;
      }));

       if (!botMessageFoundAndUpdated) {
            setMessages(prevMessages => [
                ...prevMessages,
                { 
                    id: uuidv4(), 
                    sender: 'bot', 
                    parts: [{ type: "text", id: uuidv4(), content: renderedErrorContent }],
                    timestamp: Date.now(), 
                    thinking: false,
                    is_error_message: true 
                }
            ]);
       }
    } finally {
    }
  };

  const handleExamplePromptClick = (title: string, detail: string) => {
    setUserInput(`${title} ${detail}`);
  };

  useEffect(() => {
    const viewport = scrollAreaRef.current;
    if (viewport) {
        // The viewport itself is the scrollable container in ScrollArea
        viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .animated-ellipsis span {
        opacity: 0;
        animation: an_ellipsis 1.2s infinite;
        animation-fill-mode: forwards; /* Keep the final state of the animation */
      }
      .animated-ellipsis span:nth-child(1) { animation-delay: 0.1s; }
      .animated-ellipsis span:nth-child(2) { animation-delay: 0.25s; }
      .animated-ellipsis span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes an_ellipsis {
        0% { opacity: 0; transform: translateY(-0.1em);}
        30% { opacity: 1; transform: translateY(0);}
        70% { opacity: 1; transform: translateY(0);}
        100% { opacity: 0; transform: translateY(0.1em);}
      }
      /* Add CSS for thought summary details arrow rotation */
      .thought-summary-details[open] > summary .details-arrow {
        transform: rotate(180deg);
      }
      /* Add CSS for tool call details arrow rotation */
      .tool-call-display[open] > summary .details-arrow {
        transform: rotate(180deg);
      }
      /* Ensure tool call displays don't cause horizontal overflow */
      .tool-call-display {
        max-width: 100%;
        overflow-wrap: break-word;
        word-break: break-all;
      }
      .tool-call-display pre {
        max-width: 100%;
        overflow-x: auto;
        word-break: break-all;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .tool-call-display .tool-call-content {
        max-width: 100%;
        overflow-wrap: break-word;
      }
      /* Add some basic prose styling for markdown content if not already globally available */
      .prose {
        line-height: 1.35; /* Increased for better readability */
        font-size: 0.94rem;
        word-wrap: break-word; /* Force word wrapping */
        overflow-wrap: break-word; /* Modern equivalent */
        word-break: break-word; /* Break long words */
      }
      .prose p { 
        margin-bottom: 0.5em; /* Reduced for tighter spacing */
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      /* Specific URL and link handling to prevent overflow */
      .prose a {
        word-break: break-all; /* Break URLs aggressively */
        overflow-wrap: break-word;
        hyphens: auto;
      }
      /* Line clamp utilities for text truncation */
      .line-clamp-1 {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 1;
      }
      .line-clamp-2 {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
      .line-clamp-3 {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }
      .prose ul {
        list-style-type: disc;
        margin-block-start: 0;
        margin-block-end: 0.5em; /* Reduced */
        padding-inline-start: 1.25rem;
      }
      .prose ul ul {
        list-style-type: circle;
      }
      .prose ul ul ul {
        list-style-type: square;
      }
      .prose ol {
        list-style-type: decimal;
        margin-block-start: 0;
        margin-block-end: 0.5em; /* Reduced */
        padding-inline-start: 1.25rem;
      }
      .prose li p {
        display: inline;
        margin-bottom: 0.2em;
      }
      .prose li {
        overflow-wrap: break-word;
        word-break: break-word; 
        white-space: normal; 
      }
      .prose pre {
        background-color: hsl(var(--muted));
        color: hsl(var(--muted-foreground));
        padding: 1em;
        border-radius: 0.375rem; 
        overflow-x: auto; /* Horizontal scroll for wide code */
        font-size: 0.875em;
        border: 1px solid hsl(var(--border));
        /* NEW: Add vertical scrolling for very tall code blocks */
        max-height: 60vh; /* Limit height to 60% of viewport height */
        overflow-y: auto; /* Add vertical scrollbar if content exceeds max-height */
        word-break: break-all; /* Ensure long lines without spaces can break */
        white-space: pre-wrap; /* Allow wrapping and preserve whitespace */
      }
      .prose code:not(pre code) {
        background-color: hsl(var(--muted));
        color: hsl(var(--primary)); /* Using primary color for inline code for better visibility */
        padding: 0.2em 0.4em;
        margin: 0 0.1em;
        font-size: 0.85em;
        border-radius: 0.25rem;
      }
      .dark .prose pre {
        background-color: hsl(var(--secondary)); /* A slightly different dark for pre blocks */
         border: 1px solid hsl(var(--border));
      }
       .dark .prose code:not(pre code) {
        background-color: hsl(var(--secondary));
      }
      /* Responsive images in prose */
      .prose img {
        max-width: 100%; /* Ensure images are responsive by default */
        height: auto;    /* Allow image to set its own height based on aspect ratio */
        min-height: 150px; /* Reserve some minimum space to reduce layout shift on mobile */
        max-height: 350px; /* Prevent images from becoming excessively tall */
        object-fit: contain; /* Ensure the image fits within bounds & maintains aspect ratio */
        display: block;  /* Allows margin auto to work for centering */
        margin-left: auto;
        margin-right: auto;
        margin-top: 0.5em;
        margin-bottom: 0.5em;
        border-radius: 0.375rem; /* Add a slight rounding to images */
        background-color: hsl(var(--muted-foreground) / 0.05); /* Subtle background for loading state */
      }

      .dark .prose img {
        background-color: hsl(var(--muted-foreground) / 0.1); /* Slightly more visible on dark for loading */
      }

      /* Video styling to match images */
      .prose video {
        max-width: 100%;
        height: auto;
        max-height: 400px;
        border-radius: 0.375rem;
        margin: 0.5em auto;
        display: block;
        background-color: hsl(var(--muted-foreground) / 0.05);
        border: 1px solid hsl(var(--border));
      }

      .dark .prose video {
        background-color: hsl(var(--muted-foreground) / 0.1);
        border: 1px solid hsl(var(--border));
      }

      @media (min-width: 1024px) { /* Desktop screens */
        .prose img {
          max-width: 60%; /* Make images smaller on desktop */
          max-height: 500px; /* Allow larger images on desktop */
        }
        
        .prose video {
          max-width: 70%; /* Make videos slightly larger than images on desktop */
          max-height: 600px; /* Allow larger videos on desktop */
        }
      }
 
      /* Ensure ScrollArea Viewport takes full height of its ScrollAreaRoot parent */
      /* We assume ScrollAreaRoot is correctly sized by flex (e.g. flex-1 h-full min-h-0) */
      .scroll-area-viewport-target div[data-radix-scroll-area-viewport] {
        height: 100%; /* Try without !important first */
        /* overflow-y: auto; /* Ensure it can scroll its content */ /* This should be default */
      }

      /* Global style for all Radix ScrollArea Viewports */
      div[data-radix-scroll-area-viewport] {
        width: 100% !important;
        height: 100% !important;
        overflow-y: auto !important;
      }
    `;
    document.head.appendChild(style);

    // Cleanup function to remove the style when the component unmounts
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
    };
    window.addEventListener('resize', setVh);
    setVh();

    // Apply styles to prevent body scrolling and overscroll bounce
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overscrollBehaviorY = 'contain';
    document.body.style.overscrollBehaviorY = 'contain';

    // NEW: Add clipboard paste event listener
    document.addEventListener('paste', handlePaste);

    // NEW: Add keyboard event listeners for paste detection
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        setIsPasteReady(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta' || event.key === 'v') {
        setIsPasteReady(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('resize', setVh);
      document.removeEventListener('paste', handlePaste); // NEW: Cleanup paste listener
      document.removeEventListener('keydown', handleKeyDown); // NEW: Cleanup keyboard listeners
      document.removeEventListener('keyup', handleKeyUp);
      // Clean up styles on unmount
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.height = '';
      document.documentElement.style.overscrollBehaviorY = '';
      document.body.style.overscrollBehaviorY = '';
    };
  }, [handlePaste]);

  useEffect(() => {
    // Force re-render of MapDisplay when appTheme changes to apply new mapId
    setMapDisplayKey(prevKey => prevKey + 1);
  }, [appTheme]);

  // NEW: Add artifact editor state
  const [artifactEditorOpen, setArtifactEditorOpen] = useState(false);
  const [currentArtifact, setCurrentArtifact] = useState<{
    type: "web_app" | "pdf_document" | "mcp_server";
    name: string;
    url: string;
  } | null>(null);

  // NEW: Add artifacts list state
  const [artifactsListOpen, setArtifactsListOpen] = useState(false);

  // NEW: Function to open artifact editor
  const openArtifactEditor = (type: "web_app" | "pdf_document" | "mcp_server", name: string, url: string) => {
    setCurrentArtifact({ type, name, url });
    setArtifactEditorOpen(true);
  };

  // NEW: Function to handle artifact selection from ArtifactsList
  const handleArtifactSelection = (artifactName: string, artifactUrl: string, artifactType: "web_app" | "pdf_document" | "mcp_server") => {
    openArtifactEditor(artifactType, artifactName, artifactUrl);
  };

  // Add useEffect to fetch tools list on mount
  useEffect(() => {
    // Fetch available tools for the current user
    const fetchTools = async () => {
      try {
        const resp = await fetch(`${BACKEND_API_BASE_URL}/users/${apiSender.replace('+','')}/tools`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && Array.isArray(data.tools)) {
          const tools: ToolMeta[] = data.tools.map((t:any)=>({name:t.name,description:t.description||""}));
          setAvailableTools(tools);
          setSelectedTools(tools.map(t=>t.name)); // default select all
        }
      } catch(e){
        console.warn("Failed to fetch tools list",e);
      }
    };
    fetchTools();
  }, [apiSender]);

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground transition-colors duration-300 overflow-hidden">
      <header className="px-2 py-2 sm:px-4 sm:py-3 border-b border-border flex justify-between items-center bg-muted/40 transition-colors duration-300 flex-shrink-0">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:bg-muted flex-shrink-0">
                <Menu className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AST. Chat Settings
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* NEW: System Prompt Selection INSIDE DropdownMenu */}
              <DropdownMenuLabel>Style</DropdownMenuLabel>
              <div className="px-2 py-1">
                <Select value={selectedSystemPrompt} onValueChange={setSelectedSystemPrompt}>
                  <SelectTrigger className="w-full h-8">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemPromptOptions.map(option => (
                      <SelectItem key={option.value} value={option.value} className="text-sm">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <Zap className="w-3 h-3" />
                            {option.label}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/card-studio" className="flex items-center">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Buddy's Card Studio
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="w-4 h-4 mr-2" />
                Preferences
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Zap className="w-4 h-4 mr-2" />
                Keyboard Shortcuts
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                Clear Chat History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Enhanced Model Selection */}
          <div className="hidden sm:flex items-center space-x-2">
            <Badge variant="secondary" className="text-xs">
              Model
            </Badge>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map(option => (
                  <SelectItem key={option.value} value={option.value} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Bot className="w-3 h-3" />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Current Style Indicator */}
          {selectedSystemPrompt !== "default" && (
            <Badge variant="outline" className="text-xs flex-shrink-0">
              {systemPromptOptions.find(opt => opt.value === selectedSystemPrompt)?.label}
            </Badge>
          )}
          {/* Tool Selection Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                Tools ({selectedTools.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-64 overflow-y-auto w-56">
              <DropdownMenuLabel>Select Tools</DropdownMenuLabel>
              {/* Bulk selection controls */}
              <DropdownMenuItem className="text-xs font-medium gap-2" onSelect={(e)=>{e.preventDefault(); setSelectedTools(availableTools.map(t=>t.name));}}>
                Select All
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs font-medium gap-2" onSelect={(e)=>{e.preventDefault(); setSelectedTools([]);}}>
                Deselect All
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {availableTools.map(tool => (
                <DropdownMenuItem key={tool.name} className="gap-2" onSelect={(e)=>{e.preventDefault();}}>
                  <input
                    type="checkbox"
                    className="flex-shrink-0 h-3 w-3 accent-primary mr-1"
                    checked={selectedTools.includes(tool.name)}
                    onChange={(e)=>{
                      const checked = e.target.checked;
                      setSelectedTools(prev=>{
                        if(checked){return [...prev, tool.name];}
                        return prev.filter(n=>n!==tool.name);
                      });
                    }}
                  />
                  <span className="text-xs truncate" title={tool.description}>{tool.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Status Badge REMOVED */}
          {/*
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant={status === 'Ready' ? 'default' : status === 'Processing...' ? 'secondary' : 'destructive'}
                  className="text-xs cursor-help"
                >
                  {status === 'Ready' && <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5" />}
                  {status === 'Processing...' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  {status}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Current system status</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          */}

          {/* NEW: Artifacts List Button */}
          <ArtifactsList
            userNumber={apiSender}
            open={artifactsListOpen}
            onOpenChange={setArtifactsListOpen}
            onSelectApp={handleArtifactSelection}
          />
          
          <ModeToggle />
        </div>
      </header>

      {/* Allow main to scroll if needed, ScrollArea will be auto height within it */}
      <main className="flex-grow flex flex-col relative transition-colors duration-300 overflow-hidden min-h-0">
        {showInitialView ? (
          <div id="initialView" className="text-center w-full px-2 flex-grow flex flex-col justify-center items-center">
            <h1 className="text-3xl sm:text-4xl font-semibold text-foreground mb-2 transition-colors duration-300">
              AST. Chat
            </h1>
            <p className="text-md sm:text-lg text-muted-foreground mb-6 sm:mb-10 transition-colors duration-300">
              How can I help you today?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-4xl lg:max-w-5xl xl:max-w-7xl mx-auto w-full">
              {/* Special Card Studio Button */}
              <Link href="/card-studio" className="col-span-1 sm:col-span-2">
                <Button
                  variant="outline"
                  className="h-auto text-left p-4 sm:p-6 border-border rounded-lg shadow hover:shadow-md dark:hover:bg-muted transition w-full bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border-pink-200 dark:border-pink-800"
                >
                  <div className="flex items-center gap-4 w-full">
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-base sm:text-lg">
                        🎨 Buddy's Card Studio
                      </h3>
                      <p className="text-sm sm:text-base text-muted-foreground">
                        Create beautiful AI-powered greeting cards for birthdays, holidays, and special occasions
                      </p>
                    </div>
                  </div>
                </Button>
              </Link>
              
              {examplePrompts.map((prompt, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="h-auto text-left p-3 sm:p-4 border-border rounded-lg shadow hover:shadow-md dark:hover:bg-muted transition"
                  onClick={() => handleExamplePromptClick(prompt.title, prompt.detail)}
                >
                  <h3 className="font-semibold text-foreground text-sm sm:text-base">
                    {prompt.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {prompt.detail}
                  </p>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="w-full mx-auto flex-1 min-h-0" ref={scrollAreaRef}>
            <div id="chatLog" className="space-y-3 sm:space-y-4 flex flex-col pb-[calc(68px+env(safe-area-inset-bottom))] max-w-4xl lg:max-w-5xl xl:max-w-7xl mx-auto px-2 sm:px-4 pt-2 sm:pt-4">
              {messages.map((msg) => {
                // Define base and conditional classes for the message bubble
                let bubbleClasses = "flex flex-col break-words"; // Common base for all
                let thinkingIndicatorColor = "text-muted-foreground"; // Default for thinking indicator

                if (msg.sender === "user") {
                  bubbleClasses += " p-2 rounded-2xl max-w-[95%] sm:max-w-[85%] bg-sky-400 text-sky-900 self-end";
                } else { // Bot message
                  if (msg.is_error_message) {
                    bubbleClasses += " px-1 py-1 sm:p-2 rounded-xl max-w-[95%] sm:max-w-[85%] bg-destructive text-destructive-foreground self-start rounded-bl-sm";
                    thinkingIndicatorColor = "text-destructive-foreground"; // Match error bubble text
                  } else {
                    // Normal bot message - less "bubble" like ChatGPT
                    bubbleClasses += " w-full self-start py-1 sm:py-2 text-foreground"; // Use page foreground color
                    // Add some vertical margin to distinguish bot messages, and horizontal padding for content.
                    bubbleClasses += " my-2 sm:my-3 px-1 sm:px-2"; 
                    thinkingIndicatorColor = "text-foreground"; // Match normal bot text
                  }
                }

                // Compute which parts to render: for direction messages, only show text before the get_directions tool call
                const partsToRender = msg.directionsData
                  ? (() => {
                      const idx = msg.parts.findIndex(p => p.type === "tool_call" && p.toolCall.name === "get_directions");
                      return idx >= 0 ? msg.parts.slice(0, idx) : msg.parts;
                    })()
                  : msg.parts;

                // Debug: Log previews for this message
                const messagePreviews = getPreviewsForMessage(msg.id);
                if (messagePreviews.length > 0) {
                  console.log(`[PAGE.TSX] Message ${msg.id} has ${messagePreviews.length} previews:`, messagePreviews);
                }

                return (
                  <div
                    key={msg.id}
                    className={bubbleClasses} // Use the dynamically constructed classes
                  >
                    {partsToRender.map((part) => (
                      <React.Fragment key={part.id}>
                        {part.type === "text" && part.content && (
                          <div className="w-full max-w-full min-w-0">
                            <div 
                              className="message-content prose dark:prose-invert w-full max-w-full min-w-0 text-part-fade-in" 
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                              dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(part.content) }} 
                            />
                          </div>
                        )}
                        {part.type === "tool_call" && (
                          <>
                            <ToolCallDisplay toolCall={part.toolCall} renderSanitizedMarkdown={renderSanitizedMarkdown} />
                            {/* Render ContentPreviews inline right after each tool call */}
                            {getPreviewsForMessage(msg.id).filter(preview => 
                              preview.toolCall?.call_id === part.toolCall.call_id
                            ).map((preview) => {
                              console.log(`[PAGE.TSX] Rendering ContentPreview for tool call ${part.toolCall.call_id}:`, preview);
                              return (
                                <ContentPreview
                                  key={preview.id}
                                  id={preview.id}
                                  type={preview.type}
                                  data={preview.data}
                                  toolCall={preview.toolCall}
                                  onUpdate={updatePreview}
                                />
                              );
                            })}
                            {/* NEW: Render ImageDisplay directly after generate_images_with_prompts tool call */}
                            {part.toolCall.name === "generate_images_with_prompts" && 
                             part.toolCall.status === "Completed" && 
                             !part.toolCall.is_error && 
                             msg.generatedImageUrls && 
                             msg.generatedImageUrls.length > 0 && (
                              <div className="mt-4 border rounded-lg shadow-md bg-muted/40 overflow-hidden">
                                <div className="flex items-center justify-between p-3 bg-background border-b border-border">
                                  <h4 className="text-sm font-semibold text-foreground">Generated Images</h4>
                                </div>
                                <div className="bg-background">
                                  <ImageDisplay imageUrls={msg.generatedImageUrls} />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {part.type === "thought_summary" && (
                          <details
                            key={`${part.id}-thought-details`}
                            className="thought-summary-details my-2 rounded-lg border border-border bg-muted/20 shadow-sm"
                            open={false}
                          >
                            <summary className="thought-summary-summary cursor-pointer p-3 list-none flex items-center justify-between text-sm font-medium text-muted-foreground hover:bg-muted/40 rounded-t-lg">
                              {msg.thinking ? (
                                <div className="flex items-center">
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  <span className="italic">AST. thinking</span>
                                </div>
                              ) : (
                                <span className="italic">Thought Process</span>
                              )}
                              <ChevronDown className="w-5 h-5 transition-transform duration-200 details-arrow" />
                            </summary>
                            {part.content && (
                              <div className="w-full max-w-full min-w-0 p-3 border-t border-border bg-background rounded-b-lg">
                                <div
                                  className="message-content prose-sm italic text-muted-foreground dark:prose-invert w-full max-w-full min-w-0 text-part-fade-in"
                                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                  dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(part.content) }}
                                />
                              </div>
                            )}
                            {msg.thinking && !part.content && (
                              <div className="w-full max-w-full min-w-0 p-3 border-t border-border bg-background rounded-b-lg">
                                <div className="space-y-2">
                                  <Skeleton className="h-3 w-[250px]" />
                                  <Skeleton className="h-3 w-[200px]" />
                                  <Skeleton className="h-3 w-[180px]" />
                                </div>
                              </div>
                            )}
                          </details>
                        )}
                      </React.Fragment>
                    ))}
                    
                    {/* REMOVED: Global content preview rendering - now handled inline above */}
                    
                    {msg.directionsData && (
                      <>
                        {console.log("[PAGE.TSX] Rendering MapDisplay for message", msg.id, msg.directionsData)}
                        <div className="border rounded-lg shadow-md bg-muted/40 p-0 overflow-hidden mt-2">
                          <MapDisplay
                            key={mapDisplayKey}
                            directionsResponse={msg.directionsData}
                            googleMapsApiKey={googleMapsApiKey}
                            showTraffic={showTraffic}
                            theme={appTheme === 'dark' ? nightTheme : defaultTheme}
                          />
                        </div>
                        {msg.directionsData?.routes?.[0]?.legs?.[0] && (
                          <div className="p-2">
                            <DirectionsSteps
                              steps={msg.directionsData.routes[0].legs[0].steps}
                              totalDuration={msg.directionsData.routes[0].legs[0].duration?.text}
                              totalDistance={msg.directionsData.routes[0].legs[0].distance?.text}
                            />
                          </div>
                        )}
                      </>
                    )}
                    {/* Web App Action Buttons - Enhanced fallback for both create and edit */}
                    {/* Only show fallback if ContentPreview system isn't handling this message */}
                    {((msg.showWebAppForThisMessage && msg.webAppUrl) || 
                     (msg.parts.some(part => 
                       part.type === "tool_call" && 
                       (part.toolCall.name === "create_web_app" || part.toolCall.name === "edit_web_app") &&
                       part.toolCall.status === "Completed" &&
                       !part.toolCall.is_error &&
                       part.toolCall.result
                     ))) && 
                     /* Only show if ContentPreview system isn't already handling this */
                     getPreviewsForMessage(msg.id).filter(preview => preview.type === 'web_app').length === 0 ? (
                      <div className="mt-4 border rounded-lg shadow-md bg-muted/40 overflow-hidden">
                        <div className="flex items-center justify-between p-3 bg-background border-b border-border">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground">
                              {msg.parts.find(part => 
                                part.type === "tool_call" && 
                                part.toolCall.name === "edit_web_app"
                              ) ? "Web Application Edited" : "Web Application Created"}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2">
                            {(() => {
                              // Extract URL from either the message or tool call result
                              let appUrl = msg.webAppUrl;
                              if (!appUrl) {
                                const webAppToolCall = msg.parts.find(part => 
                                  part.type === "tool_call" && 
                                  (part.toolCall.name === "create_web_app" || part.toolCall.name === "edit_web_app") &&
                                  part.toolCall.result
                                );
                                if (webAppToolCall && webAppToolCall.type === "tool_call") {
                                  try {
                                    const result = JSON.parse(webAppToolCall.toolCall.result!);
                                    appUrl = result.url;
                                  } catch (e) {
                                    console.warn("Failed to parse web app result for URL:", e);
                                  }
                                }
                              }
                              
                              return appUrl ? (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  asChild
                                  className="gap-2"
                                >
                                  <a href={appUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4" />
                                    Open in New Tab
                                  </a>
                                </Button>
                              ) : null;
                            })()}
                          </div>
                        </div>
                        {(() => {
                          // Show iframe preview if we have a URL
                          let appUrl = msg.webAppUrl;
                          let appName = "Web Application";
                          
                          if (!appUrl) {
                            const webAppToolCall = msg.parts.find(part => 
                              part.type === "tool_call" && 
                              (part.toolCall.name === "create_web_app" || part.toolCall.name === "edit_web_app") &&
                              part.toolCall.result
                            );
                            if (webAppToolCall && webAppToolCall.type === "tool_call") {
                              try {
                                const result = JSON.parse(webAppToolCall.toolCall.result!);
                                appUrl = result.url;
                                appName = result.app_name || appName;
                              } catch (e) {
                                console.warn("Failed to parse web app result:", e);
                              }
                            }
                          }
                          
                          return appUrl ? (
                            <div className="bg-background">
                              <iframe
                                src={appUrl}
                                className="w-full h-64 sm:h-80 md:h-96"
                                title={`Web App Preview: ${appName}`}
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
                                loading="lazy"
                              />
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </main>

      <footer className="flex-none px-2 pb-[env(safe-area-inset-bottom)] pt-2 sm:px-4 sm:pb-[env(safe-area-inset-bottom)] sm:pt-3 bg-muted/40 border-t border-border transition-colors duration-300 flex-shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl lg:max-w-5xl xl:max-w-7xl mx-auto">
          <TooltipProvider>
            <div className={`flex items-center bg-background border border-input rounded-xl shadow-sm p-2 transition-colors duration-300 focus-within:ring-2 focus-within:ring-ring ${isPasteReady ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' : ''}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-foreground" 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Attach files (images, documents, etc.)</p>
                  <p className="text-xs text-muted-foreground mt-1">💡 Tip: You can also paste images directly!</p>
                </TooltipContent>
              </Tooltip>
              {/* Hidden file input */}
              <input 
                type="file" 
                multiple 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                style={{ display: 'none' }} 
                accept="image/*,.heic,.heif,application/pdf,.txt,.md,.py,.js,.html,.css,.json,.csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    type="button" 
                    variant={sendLocation ? "secondary" : "ghost"} 
                    size="icon" 
                    onClick={() => setSendLocation(!sendLocation)}
                    className={`mr-2 ${sendLocation ? "text-primary" : "text-muted-foreground"} hover:text-foreground`}
                  >
                    <MapPin className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sendLocation ? "Stop sending location" : "Send current location with query"}</p>
                </TooltipContent>
              </Tooltip>
              <Input
                type="text"
                id="userInput"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="flex-grow p-2 bg-transparent focus:outline-none border-0 focus:ring-0 placeholder-muted-foreground"
                placeholder={isPasteReady ? "📋 Ready to paste images..." : "Send a message..."}
                autoComplete="off"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    type="submit" 
                    variant="default" 
                    size="icon" 
                    disabled={!(userInput.trim() || selectedFiles.length > 0) || status !== 'Ready'} 
                    className="rounded-lg"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Send message</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </form>
        {/* Enhanced selected files display */}
        {selectedFiles.length > 0 && (
          <div className="max-w-4xl lg:max-w-5xl xl:max-w-7xl mx-auto mt-3">
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Selected Files ({selectedFiles.length})
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {selectedFiles.reduce((total, file) => total + file.size, 0) > 1024 * 1024 
                      ? `${(selectedFiles.reduce((total, file) => total + file.size, 0) / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.round(selectedFiles.reduce((total, file) => total + file.size, 0) / 1024)} KB`
                    }
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {selectedFiles.map(file => (
                    <div key={file.name} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                        <span className="text-sm truncate">{file.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(file.size / 1024)} KB
                        </Badge>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeSelectedFile(file.name)} 
                        className="text-red-500 hover:text-red-700 h-6 w-6 p-0 flex-shrink-0"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Enhanced file processing status */}
        {fileProcessingStatus && (
          <div className="max-w-4xl lg:max-w-5xl xl:max-w-7xl mx-auto mt-3">
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Processing Files
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {fileProcessingStatus}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </footer>
      
      {/* NEW: Artifact Editor Dialog */}
      {currentArtifact && (
        <ArtifactEditor
          artifactType={currentArtifact.type}
          artifactName={currentArtifact.name}
          artifactUrl={currentArtifact.url}
          userNumber={apiSender}
          open={artifactEditorOpen}
          onOpenChange={setArtifactEditorOpen}
        />
      )}
    </div>
  );
}