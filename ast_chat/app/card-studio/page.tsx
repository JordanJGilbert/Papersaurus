"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Sparkles, Download, Printer, Heart, Gift, GraduationCap, Calendar, Wand2, MessageSquarePlus, RotateCcw, Zap, Palette, Edit3 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import CardPreview from "@/components/CardPreview";
import PrintLayout from "@/components/PrintLayout";
import { ModeToggle } from "@/components/mode-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5001';

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCoverImageUrl: string;
  interiorLeftImageUrl: string;
  interiorRightImageUrl: string;
  createdAt: Date;
}

interface MessageHistoryItem {
  role: 'user_instruction' | 'ai_suggestion';
  content: string;
}

const cardTypes = [
  { id: "birthday", label: "Birthday", icon: Gift, color: "bg-blue-500" },
  { id: "christmas", label: "Christmas", icon: Heart, color: "bg-red-500" },
  { id: "graduation", label: "Graduation", icon: GraduationCap, color: "bg-cyan-500" },
  { id: "anniversary", label: "Anniversary", icon: Heart, color: "bg-rose-500" },
  { id: "general", label: "General", icon: Calendar, color: "bg-emerald-500" },
];

// Custom artistic styles
const artisticStyles = [
  { 
    id: "studio-ghibli", 
    label: "Studio Ghibli", 
    icon: Sparkles, 
    color: "bg-green-500",
    description: "Whimsical, nature-inspired art with soft colors and magical elements. All text appears handwritten in a charming, organic style.",
    promptModifier: "in the style of Studio Ghibli animation, with whimsical nature elements, soft watercolor-like colors, magical atmosphere, rolling hills, floating spirits, and charming handwritten text throughout"
  },
  { 
    id: "watercolor", 
    label: "Watercolor", 
    icon: Palette, 
    color: "bg-blue-400",
    description: "Soft, flowing watercolor paintings with gentle color bleeds and artistic brush strokes.",
    promptModifier: "in watercolor painting style, with soft flowing colors, gentle color bleeds, artistic brush strokes, and delicate transparent layers"
  },
  { 
    id: "vintage-botanical", 
    label: "Vintage Botanical", 
    icon: Heart, 
    color: "bg-emerald-600",
    description: "Classic botanical illustrations with vintage charm, detailed flora, and elegant typography.",
    promptModifier: "in vintage botanical illustration style, with detailed hand-drawn flowers, leaves, and plants, muted earth tones, classic scientific illustration aesthetic, and elegant vintage typography"
  },
  { 
    id: "minimalist-modern", 
    label: "Minimalist Modern", 
    icon: Edit3, 
    color: "bg-gray-600",
    description: "Clean, simple designs with plenty of white space and modern typography.",
    promptModifier: "in minimalist modern style, with clean lines, plenty of white space, simple geometric shapes, modern sans-serif typography, and a sophisticated color palette"
  },
  { 
    id: "hand-drawn-sketchy", 
    label: "Hand-Drawn Sketchy", 
    icon: Edit3, 
    color: "bg-amber-600",
    description: "Artistic hand-drawn sketches with visible pencil strokes and organic, imperfect lines.",
    promptModifier: "in hand-drawn sketchy style, with visible pencil strokes, organic imperfect lines, artistic sketching techniques, crosshatching, and completely handwritten text with natural imperfections"
  },
  { 
    id: "art-nouveau", 
    label: "Art Nouveau", 
    icon: Sparkles, 
    color: "bg-purple-600",
    description: "Elegant flowing curves, ornate decorative elements, and nature-inspired motifs.",
    promptModifier: "in Art Nouveau style, with elegant flowing curves, ornate decorative borders, nature-inspired motifs, flowing organic lines, and decorative vintage typography"
  }
];

// Available image generation models
const imageModels = [
  { 
    id: "gpt-image-1", 
    label: "GPT-1", 
    description: "OpenAI's latest model - highest quality, best for detailed artwork",
    icon: Zap,
    color: "text-blue-600"
  },
  { 
    id: "imagen-4.0-generate-preview-06-06", 
    label: "Imagen 4.0", 
    description: "Google's balanced model - great quality and speed",
    icon: Palette,
    color: "text-green-600"
  },
  { 
    id: "imagen-4.0-fast-generate-preview-06-06", 
    label: "Imagen 4.0 Fast", 
    description: "Google's fastest model - quick generation",
    icon: Palette,
    color: "text-orange-600"
  },
  { 
    id: "imagen-4.0-ultra-generate-preview-06-06", 
    label: "Imagen 4.0 Ultra", 
    description: "Google's highest quality model - premium results",
    icon: Palette,
    color: "text-indigo-600"
  },
];

