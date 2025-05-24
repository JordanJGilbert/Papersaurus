"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Menu, Lock, Paperclip, ArrowUp, MapPin, Loader2 } from "lucide-react";
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import ToolCallDisplay from "@/components/tool-call-display";
import MapDisplay, { defaultTheme, nightTheme } from "@/components/MapDisplay";
import DirectionsSteps from "@/components/DirectionsSteps";
import { useTheme } from "next-themes";

// Ensure marked runs synchronously for this page too, if not already global
marked.setOptions({ async: false });

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5001'; // Default to localhost:5001

// --- ADD a Default Map ID ---
// This Map ID is necessary for Advanced Markers to function.
// Replace with any valid Map ID from your Google Cloud Project.
// const GOOGLE_MAPS_DEFAULT_MAP_ID = "f07c6e7b6a1c874e8f0d8306"; // Using your previous dark Map ID as an example

// NEW: Define Map IDs for light and dark themes
// TODO: Replace these placeholder IDs with your actual Map IDs from Google Cloud Console
/* // REMOVING THIS BLOCK
const GOOGLE_MAPS_THEME_IDS = {
  light: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_LIGHT_ID || "YOUR_LIGHT_MODE_MAP_ID_HERE", // Replace with your light theme Map ID
  dark: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_DARK_ID || "YOUR_DARK_MODE_MAP_ID_HERE",   // Replace with your dark theme Map ID (e.g., f07c6e7b6a1c874e8f0d8306)
};
*/
// ---

interface ToolCallData {
  call_id: string;
  name: string;
  arguments: string;
  result?: string;
  status?: "Pending..." | "Completed" | "Error" | "Streaming...";
  is_error?: boolean;
  is_partial?: boolean;
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
}