// AI Chat Helper Function - Using ai_chat tool instead of direct /query
async function chatWithAI(userMessage: string, options: {
  systemPrompt?: string | null;
  model?: string;
  includeThoughts?: boolean;
  jsonSchema?: any;
} = {}) {
  const {
    systemPrompt = null,
    model = 'gemini-2.5-flash-preview-05-20',
    includeThoughts = false,
    jsonSchema = null
  } = options;
  
  try {
    const response = await fetch('/internal/call_mcp_tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'ai_chat',
        arguments: {
          messages: userMessage,
          system_prompt: systemPrompt,
          model: model,
          include_thoughts: includeThoughts,
          json_schema: jsonSchema
        }
      })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.error && data.error !== "None" && data.error !== null) {
      throw new Error(data.error);
    }
    
    // Handle ai_chat result - it's already parsed JSON, not a string
    let result;
    if (typeof data.result === 'string') {
      try {
        result = JSON.parse(data.result);
      } catch {
        result = { status: 'error', message: 'Invalid JSON response' };
      }
    } else {
      result = data.result; // Already an object
    }
    
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    
    // Return the AI's response (text or structured JSON)
    return result.response;
    
  } catch (error) {
    console.error('AI chat failed:', error);
    throw error;
  }
}



export default function CardStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedArtisticStyle, setSelectedArtisticStyle] = useState<string>("");
  const [selectedImageModel, setSelectedImageModel] = useState<string>("gpt-image-1"); // Default to GPT-1
  const [selectedHandwritingModel, setSelectedHandwritingModel] = useState<string>("gpt-image-1"); // Default to GPT-1 for handwriting too
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);

  // NEW: TO and FROM fields
  const [toField, setToField] = useState("");
  const [fromField, setFromField] = useState("");

  // State for AI Writing Assistant (Inline, iterative version)
  const [finalCardMessage, setFinalCardMessage] = useState(""); // Editable message for the card
  const [assistantInteractionPrompt, setAssistantInteractionPrompt] = useState(""); // User's instruction for refining/generating the message
  const [messageWritingHistory, setMessageWritingHistory] = useState<MessageHistoryItem[]>([]); // History for this specific message session
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false); // For AI message generation

  // NEW: Handwriting sample state
  const [handwritingSample, setHandwritingSample] = useState<File | null>(null);
  const [handwritingSampleUrl, setHandwritingSampleUrl] = useState<string | null>(null);
  const [isUploadingHandwriting, setIsUploadingHandwriting] = useState(false);



  // AI Writing Assistant Logic (Updated to use ai_chat tool)
  const handleRefineMessageWithAI = async () => {
    if (!assistantInteractionPrompt.trim() && !finalCardMessage.trim()) {
      toast.error("Please type your message or an instruction for Buddy.");
      return;
    }
    setIsGeneratingMessage(true);

    let currentHistory = [...messageWritingHistory];
    // Add current message draft to history if it exists and is not just a placeholder from AI
    if (finalCardMessage.trim() && (currentHistory.length === 0 || currentHistory[currentHistory.length -1].content !== finalCardMessage)) {
      currentHistory.push({ role: 'ai_suggestion', content: finalCardMessage }); // Treat current text as a base for refinement
    }
    // Add user's instruction to history
    currentHistory.push({ role: 'user_instruction', content: assistantInteractionPrompt });

    const systemPromptForMessageRefinement = `
      You are "Buddy", a friendly and expert AI writing assistant specializing in crafting and refining messages for greeting cards.
      The user is currently working on a message for their card. 
      The conversation history shows previous suggestions and user instructions for THIS message.

      Current Card Context:
      - Card Type: ${selectedType || "General"}
      - User's Overall Card Theme: "${prompt}"
      ${toField ? `- To: ${toField}` : ""}
      ${fromField ? `- From: ${fromField}` : ""}

      User's latest instruction for the card message: "${assistantInteractionPrompt}"
      Current draft of the message (if any, this is what they want to refine): "${finalCardMessage}"

      Your task is to carefully consider their latest instruction and the current draft (if provided),
      and then provide a *new, complete version of the message* that incorporates their requested changes.
      If the current draft is empty and the instruction is to write one, create a new message from scratch based on the Card Context and latest instruction.

      Guidelines for your response:
      - Output *only* the revised card message as PLAIN TEXT. Absolutely NO MARKDOWN formatting (no asterisks for bold, no underscores for italics, etc.).
      - If the "To" field (recipient) is provided (e.g., "${toField || 'Sarah'}"), try to naturally incorporate their name into the greeting or body of the message (e.g., "Dear ${toField || 'Sarah'},", "Thinking of you, ${toField || 'Sarah'}!").
      - If the "From" field (sender) is provided (e.g., "${fromField || 'Alex'}"), try to naturally incorporate their name into the closing or body of the message (e.g., "Warmly, ${fromField || 'Alex'}", "From all of us, ${fromField || 'Alex'}").
      - Ensure the message is heartfelt, personal, and concise.
      - Maintain a tone appropriate for the card type and the user's theme.
      - If the user asks for a completely new idea, provide one based on the overall theme and their instruction.
      - The message should be ready to be placed directly onto a greeting card.
    `;

    // Prepare conversation history for context
    const conversationContext = currentHistory.slice(0, -1).map(msg => 
      `${msg.role === 'user_instruction' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    const fullMessage = conversationContext ? 
      `${conversationContext}\n\nUser: ${assistantInteractionPrompt}` : 
      assistantInteractionPrompt;

    try {
      const aiSuggestedMessage = await chatWithAI(fullMessage, {
        systemPrompt: systemPromptForMessageRefinement,
        model: "gemini-2.5-pro-preview-05-06"
      });

      if (aiSuggestedMessage) {
        const cleanMessage = aiSuggestedMessage.trim();
        setFinalCardMessage(cleanMessage); // Update the main message area
        setMessageWritingHistory(prev => [...prev, {role: 'user_instruction', content: assistantInteractionPrompt} , { role: 'ai_suggestion', content: cleanMessage }]);
        setAssistantInteractionPrompt(""); // Clear the instruction input
        toast.success("Buddy refined the message!");
      } else {
        throw new Error("AI did not return a message suggestion.");
      }

    } catch (error) {
      console.error("Error with AI Writing Assistant:", error);
      toast.error(error instanceof Error ? error.message : "Failed to get AI response.");
      // Optionally add error to history for user to see
      setMessageWritingHistory(prev => [...prev, {role: 'user_instruction', content: assistantInteractionPrompt}, {role: 'ai_suggestion', content: `Error: ${(error as Error).message || "Unknown error"}`}]);
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  const handleGenerateCard = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt for your card's overall theme");
      return;
    }

    let rightPageMessageContent = finalCardMessage;
    
    if (!rightPageMessageContent.trim()) {
      console.log("🤖 No message provided - generating one automatically...");
      
      try {
        const messageGenerationPrompt = `You are a thoughtful and creative greeting card message writer. Create a heartfelt, personal message for a greeting card based on the following context:

Card Theme: "${prompt}"
Card Type: ${selectedType || "General greeting"}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}

Your task is to write a warm, sincere message that would be perfect for the inside of this greeting card. The message should:
- Be heartfelt and personal, as if written by someone who cares.
- If the "To" field (recipient, e.g., "${toField || 'Sarah'}") is provided, naturally incorporate their name into the greeting or body of the message (e.g., "Dear ${toField || 'Sarah'},", "Wishing you all the best, ${toField || 'Sarah'}.").
- If the "From" field (sender, e.g., "${fromField || 'Alex'}") is provided, naturally incorporate their name into the closing or body of the message (e.g., "Warmly, ${fromField || 'Alex'}", "From your friend, ${fromField || 'Alex'}.").
- Match the tone and occasion of the card type.
- Be inspired by the overall theme provided.
- Be concise but meaningful (2-4 sentences ideal).
- Feel authentic and genuine, not generic.
- Be appropriate for handwritten style presentation.

Return ONLY the message text as PLAIN TEXT. Absolutely NO MARKDOWN formatting (no asterisks for bold, no underscores for italics, etc.). Do not include quotes around the message unless the quotes are part of the message itself.
`;

        const generatedMessage = await chatWithAI(messageGenerationPrompt, {
          model: "gemini-2.5-flash-preview-05-20"
        });

        if (generatedMessage && generatedMessage.trim()) {
          rightPageMessageContent = generatedMessage.trim();
          setFinalCardMessage(rightPageMessageContent); 
          toast.success("✨ Generated a personalized message for your card!");
          console.log("✅ Auto-generated message:", rightPageMessageContent);
        } else {
          rightPageMessageContent = prompt;
          console.log("⚠️ AI message generation failed, using prompt as fallback");
        }
      } catch (error) {
        console.error("Error generating automatic message:", error);
        rightPageMessageContent = prompt; 
        toast.info("Using your theme as the card message");
      }
    }

    setIsGenerating(true);
    
    try {
      const selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
      const styleModifier = selectedStyle ? selectedStyle.promptModifier : "";
      const styleContext = selectedStyle ? `Artistic Style: ${selectedStyle.label} - ${selectedStyle.description}` : "";
      
      // No base image template needed for 3-panel approach
      const baseImageTemplateB64 = null; // Explicitly null
      const usingGptImage1ForSplit = false; // No split, no template needed for this flag

      const panelPromptGenerationQuery = `You are an expert greeting card designer. Create 3 detailed image generation prompts for three SEPARATE panels of a greeting card. Each panel should be designed for a 9:16 portrait aspect ratio.

User Request (Overall Theme): "${prompt}"
Card Type: ${selectedType || "General"}
${styleContext}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
Message for Interior Right Panel: "${rightPageMessageContent}"
${handwritingSampleUrl ? "Note: User has provided a handwriting sample for the message page." : ""}

CRITICAL ANTI-BORDER REQUIREMENTS (Apply to ALL 3 panels):
⚠️ ABSOLUTELY FORBIDDEN: Each generated panel image must NEVER create any of the following:
- Borders of ANY kind (thin, thick, decorative, simple) around the panel itself.
- Frames around the panel image or its content.
- The image content must extend to all four edges of its 9:16 frame.

✅ MANDATORY INSTEAD: Every single visual element must extend seamlessly to the absolute edges of EACH 9:16 panel. Each panel must be completely borderless and frameless.

CRITICAL TEXT GENERATION REQUIREMENTS (Apply to panels with text):
- Be explicit: "The text says: 'Happy Birthday, Alex!'"
- Specify style (e.g., "elegant handwritten script", "bold modern font").
- Specify placement (e.g., "centered at the top", "bottom right corner").

Requirements for ALL 3 Panel Prompts:
- **MANDATORY: 9:16 portrait aspect ratio (taller than wide) for EACH panel.**
- Print-ready, flat 2D design for each panel.
- Cohesive color palette and style across all three panels to ensure they look like part of the same card set.
- Professional greeting card quality.
- Safe, appropriate content.

Panel Descriptions:

1.  **FRONT COVER PANEL (9:16 Portrait):**
    *   Design: Main artwork for the front of the card. Should include greeting text (e.g., "Happy Birthday, Alex!", "Future Tech Star!").
    *   Theme: Based on the user's overall request.
    *   Style: ${selectedStyle ? selectedStyle.label : "Artist's choice, matching theme"}.
    *   ${styleModifier ? `Apply this artistic style: ${styleModifier}` : ""}
    *   Ensure text is clear, legible, and artistically integrated.

2.  **INTERIOR LEFT PANEL (9:16 Portrait - Decorative):**
    *   Design: Purely decorative artwork that complements the front cover and overall theme. NO TEXT ON THIS PANEL.
    *   Style: ${selectedStyle ? selectedStyle.label : "Artist's choice, matching theme"}.
    *   ${styleModifier ? `Apply this artistic style: ${styleModifier}` : ""}
    *   This panel faces the message panel when the card is open.

3.  **INTERIOR RIGHT PANEL (9:16 Portrait - Message):**
    *   Design: Primarily features the handwritten message: "${rightPageMessageContent}".
    *   The message text should be rendered clearly and prominently in an authentic, appealing handwritten style.
    *   Background should be relatively simple or complementary to the message, ensuring text readability. Minor decorative elements related to the theme/style are okay if they don't obscure the message.
    *   Style: ${selectedStyle ? selectedStyle.label : "Artist's choice, matching theme, focus on handwritten text"}.
    *   ${(selectedStyle && (selectedStyle.id === 'studio-ghibli' || selectedStyle.id === 'hand-drawn-sketchy')) || handwritingSampleUrl ? "Ensure all text on this panel is in a handwritten style." : "Render text in an elegant, clear handwritten style."}
    *   ${styleModifier ? `Apply this artistic style: ${styleModifier}` : ""}

Return ONLY a JSON object with this exact structure:
{
  "frontCoverPanelPrompt": "Detailed prompt for the 9:16 FRONT COVER PANEL. CRITICAL: anti-border. ${styleModifier ? `ARTISTIC STYLE: ${styleModifier}` : ''}",
  "interiorLeftPanelPrompt": "Detailed prompt for the 9:16 INTERIOR LEFT (DECORATIVE) PANEL. NO TEXT. CRITICAL: anti-border. ${styleModifier ? `ARTISTIC STYLE: ${styleModifier}` : ''}",
  "interiorRightPanelPrompt": "Detailed prompt for the 9:16 INTERIOR RIGHT (MESSAGE) PANEL. Features message: '${rightPageMessageContent}'. CRITICAL: anti-border. ${styleModifier ? `ARTISTIC STYLE: ${styleModifier}` : ''}"
}`;

      const generatedPanelPrompts = await chatWithAI(panelPromptGenerationQuery, {
        model: "gemini-2.5-flash-preview-05-20", // Or gemini-2.5-pro if more detail needed
        jsonSchema: {
          type: "object",
          properties: {
            frontCoverPanelPrompt: { type: "string" },
            interiorLeftPanelPrompt: { type: "string" },
            interiorRightPanelPrompt: { type: "string" }
          },
          required: ["frontCoverPanelPrompt", "interiorLeftPanelPrompt", "interiorRightPanelPrompt"]
        }
      });

      console.log("✅ Generated 3 panel prompts:", generatedPanelPrompts);

      const criticalSuffix = " CRITICAL IMAGE RULE: The final image must be strictly full-bleed with a 9:16 portrait aspect ratio (taller than wide). ABSOLUTELY NO BORDERS OR FRAMES OF ANY KIND. The image must be completely borderless and frameless with all visual elements extending seamlessly to the very edges of the 9:16 portrait frame. CRITICAL TEXT RULE: Any text in the image must be rendered exactly as specified in quotes, with clear, readable lettering in the specified style and placement.";

      const promptsForApi = [
        generatedPanelPrompts.frontCoverPanelPrompt + criticalSuffix,
        generatedPanelPrompts.interiorLeftPanelPrompt + criticalSuffix,
        generatedPanelPrompts.interiorRightPanelPrompt + criticalSuffix
      ];
      
      const inputImagesForApi = [];
      // Front cover - no specific input image other than global style
      inputImagesForApi.push(undefined); 
      // Interior Left - no specific input image
      inputImagesForApi.push(undefined);
      // Interior Right - potentially handwriting sample
      if (selectedHandwritingModel === "gpt-image-1" && handwritingSampleUrl) {
        inputImagesForApi.push([handwritingSampleUrl]); // API expects array of data URLs
      } else {
        inputImagesForApi.push(undefined);
      }

      console.log("🎨 Sending 3 prompts to image generation API...");
      
      const imageGenerationPayload = {
        tool_name: "generate_images_with_prompts",
        arguments: {
          user_number: "+17145986105",
          prompts: promptsForApi,
          model_version: selectedImageModel, // Use selectedImageModel for front & left, selectedHandwritingModel for right
                                           // This might need refinement if we want different models per panel.
                                           // For now, let's assume selectedImageModel applies unless handwriting is involved.
                                           // The backend now handles input_images per prompt.
          aspect_ratio: "9:16", // All panels are 9:16
          input_images: inputImagesForApi 
        },
        user_id_context: "+17145986105"
      };
       // Adjust model for the message panel if handwriting model is different and selected
      // The backend needs to be able to handle a list of models or make three separate calls if models differ.
      // For now, we send one model, and the backend uses it for all prompts unless input_images implies gpt-image-1.
      // The current image_services_server.py will use gpt-image-1 for prompts with input_images.

      const response = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageGenerationPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image generation API call failed: ${response.status} ${errorText}`);
      }
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      let toolResponse = JSON.parse(result.result);
      if (toolResponse.status !== "success" && toolResponse.status !== "partial_error") {
        throw new Error(toolResponse.message || "Image panel generation failed");
      }

      if (!toolResponse.results || toolResponse.results.length < 3) {
        throw new Error("Did not receive 3 image panels from the generation service.");
      }
      
      const [frontCoverResult, interiorLeftResult, interiorRightResult] = toolResponse.results;

      const getUrlFromResult = (panelResult: any, panelName: string) => {
        if (panelResult.error) throw new Error(`${panelName} panel generation error: ${panelResult.error}`);
        if (!Array.isArray(panelResult) || panelResult.length === 0) throw new Error(`No image URL for ${panelName} panel`);
        return panelResult[0];
      };

      const frontCoverUrl = getUrlFromResult(frontCoverResult, "Front Cover");
      const interiorLeftUrl = getUrlFromResult(interiorLeftResult, "Interior Left");
      const interiorRightUrl = getUrlFromResult(interiorRightResult, "Interior Right");
      
      console.log("✅ All 3 panels generated successfully!");
      console.log("Front Cover Panel:", frontCoverUrl);
      console.log("Interior Left Panel:", interiorLeftUrl);
      console.log("Interior Right Panel:", interiorRightUrl);
      
      toast.info("3-panel layout generated! Preview will arrange them for printing.");

      const newCard: GeneratedCard = {
        id: Date.now().toString(),
        prompt,
        frontCoverImageUrl: frontCoverUrl,
        interiorLeftImageUrl: interiorLeftUrl,
        interiorRightImageUrl: interiorRightUrl,
        createdAt: new Date(),
      };
      
      setGeneratedCard(newCard);
      toast.success("Card generated successfully with new 3-panel approach!");

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate card. Please try again.");
      console.error("Card generation error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedCard) return;
    toast.success("Download started! (Feature coming soon)");
  };

  const handlePrint = () => {
    if (!generatedCard) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to enable printing");
      return;
    }

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Greeting Card - Print Layout</title>
          <style>
            @page {
              size: 11in 8.5in; /* Landscape orientation */
              margin: 0;
            }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { width: 100vw; height: 100vh; display: flex; position: relative; page-break-after: always; overflow: hidden; }
            .page-1 { /* Front/Back */ }
            .page-2 { transform: rotate(180deg); /* Ensures proper orientation after flip */ }
            .half { width: 50%; height: 100%; position: relative; overflow: hidden; }
            .left-half { left: 0; }
            .right-half { right: 0; }
            .panel-image { width: 100%; height: 100%; object-fit: cover; display: block; }
            .blank-back { background-color: white; }
            
            .fold-instructions { position: absolute; top: 10px; left: 10px; font-size: 10px; color: #333; background: rgba(255,255,255,0.8); padding: 5px; border-radius: 3px; border: 1px solid #ccc; z-index: 100; }
            @media print { .fold-instructions { display: none; } }
          </style>
        </head>
        <body>
          <!-- Page 1: Front/Back Layout -->
          <div class="page page-1">
            <div class="fold-instructions">Page 1: Front/Back (Blank Left, Front Cover Right)<br/>Print double-sided, flip on long edge.</div>
            <div class="half left-half blank-back"></div>
            <div class="half right-half">
              <img src="${generatedCard.frontCoverImageUrl}" alt="Front Cover" class="panel-image" />
            </div>
          </div>
            
          <!-- Page 2: Interior Layout -->
          <div class="page page-2">
            <div class="fold-instructions">Page 2: Interior (Decorative Left, Message Right)<br/>This page is pre-rotated for printing.</div>
            <div class="half left-half">
              <img src="${generatedCard.interiorLeftImageUrl}" alt="Interior Left Decorative" class="panel-image" />
            </div>
            <div class="half right-half">
              <img src="${generatedCard.interiorRightImageUrl}" alt="Interior Right Message" class="panel-image" />
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printHTML);
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = () => { printWindow.close(); };
      }, 1000);
    };

    toast.success("Print dialog opened! Ensure 'Print on both sides' & 'Flip on long edge'.");
  };

  // NEW: Handwriting sample upload handler
  const handleHandwritingUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    setIsUploadingHandwriting(true);
    
    try {
      // Upload the handwriting sample
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${BACKEND_API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      setHandwritingSample(file);
      setHandwritingSampleUrl(result.url);
      toast.success("Handwriting sample uploaded! Your message will be styled to match this handwriting.");
      
    } catch (error) {
      console.error('Handwriting upload failed:', error);
      toast.error("Failed to upload handwriting sample. Please try again.");
    } finally {
      setIsUploadingHandwriting(false);
    }
  };

  const removeHandwritingSample = () => {
    setHandwritingSample(null);
    setHandwritingSampleUrl(null);
    toast.info("Handwriting sample removed. Message will use default handwritten style.");
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-slate-800 dark:to-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Chat
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Buddy's Card Studio
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Create beautiful AI-powered greeting cards
                  </p>
                </div>
              </div>
            </div>
            <ModeToggle />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Card Creation */}
          <div className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  Create Your Card
                </CardTitle>
                <CardDescription>
                  Describe your perfect greeting card and let AI create two perfectly aligned layout images
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Card Type Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                    Card Type (Optional)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {cardTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <Button
                          key={type.id}
                          variant={selectedType === type.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedType(selectedType === type.id ? "" : type.id)}
                          className="h-auto p-3 flex flex-col gap-1"
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-xs">{type.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* TO and FROM Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="toField" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      To (Optional)
                    </label>
                    <Input
                      id="toField"
                      placeholder="e.g., Sarah, Mom, John"
                      value={toField}
                      onChange={(e) => setToField(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Who is receiving this card
                    </p>
                  </div>
                  
                  <div>
                    <label htmlFor="fromField" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      From (Optional)
                    </label>
                    <Input
                      id="fromField"
                      placeholder="e.g., Love Alex, The Smith Family"
                      value={fromField}
                      onChange={(e) => setFromField(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Who is sending this card
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Artistic Style Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                    Artistic Style (Optional)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {artisticStyles.map((style) => {
                      const Icon = style.icon;
                      const isSelected = selectedArtisticStyle === style.id;
                      return (
                        <div
                          key={style.id}
                          onClick={() => setSelectedArtisticStyle(isSelected ? "" : style.id)}
                          className={`
                            p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                            ${isSelected 
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }
                          `}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 ${style.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                                {style.label}
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                                {style.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedArtisticStyle && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        ✨ <strong>{artisticStyles.find(s => s.id === selectedArtisticStyle)?.label}</strong> style will be applied to your card design
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Prompt Input for Overall Theme */}
                <div>
                  <label htmlFor="prompt" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Describe Your Card (Overall Theme)
                  </label>
                  <Textarea
                    id="prompt"
                    placeholder="e.g., 'A joyful birthday celebration for a friend who loves cherry blossoms and scenic mountains.'"
                    value={prompt}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    This theme inspires the front cover & left page design.
                  </p>
                </div>

                <Separator />

                {/* Image Model Selection */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Artwork Model (Front Cover & Left Page)
                    </label>
                    <Select
                      value={selectedImageModel}
                      onValueChange={(value) => setSelectedImageModel(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select model for artwork" />
                      </SelectTrigger>
                      <SelectContent>
                        {imageModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            <div className="flex items-center gap-2">
                              <model.icon className="w-4 h-4" />
                              <span>{model.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Model used for the front cover and left interior page artwork.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Handwriting Model (Message Page)
                    </label>
                    <Select
                      value={selectedHandwritingModel}
                      onValueChange={(value) => setSelectedHandwritingModel(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select model for handwriting" />
                      </SelectTrigger>
                      <SelectContent>
                        {imageModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            <div className="flex items-center gap-2">
                              <model.icon className="w-4 h-4" />
                              <span>{model.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Model used for the handwritten message page. Different models may handle handwriting styles differently.
                    </p>
                  </div>
                </div>

                {/* Inline AI Writing Assistant for Card Message */}
                <div className="space-y-3">
                  <div>
                    <label htmlFor="finalCardMessage" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Your Card Message (for inside right page)
                    </label>
                    <Textarea
                      id="finalCardMessage"
                      placeholder="Type your message here, or let Buddy help you write it!"
                      value={finalCardMessage}
                      onChange={(e) => setFinalCardMessage(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="assistantInteractionPrompt" className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                      Instructions for Buddy (Optional - to help refine the message above)
                    </label>
                    <Textarea
                      id="assistantInteractionPrompt"
                      placeholder="e.g., 'Make it more personal', 'Add a touch of humor', 'Keep it short and sweet'"
                      value={assistantInteractionPrompt}
                      onChange={(e) => setAssistantInteractionPrompt(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  </div>

                  <Button 
                    type="button" 
                    onClick={handleRefineMessageWithAI}
                    disabled={isGeneratingMessage}
                    variant={finalCardMessage ? "secondary" : "default"}
                    className="w-full gap-2"
                  >
                    <MessageSquarePlus className={`w-4 h-4 ${finalCardMessage ? "" : "text-yellow-300"}`} /> 
                    {isGeneratingMessage ? "Buddy is thinking..." : (finalCardMessage ? "Refine Message" : "Buddy, Help Me Refine!")}
                  </Button>
                  {isGeneratingMessage && (
                    <p className="text-xs text-muted-foreground mt-1 animate-pulse text-center">Buddy is refining the message...</p>
                  )}
                </div>

                <Separator />

                {/* Generate Button */}
                <Button
                  onClick={handleGenerateCard}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Generating Your Card...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Card
                    </>
                  )}
                </Button>

                {/* Card Info */}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                  <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">
                    How it works:
                  </h4>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• <strong>Layout 1 - Front/Back:</strong> Creates a split image with blank back (left) and front cover (right) in 16:9 landscape</li>
                    <li>• <strong>Layout 2 - Interior:</strong> Generates a split image with decorative art (left) and handwritten message (right) in 16:9 landscape</li>
                    <li>• <strong>Personal Addressing:</strong> Add "To" and "From" fields so we know who to greet and who the card is from</li>
                    <li>• <strong>Artistic Styles:</strong> Choose from Studio Ghibli, Watercolor, Vintage Botanical, and more for consistent theming</li>
                    <li>• <strong>Perfect Alignment:</strong> Both images are precisely split in half for seamless printing and folding</li>
                    <li>• <strong>Automatic Split Template:</strong> GPT-1 automatically uses a server-side template with center line for precise splits</li>
                    <li>• <strong>Model Selection:</strong> Choose different models for artwork vs. handwriting for optimal results</li>
                    <li>• <strong>Print Ready:</strong> Designed specifically for professional card printing with perfect registration</li>
                    <li>• <strong>Personal Touch:</strong> Upload your handwriting sample to style the message in your own handwriting!</li>
                  </ul>
                </div>

                <Separator />



                {/* Handwriting Sample Upload */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Handwriting Sample (Optional)
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Upload a photo of your handwriting to style the message in your own handwriting style
                    </p>
                    
                    {!handwritingSample ? (
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleHandwritingUpload}
                          disabled={isUploadingHandwriting}
                          className="hidden"
                          id="handwriting-upload"
                        />
                        <label 
                          htmlFor="handwriting-upload" 
                          className="cursor-pointer flex flex-col items-center"
                        >
                          <div className="w-12 h-12 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center mb-3">
                            <Edit3 className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                          </div>
                          {isUploadingHandwriting ? (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm text-gray-600 dark:text-gray-400">Uploading...</span>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Click to upload handwriting sample
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                PNG, JPG, or other image formats
                              </span>
                            </>
                          )}
                        </label>
                      </div>
                    ) : (
                      <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-emerald-50 dark:bg-emerald-900/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center">
                              <Edit3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                                {handwritingSample.name}
                              </p>
                              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                                Handwriting sample uploaded
                              </p>
                            </div>
                          </div>
                                                      <Button
                              variant="ghost"
                              size="sm"
                              onClick={removeHandwritingSample}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              Remove
                            </Button>
                        </div>
                        {handwritingSampleUrl && (
                          <div className="mt-3">
                            <img 
                              src={handwritingSampleUrl} 
                              alt="Handwriting sample preview" 
                              className="max-w-full h-20 object-contain rounded border"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Card Preview */}
          <div className="space-y-6">
            {generatedCard ? (
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="print">Print Layout</TabsTrigger>
                </TabsList>
                
                <TabsContent value="preview" className="mt-6">
                  <Card className="shadow-lg">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Your Generated Card</CardTitle>
                          <CardDescription>
                            Created {generatedCard.createdAt.toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={handleDownload}>
                            <Download className="w-4 h-4 mr-1" />
                            Download
                          </Button>
                          <Button variant="outline" size="sm" onClick={handlePrint}>
                            <Printer className="w-4 h-4 mr-1" />
                            Print
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardPreview card={generatedCard} />
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="print" className="mt-6">
                  <PrintLayout card={generatedCard} />
                </TabsContent>
              </Tabs>
            ) : (
              <Card className="shadow-lg">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Ready to Create Magic?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 max-w-sm">
                    Enter your card description and watch as AI creates three beautiful, print-ready images for your perfect greeting card.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 