export default function ChatPage() {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]); // <-- New state for selected files
  const fileInputRef = useRef<HTMLInputElement>(null); // <-- Ref for file input
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

  const { theme: appTheme } = useTheme(); // Get current application theme

  // Define available models as an array of objects for the dropdown
  const modelOptions = [
    { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
    // Add more models here in the future
    // { value: "gpt-4.1-2025-04-14", label: "GPT-4.1" }, 
  ];
  const [selectedModel, setSelectedModel] = useState(modelOptions[1].value); // Default to the second model (Pro)

  const examplePrompts = [
    { title: "What are the advantages", detail: "of using Next.js?" },
    { title: "Write code to", detail: "demonstrate dijkstra\\'s algorithm" },
    { title: "Help me write an essay", detail: "about silicon valley" },
    { title: "What is the weather", detail: "in San Francisco?" },
  ];

  const renderSanitizedMarkdown = (text: string): string => {
    // This function assumes it's running in a browser environment
    // due to the "use client" directive on the component and use of DOMPurify.
    // marked.parse is configured to run synchronously.
    const dirtyHtml = marked.parse(text, { gfm: true, breaks: true }) as string;
    return DOMPurify.sanitize(dirtyHtml);
  };

  // Helper to ensure markdown block elements are properly spaced
  const normalizeFragment = (fragment: string, _prevContent: string): string => {
    // TEMPORARILY A PASS-THROUGH
    return fragment;
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
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files || [])]);
      event.target.value = ''; // Reset file input to allow selecting the same file again
    }
  };

  const removeSelectedFile = (fileNameToRemove: string) => {
    setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileNameToRemove));
  };

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

  const handleSend = async (e?: FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (e && typeof (e as FormEvent<HTMLFormElement>).preventDefault === 'function') {
      (e as FormEvent<HTMLFormElement>).preventDefault();
    }
    
    let currentMessageText = userInput.trim(); // Use a mutable variable for message text
    if (!currentMessageText && selectedFiles.length === 0) return; // Return if no text and no files

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
          // Display error to user immediately, similar to before, but tied to bot's thinking message
          const tempBotMessageId = uuidv4(); // Create a temporary ID for this error message
          setMessages(prev => [
            ...prev, // Keep previous messages
            { // Add the user's attempt (if any text was typed)
              id: uuidv4(),
              sender: "user",
              parts: currentMessageText ? [{ type: "text", id: uuidv4(), content: currentMessageText }] : [],
              timestamp: Date.now(),
            },
            { // Add the bot's error response
              id: tempBotMessageId,
              sender: 'bot',
              parts: [{type: "text", id: uuidv4(), content: `<strong style=\"color: red;\">Location Error:</strong> ${locationError}`}],
              timestamp: Date.now(),
              thinking: false,
              is_error_message: true
            }
          ]);
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

    const userMessageId = uuidv4();
    const userMessageParts: MessagePart[] = [];
    if (currentMessageText) { // Use potentially modified message text
      userMessageParts.push({ type: "text", id: uuidv4(), content: currentMessageText });
    }

    if (selectedFiles.length > 0) {
      const attachmentText = selectedFiles.map(f => f.name).join(', ');
      userMessageParts.push({
        type: "text",
        id: uuidv4(),
        content: `(Attached: ${attachmentText})`
      });
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
      const attachmentsForPayload: { filename: string, mimeType: string, data: string }[] = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            const base64Data = await fileToBase64(file);
            attachmentsForPayload.push({
              filename: file.name,
              mimeType: file.type || 'application/octet-stream', // provide a default mime type
              data: base64Data,
            });
          } catch (fileError) {
            console.error("Error converting file to base64:", file.name, fileError);
            // Optionally, notify the user about the failed file conversion for this specific file
            // For now, we'll just log it and skip this file.
          }
        }
      }

      const payload = {
        sender: apiSender,
        query: currentMessageText, // Use the (potentially augmented) messageText
        timestamp: Date.now(),
        stream: true,
        model: selectedModel,
        attachments: attachmentsForPayload.length > 0 ? attachmentsForPayload : undefined,
      };

      // Clear selected files now that they're in the payload
      setSelectedFiles([]);

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
            // Process any remaining data in the buffer when the stream is done
            if (buffer.trim() !== '') {
                try {
                    const parsedChunk = JSON.parse(buffer);
                    console.log('[PAGE.TSX] Final Buffer Chunk:', JSON.stringify(parsedChunk));
                    // Process the final chunk (similar to processing below)
                    // This logic might need to be DRYed up or refactored based on how you handle various chunk types
                    if (parsedChunk.type === 'text_chunk' && parsedChunk.content) {
                        setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                console.log(`[PAGE.TSX] Updating message ${msg.id} with text_chunk. Current parts:`, JSON.parse(JSON.stringify(msg.parts))); // DEEP COPY LOGGING
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
                    } else if (parsedChunk.type === 'tool_call_pending' && parsedChunk.name && parsedChunk.arguments) {
                        const call_id_from_chunk = parsedChunk.call_id || `tool-${uuidv4()}`;
                        setMessages(prev => prev.map(msg => {
                            if (msg.id === botMessageId) {
                                const existingToolCallPart = msg.parts.find(part =>
                                    part.type === "tool_call" && part.toolCall.call_id === call_id_from_chunk
                                );

                                if (existingToolCallPart) {
                                    console.log(`[PAGE.TSX] (final buffer) Tool call with ID ${call_id_from_chunk} already exists in pending state. Ignoring duplicate pending message.`);
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
                                console.log('[PAGE.TSX] Received tool_result chunk:', JSON.parse(JSON.stringify(parsedChunk))); // DEEP COPY LOGGING
                                if (parsedChunk.name === "get_directions") {
                                    console.log("[PAGE.TSX] RAW get_directions tool_result CHUNK:", JSON.stringify(parsedChunk));
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

                                        // --- NEW: Extract get_directions_response ---
                                        let toolResponse = null;
                                        if (
                                            tc.name === "get_directions" &&
                                            parsedChunk.result &&
                                            typeof parsedChunk.result === 'object'
                                        ) {
                                            const responseKey = `${tc.name}_response`;
                                            toolResponse = parsedChunk.result[responseKey];
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
                                            console.log(
                                                "[PAGE.TSX] Setting directionsData (final buffer) with:",
                                                JSON.stringify(toolResponse.data).substring(0, 200) + "..."
                                            );
                                            setDirectionsData(toolResponse.data);
                                            setMapDisplayKey(prevKey => prevKey + 1);
                                            setIsMapSectionVisible(true); // MODIFIED: Show map section automatically
                                            // Flag will be added to finalMsgObject before returning
                                        } else if (
                                            tc.name === "get_directions" &&
                                            !toolResponse
                                        ) {
                                            console.error(
                                                "[PAGE.TSX] ERROR (final buffer): get_directions_response missing in parsedChunk.result!"
                                            );
                                        }

                                        return { ...part, toolCall: updatedToolCall };
                                    }
                                    return part;
                                });
                                if (!matchedToolCallInParts) {
                                    console.warn(
                                        `[PAGE.TSX] (final buffer) Tool call with id ${parsedChunk.call_id} not found in message ${msg.id} parts`
                                    );
                                }
                                
                                // --- NEW: Attach directionsData to message for rendering ---
                                let toolResponse = null;
                                if (
                                    parsedChunk.name === "get_directions" &&
                                    parsedChunk.result &&
                                    typeof parsedChunk.result === 'object'
                                ) {
                                    const responseKey = `${parsedChunk.name}_response`;
                                    toolResponse = parsedChunk.result[responseKey];
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
                                }
                                // --- END NEW ---
                                return finalMsgObject;
                            }
                            return msg;
                        }));
                    } else if (parsedChunk.type === 'stream_end') {
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
            // Ensure thinking is false if not already set by a 'stream_end' chunk from the stream itself
            setMessages(prev => prev.map(msg => msg.id === botMessageId && msg.thinking ? {...msg, thinking: false } : msg));
            if (status !== 'Ready') setStatus('Ready'); // Ensure status is reset
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;

        // Process all complete JSON lines in the buffer
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.substring(0, newlineIndex);
            buffer = buffer.substring(newlineIndex + 1);

            if (line.trim() === '') continue;
            try {
                const parsedChunk = JSON.parse(line);
                console.log('[PAGE.TSX] Streamed Chunk:', JSON.stringify(parsedChunk));
            
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
                                    if (
                                        tc.name === "get_directions" &&
                                        parsedChunk.result &&
                                        typeof parsedChunk.result === 'object'
                                    ) {
                                        const responseKey = `${tc.name}_response`;
                                        toolResponse = parsedChunk.result[responseKey];
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
                            if (
                                parsedChunk.name === "get_directions" &&
                                parsedChunk.result &&
                                typeof parsedChunk.result === 'object'
                            ) {
                                const responseKey = `${parsedChunk.name}_response`;
                                toolResponse = parsedChunk.result[responseKey];
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
                            }
                            // --- END NEW ---
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
      /* Add some basic prose styling for markdown content if not already globally available */
      .prose {
        line-height: 1.35; /* Increased for better readability */
        font-size: 0.94rem;
      }
      .prose p { 
        margin-bottom: 0.5em; /* Reduced for tighter spacing */
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
        overflow-x: auto;
        font-size: 0.875em;
        border: 1px solid hsl(var(--border));
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

      @media (min-width: 1024px) { /* Desktop screens */
        .prose img {
          max-width: 60%; /* Make images smaller on desktop */
          max-height: 500px; /* Allow larger images on desktop */
        }
      }
    `;
    document.head.appendChild(style);

    // Cleanup function to remove the style when the component unmounts
    return () => {
      document.head.removeChild(style);
    };
  }, []); // Empty dependency array ensures this runs only once on mount and unmount

  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
    };
    window.addEventListener('resize', setVh);
    setVh();
    return () => window.removeEventListener('resize', setVh);
  }, []);

  useEffect(() => {
    // Force re-render of MapDisplay when appTheme changes to apply new mapId
    setMapDisplayKey(prevKey => prevKey + 1);
  }, [appTheme]);

  return (
    <div className="flex flex-col h-[calc(var(--vh))] bg-background text-foreground transition-colors duration-300">
      <header className="px-2 py-2 sm:px-4 sm:py-3 border-b border-border flex justify-between items-center bg-muted/40 transition-colors duration-300">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="hover:bg-muted">
            <Menu className="w-5 h-5" />
          </Button>
          {/* Replace Button with a Select dropdown for model selection */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-background border border-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring hover:bg-muted cursor-pointer appearance-none pr-8 w-auto sm:min-w-[150px]"
            >
              {modelOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <ModeToggle />
          <Button variant="ghost" size="icon" className="hover:bg-muted">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center p-2 sm:p-4 relative overflow-hidden transition-colors duration-300">
        {showInitialView ? (
          <div id="initialView" className="text-center w-full px-2 flex-grow flex flex-col justify-center items-center">
            <h1 className="text-3xl sm:text-4xl font-semibold text-foreground mb-2 transition-colors duration-300">
              AST. Chat
            </h1>
            <p className="text-md sm:text-lg text-muted-foreground mb-6 sm:mb-10 transition-colors duration-300">
              How can I help you today?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-2xl lg:max-w-3xl xl:max-w-6xl mx-auto w-full">
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
          <ScrollArea className="w-full max-w-3xl lg:max-w-4xl xl:max-w-6xl mx-auto flex-grow" ref={scrollAreaRef}>
            <div id="chatLog" className="space-y-3 sm:space-y-4 flex flex-col pb-[calc(68px+env(safe-area-inset-bottom))]">
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
                return (
                  <div
                    key={msg.id}
                    className={bubbleClasses} // Use the dynamically constructed classes
                  >
                    {partsToRender.map((part) => (
                      <React.Fragment key={part.id}>
                        {part.type === "text" && part.content && (
                           <div 
                                key={`${part.id}-${part.content.length}`}
                                className="message-content prose dark:prose-invert max-w-none text-part-fade-in" 
                                dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(part.content) }} />
                        )}
                        {part.type === "tool_call" && (
                          <ToolCallDisplay toolCall={part.toolCall} />
                        )}
                        {part.type === "thought_summary" && (
                          <details
                            key={`${part.id}-thought-details`}
                            className="thought-summary-details my-2 rounded-lg border border-border bg-muted/20 shadow-sm"
                            open={msg.thinking || !!part.content}
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
                              <div
                                key={`${part.id}-thought-content`}
                                className="message-content prose-sm italic text-muted-foreground dark:prose-invert max-w-none p-3 border-t border-border bg-background rounded-b-lg text-part-fade-in"
                                dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(part.content) }}
                              />
                            )}
                          </details>
                        )}
                      </React.Fragment>
                    ))}
                    {msg.directionsData && (
                      <>
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
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </main>

      <footer className="flex-none px-2 pb-[env(safe-area-inset-bottom)] pt-2 sm:px-4 sm:pb-[env(safe-area-inset-bottom)] sm:pt-3 bg-muted/40 border-t border-border transition-colors duration-300">
        <form onSubmit={handleSend} className="max-w-3xl lg:max-w-4xl xl:max-w-6xl mx-auto">
          <div className="flex items-center bg-background border border-input rounded-xl shadow-sm p-2 transition-colors duration-300 focus-within:ring-2 focus-within:ring-ring">
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-foreground" 
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
            >
              <Paperclip className="w-5 h-5" />
            </Button>
            {/* Hidden file input */}
            <input 
              type="file" 
              multiple 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              style={{ display: 'none' }} 
              accept="image/*,application/pdf,.txt,.md,.py,.js,.html,.css,.json,.csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            />
            <Button 
              type="button" 
              variant={sendLocation ? "secondary" : "ghost"} 
              size="icon" 
              onClick={() => setSendLocation(!sendLocation)}
              className={`mr-2 ${sendLocation ? "text-primary" : "text-muted-foreground"} hover:text-foreground`}
              title={sendLocation ? "Stop sending location" : "Send current location with query"}
            >
              <MapPin className="w-5 h-5" />
            </Button>
            <Input
              type="text"
              id="userInput"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              className="flex-grow p-2 bg-transparent focus:outline-none border-0 focus:ring-0 placeholder-muted-foreground"
              placeholder="Send a message..."
              autoComplete="off"
            />
            <Button type="submit" variant="default" size="icon" disabled={!(userInput.trim() || selectedFiles.length > 0) || status !== 'Ready'} className="rounded-lg">
              <ArrowUp className="w-5 h-5" />
            </Button>
          </div>
        </form>
        {/* Display selected files (optional UX) */}
        {selectedFiles.length > 0 && (
          <div className="max-w-3xl lg:max-w-4xl xl:max-w-6xl mx-auto mt-2 text-xs text-muted-foreground">
            <p className="font-medium mb-1">Selected files:</p>
            <ul className="list-disc list-inside pl-1 space-y-0.5">
              {selectedFiles.map(file => (
                <li key={file.name} className="flex items-center justify-between">
                  <span>{file.name} ({Math.round(file.size / 1024)} KB)</span>
                  <Button variant="ghost" size="sm" onClick={() => removeSelectedFile(file.name)} className="text-red-500 hover:text-red-700 p-1 h-auto">
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
         <p className="text-xs text-muted-foreground/80 text-center mt-2 pb-1">Status: {status}</p>
      </footer>
    </div>
  );
} 