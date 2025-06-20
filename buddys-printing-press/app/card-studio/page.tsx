"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Sparkles, Download, Printer, Heart, Gift, GraduationCap, Calendar, Wand2, MessageSquarePlus, ChevronDown, Settings, Zap, Palette, Edit3, Upload, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import CardPreview from "@/components/CardPreview";
import { ModeToggle } from "@/components/mode-toggle";

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5001';

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;
  leftPage: string;
  rightPage: string;
  createdAt: Date;
}

// Top 5 most popular card types plus custom option
const cardTypes = [
  { id: "birthday", label: "Birthday", icon: Gift, color: "bg-blue-500" },
  { id: "thank-you", label: "Thank You", icon: Heart, color: "bg-emerald-500" },
  { id: "anniversary", label: "Anniversary", icon: Heart, color: "bg-red-500" },
  { id: "congratulations", label: "Congratulations", icon: GraduationCap, color: "bg-purple-500" },
  { id: "holiday", label: "Holiday", icon: Calendar, color: "bg-orange-500" },
  { id: "custom", label: "Custom", icon: Edit3, color: "bg-gray-500" },
];

// Diverse artistic styles with cool options
const artisticStyles = [
  { 
    id: "ghibli", 
    label: "Studio Ghibli", 
    description: "Enchanting anime-inspired art",
    promptModifier: "in Studio Ghibli anime style, with soft pastels, magical atmosphere, detailed nature elements, and dreamy enchanting qualities reminiscent of Miyazaki films"
  },
  { 
    id: "cyberpunk", 
    label: "Cyberpunk", 
    description: "Futuristic neon-lit digital art",
    promptModifier: "in cyberpunk style with neon colors, holographic effects, dark urban backgrounds, glowing elements, and futuristic digital aesthetics"
  },
  { 
    id: "art-deco", 
    label: "Art Deco", 
    description: "Elegant 1920s geometric luxury",
    promptModifier: "in vintage Art Deco style with geometric patterns, gold accents, elegant typography, luxurious details, and 1920s glamour"
  },
  { 
    id: "pixel-art", 
    label: "Pixel Art", 
    description: "Retro 8-bit gaming style",
    promptModifier: "in pixel art style reminiscent of classic 8-bit and 16-bit video games, with blocky textures, limited color palettes, and nostalgic gaming aesthetics"
  },
  { 
    id: "watercolor", 
    label: "Watercolor", 
    description: "Soft, flowing paint effects",
    promptModifier: "in watercolor painting style, with soft flowing colors, artistic brush strokes, paper texture, and organic paint bleeds"
  },
  { 
    id: "pop-art", 
    label: "Pop Art", 
    description: "Bold, colorful comic book style",
    promptModifier: "in pop art style like Andy Warhol and Roy Lichtenstein, with bold colors, comic book elements, halftone dots, and graphic design aesthetics"
  },
  { 
    id: "steampunk", 
    label: "Steampunk", 
    description: "Victorian-era mechanical fantasy",
    promptModifier: "in steampunk style with brass gears, copper pipes, Victorian aesthetics, mechanical contraptions, and industrial fantasy elements"
  },
  {
    id: "minimalist", 
    label: "Minimalist", 
    description: "Clean, simple, elegant design",
    promptModifier: "in minimalist style with clean lines, simple shapes, plenty of white space, sophisticated typography, and elegant simplicity"
  },
  {
    id: "gothic", 
    label: "Gothic", 
    description: "Dark, dramatic, ornate style",
    promptModifier: "in gothic style with dark romantic elements, ornate details, dramatic shadows, mysterious atmosphere, and elegant darkness"
  },
  {
    id: "retro-vintage", 
    label: "Retro Vintage", 
    description: "Classic 1950s-60s nostalgia",
    promptModifier: "in retro vintage style with 1950s-60s aesthetics, classic typography, warm nostalgic colors, and mid-century design elements"
  },
  {
    id: "impressionist", 
    label: "Impressionist", 
    description: "Soft brushstrokes like Monet",
    promptModifier: "in impressionist painting style like Monet and Renoir, with soft brush strokes, light and shadow play, and dreamy atmospheric effects"
  },
  {
    id: "neon-synthwave", 
    label: "Neon Synthwave", 
    description: "80s retro-futuristic vibes",
    promptModifier: "in synthwave style with neon pink and blue colors, 80s retro-futuristic aesthetics, grid patterns, and nostalgic sci-fi elements"
  },
  {
    id: "handwritten", 
    label: "Handwritten", 
    description: "Personal, organic lettering",
    promptModifier: "in a personal handwritten style with natural, organic lettering and hand-drawn elements"
  },
  {
    id: "custom", 
    label: "Custom Style", 
    description: "Define your own artistic style",
    promptModifier: "" // Will be replaced with user input
  }
];

// Image model options
const imageModels = [
  { 
    id: "gpt-image-1", 
    label: "GPT Image 1", 
    description: "OpenAI's latest image model",
  },
  { 
    id: "imagen-4.0-generate-preview-06-06", 
    label: "Imagen 4.0", 
    description: "Google's advanced image model",
  },
  { 
    id: "imagen-4.0-fast-generate-preview-06-06", 
    label: "Imagen 4.0 Fast", 
    description: "Faster generation variant",
  },
  { 
    id: "imagen-4.0-ultra-generate-preview-06-06", 
    label: "Imagen 4.0 Ultra", 
    description: "Highest quality variant",
  },
];

// AI Chat Helper Function
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
    
    let result;
    if (typeof data.result === 'string') {
      try {
        result = JSON.parse(data.result);
      } catch {
        result = { status: 'error', message: 'Invalid JSON response' };
      }
    } else {
      result = data.result;
    }
    
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    
    return result.response;
    
  } catch (error) {
    console.error('AI chat failed:', error);
    throw error;
  }
}

export default function CardStudioPage() {
  // Core state
  const [prompt, setPrompt] = useState("");
  const [finalCardMessage, setFinalCardMessage] = useState("");
  const [toField, setToField] = useState("");
  const [fromField, setFromField] = useState("");
  const [selectedType, setSelectedType] = useState<string>("birthday");
  const [customCardType, setCustomCardType] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);

  // AI assistant state
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedArtisticStyle, setSelectedArtisticStyle] = useState<string>("ghibli");
  const [customStyleDescription, setCustomStyleDescription] = useState<string>("");
  const [selectedImageModel, setSelectedImageModel] = useState<string>("gpt-image-1");

  // Upload state
  const [handwritingSample, setHandwritingSample] = useState<File | null>(null);
  const [handwritingSampleUrl, setHandwritingSampleUrl] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [imageTransformation, setImageTransformation] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  // AI Writing Assistant
    const handleGetMessageHelp = async () => {
    if (!prompt.trim()) {
      toast.error("Please describe your card first!");
      return;
    }

    // Validate custom card type if selected
    if (selectedType === "custom" && !customCardType.trim()) {
      toast.error("Please describe your custom card type first!");
      return;
    }
    
    setIsGeneratingMessage(true);

    try {
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const messagePrompt = `Create a heartfelt, personal message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${prompt}"
${toField ? `Recipient: ${toField}` : "Recipient: [not specified]"}
${fromField ? `Sender: ${fromField}` : "Sender: [not specified]"}

Instructions:
- Write a warm, sincere message that feels personal and genuine
- ${toField ? `Address the message to ${toField} directly, using their name naturally` : "Write in a way that could be personalized to any recipient"}
- ${fromField ? `Write as if ${fromField} is personally writing this message` : "Write in a warm, personal tone"}
- Match the tone and occasion of the ${cardTypeForPrompt} card type
- Be inspired by the theme: "${prompt}"
- Keep it concise but meaningful (2-4 sentences ideal)
- Make it feel authentic, not generic
- ${toField && fromField ? `Show the relationship between ${fromField} and ${toField} through the message tone` : ""}
- ${fromField ? `End the message with a signature line like "Love, ${fromField}" or "- ${fromField}" or similar, naturally integrated into the message.` : ""}

Return ONLY the message text that should appear inside the card - no quotes, no explanations, no markdown formatting (no *bold*, _italics_, or other markdown), just the complete heartfelt message in plain text.`;

      const generatedMessage = await chatWithAI(messagePrompt, {
        model: "gemini-2.5-flash-preview-05-20"
      });

      if (generatedMessage?.trim()) {
        setFinalCardMessage(generatedMessage.trim());
        toast.success("✨ Personalized message created!");
      }
    } catch (error) {
      toast.error("Failed to generate message. Please try again.");
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  // File upload handler
  const handleFileUpload = async (file: File, type: 'handwriting' | 'reference') => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${BACKEND_API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      
      const result = await response.json();
      
      if (type === 'handwriting') {
        setHandwritingSample(file);
        setHandwritingSampleUrl(result.url);
        toast.success("Handwriting sample uploaded!");
      } else {
        setReferenceImage(file);
        setReferenceImageUrl(result.url);
        toast.success("Reference image uploaded!");
      }
    } catch (error) {
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Main card generation
  const handleGenerateCard = async () => {
    if (!prompt.trim()) {
      toast.error("Please describe your card");
      return;
    }

    // Validate custom style if selected
    if (selectedArtisticStyle === "custom" && !customStyleDescription.trim()) {
      toast.error("Please describe your custom artistic style");
      return;
    }

    let messageContent = finalCardMessage;
    
    // Auto-generate message if empty
    if (!messageContent.trim()) {
      try {
        const autoMessagePrompt = `Create a heartfelt, personal message for a ${selectedType} greeting card.

Card Theme/Description: "${prompt}"
${toField ? `Recipient: ${toField}` : "Recipient: [not specified]"}
${fromField ? `Sender: ${fromField}` : "Sender: [not specified]"}

Instructions:
- Write a warm, sincere message that feels personal and genuine
- ${toField ? `Address the message to ${toField} directly, using their name naturally` : "Write in a way that could be personalized to any recipient"}
- ${fromField ? `Write as if ${fromField} is personally writing this message` : "Write in a warm, personal tone"}
- Match the tone and occasion of the ${selectedType} card type
- Be inspired by the theme: "${prompt}"
- Keep it concise but meaningful (2-4 sentences ideal)
- Make it feel authentic, not generic
- ${toField && fromField ? `Show the relationship between ${fromField} and ${toField} through the message tone` : ""}
- ${fromField ? `End the message with a signature line like "Love, ${fromField}" or "- ${fromField}" or similar, naturally integrated into the message.` : ""}

Return ONLY the message text that should appear inside the card - no quotes, no explanations, no markdown formatting (no *bold*, _italics_, or other markdown), just the complete heartfelt message in plain text.`;

        const generatedMessage = await chatWithAI(autoMessagePrompt);
        if (generatedMessage?.trim()) {
          messageContent = generatedMessage.trim();
          setFinalCardMessage(messageContent);
          toast.success("✨ Generated a personalized message for your card!");
        } else {
          messageContent = prompt;
        }
      } catch {
        messageContent = prompt;
      }
    }

    setIsGenerating(true);
    
    try {
      // Load base template for GPT-1
      let baseImageTemplateB64 = null;
      if (selectedImageModel === "gpt-image-1") {
        try {
          const baseImageUrl = `https://jordanjohngilbert.link/utils/base_split_image_1536x1024.png`;
          const response = await fetch(baseImageUrl);
          if (response.ok) {
            const blob = await response.blob();
            baseImageTemplateB64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        } catch (error) {
          console.warn("Could not load base template");
        }
      }

      // Get style details
      const selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
      let styleModifier = selectedStyle ? selectedStyle.promptModifier : "";
      
      // Use custom style description if custom style is selected
      if (selectedArtisticStyle === "custom" && customStyleDescription.trim()) {
        styleModifier = `in ${customStyleDescription.trim()}`;
      } else if (selectedArtisticStyle === "custom" && !customStyleDescription.trim()) {
        // Fallback to default if custom is selected but no description provided
        styleModifier = "in artistic style with creative and unique visual elements";
      }
      
      // Generate detailed prompts
      const promptGenerationQuery = `Create 2 detailed prompts for a ${selectedType} greeting card:

Theme: "${prompt}"
Style: ${selectedStyle?.label || "Default"}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
Message: "${messageContent}"
${referenceImageUrl ? `Reference image for transformation: "${imageTransformation || 'artistic transformation'}"` : ""}

🌊 FLOWING DESIGN PHILOSOPHY 🌊
Create flowing, organic designs that work beautifully when folded. The key is creating SAFE TEXT ZONES that are well away from the center fold while allowing artwork to flow naturally.

${baseImageTemplateB64 ? 
`🌊 FLOWING TEMPLATE APPROACH 🌊
You will be using a server-side template image that has RED and BLUE colored halves. CRITICAL: These are MEANINGLESS PLACEHOLDER COLORS that you must COMPLETELY IGNORE. The template is ONLY for positioning guidance.

🚨 MANDATORY COLOR OVERRIDE 🚨
- The template shows RED on left, BLUE on right - IGNORE THESE COMPLETELY
- DO NOT use red, blue, or any colors from the template
- Choose colors that match your card theme and artistic style
- For birthday/tech themes: use warm oranges, cool grays, tech blues, celebration yellows, etc.
- The template colors are just structural guides - they have NO artistic meaning

📐 PRECISE 50/50 SPLIT REQUIREMENT 📐
- Create EXACTLY equal left and right halves
- Left half content must stay within the LEFT 50% of the image
- Right half content must stay within the RIGHT 50% of the image
- Ensure balanced visual weight on both sides

FLOWING LEFT HALF DESIGN (LEFT 50% OF IMAGE):
- Create a beautiful, flowing composition using theme-appropriate colors (NOT red)
- Place any text elements in the OUTER LEFT THIRD (well away from center fold)
- Allow artwork, backgrounds, and decorative elements to flow organically
- Use colors that harmonize with your card theme, completely ignoring template red
- Text should be positioned safely in the outer left area to avoid fold damage

FLOWING RIGHT HALF DESIGN (RIGHT 50% OF IMAGE): 
- Create artwork that flows naturally using theme-appropriate colors (NOT blue)
- Place any text elements in the OUTER RIGHT THIRD (well away from center fold)
- Allow backgrounds, illustrations, and decorative elements to blend and flow
- Use colors that match your artistic vision, completely ignoring template blue
- Text should be positioned safely in the outer right area to avoid fold damage

🌊 NATURAL FLOW PRINCIPLES:
- Artwork can flow across the center area - it will create a beautiful seamless effect when folded
- Text must stay in safe zones (outer thirds) to avoid being cut by the fold
- Backgrounds can gradient, blend, or transition naturally across the center
- No rigid lines or harsh boundaries - think organic, flowing compositions
- NEVER use the template's red/blue colors - they are meaningless placeholders` 
: 
`🌊 FLOWING SPLIT DESIGN 🌊
Create a beautifully flowing composition split into two halves:

LEFT HALF FLOWING DESIGN:
- Create artwork that flows naturally across the space
- Place any text in the OUTER LEFT THIRD (safe from center fold)
- Allow backgrounds and decorative elements to flow organically toward center

RIGHT HALF FLOWING DESIGN:
- Create artwork that flows naturally from the center area to the right edge
- Place any text in the OUTER RIGHT THIRD (safe from center fold)  
- Allow backgrounds and illustrations to blend naturally with the overall composition

🌊 NATURAL FLOW PRINCIPLES:
- Artwork can transition smoothly across the center - this creates beautiful continuity
- Text must be positioned in safe outer zones to avoid fold damage
- Think watercolor bleeds, gradient transitions, organic shapes that flow together`}

Create prompts for:
1. FRONT/BACK LAYOUT - A landscape 16:9 flowing composition
   ${baseImageTemplateB64 
     ? `🌊 FLOWING FRONT/BACK with Template 🌊
LEFT FLOWING ZONE (EXACTLY LEFT 50% OF IMAGE): Create a subtle, flowing background with a delightful EASTER EGG QUOTE positioned safely in the OUTER LEFT THIRD. The quote should be small, charming, and related to the theme: "${prompt}" and type: "${selectedType || 'general'}". This is NOT for "From" text - this is a separate funny/witty quote that relates to the card theme (like a programming joke for a tech birthday, or a coffee pun for a coffee lover). Examples: "Level up: Debugging life's new features" or "Time to upgrade from beta testing life to full release!" 🚨 CRITICAL: DO NOT use the template's RED color - choose warm, theme-appropriate colors instead (oranges, yellows, greens, etc.). Allow the background to flow naturally toward the center. ${styleModifier}

RIGHT FLOWING ZONE (EXACTLY RIGHT 50% OF IMAGE): Create the FRONT COVER ARTWORK with flowing, organic composition. Position any greeting text safely in the OUTER RIGHT THIRD. ${referenceImageUrl ? `🎭 CRITICAL LIKENESS PRESERVATION: Incorporate the uploaded reference image creatively - transform the people/subjects in the photo according to the transformation style: "${imageTransformation || 'artistic transformation based on card theme'}" while MAINTAINING their recognizable facial features, hair color, distinctive characteristics, and overall appearance. The transformed characters must look unmistakably like the original people - preserve their unique facial structure, expressions, hair style/color, and any distinctive features.` : ''} 🚨 CRITICAL: DO NOT use the template's BLUE color - choose cool, theme-appropriate colors instead (tech grays, celebration blues, purples, etc.). Allow artwork to flow naturally from center to right edge. ${styleModifier}

🌊 FLOW HARMONY: Both zones should feel like parts of one flowing composition, with backgrounds and artistic elements that could naturally blend together.`
     : `🌊 FLOWING FRONT/BACK Design 🌊
LEFT FLOWING ZONE: Subtle flowing background with a witty EASTER EGG QUOTE (NOT "From" text - a separate funny quote related to the card theme) positioned safely in outer left third. RIGHT FLOWING ZONE: Front cover artwork with greeting text positioned safely in outer right third. ${referenceImageUrl ? `🎭 MAINTAIN LIKENESS: If transforming people from the reference image, preserve their recognizable facial features, hair color, and distinctive characteristics while applying the creative transformation.` : ''} Create flowing, organic composition where backgrounds and artistic elements transition naturally. ${styleModifier}`}
   Apply this flowing artistic style across the composition: ${styleModifier}. Let the style flow organically across both zones.

2. INTERIOR LAYOUT - A landscape 16:9 flowing composition
   ${baseImageTemplateB64
     ? `🌊 FLOWING INTERIOR with Template 🌊
LEFT FLOWING ZONE (EXACTLY LEFT 50% OF IMAGE): Create beautiful DECORATIVE ARTWORK that flows organically across the space. 🚨 CRITICAL: DO NOT use the template's RED color - choose colors that harmonize with your theme: "${prompt}" and artistic style: "${selectedStyle ? selectedStyle.label : 'default'}". Use warm, theme-appropriate colors (oranges, yellows, greens, etc.) instead of template red. Allow decorative elements to flow naturally toward the center.

RIGHT FLOWING ZONE (EXACTLY RIGHT 50% OF IMAGE): Create the HANDWRITTEN MESSAGE area with message: "${messageContent}". CRITICAL TEXT POSITIONING: Position ALL text safely in the OUTER RIGHT THIRD (right 33% of the image) AND ensure text is positioned well within the TOP 80% of the image height to prevent bottom cutoff. Leave generous margins on all sides - especially bottom margin. Text must NEVER extend to the very edges or bottom of the image. 🚨 CRITICAL: DO NOT use the template's BLUE color - choose colors for readability and theme harmony (cool grays, subtle blues, purples, etc.) instead of template blue. Allow background and subtle decorative elements to flow naturally from center to right edge. ${styleModifier}

🌊 FLOW HARMONY: Both zones should feel like parts of one cohesive, flowing interior design with natural transitions and organic artistic elements.`
     : `🌊 FLOWING INTERIOR Design 🌊
LEFT FLOWING ZONE: Decorative artwork flowing organically across the space. RIGHT FLOWING ZONE: Handwritten message positioned safely in outer right third (right 33%) AND within top 80% of image height with generous margins on all sides to prevent any text cutoff. Create natural, organic composition where decorative elements transition smoothly. ${styleModifier}`}
   Apply this flowing artistic style consistently: ${styleModifier}. Create organic, natural flow across both zones.

Return JSON:
{
  "frontBackLayout": "detailed prompt for front/back layout",
  "interiorLayout": "detailed prompt for interior layout"
}`;

      const generatedPrompts = await chatWithAI(promptGenerationQuery, {
        jsonSchema: {
          type: "object",
          properties: {
            frontBackLayout: { type: "string" },
            interiorLayout: { type: "string" }
          },
          required: ["frontBackLayout", "interiorLayout"]
        }
      });

      const criticalSuffix = " 🌊 CRITICAL FLOWING DESIGN REQUIREMENTS 🌊 ✅ ULTRA-SAFE TEXT ZONES: All text must be positioned in the OUTER THIRDS horizontally (33% from edges) AND within the TOP 80% vertically with generous margins on ALL sides ✅ NO EDGE TEXT: Text must NEVER touch or approach the very edges, bottom, or center fold area of the image ✅ GENEROUS MARGINS: Leave substantial padding around all text - minimum 15% margin from any edge ✅ FLOWING BACKGROUNDS: Backgrounds, gradients, and artistic elements can flow naturally across the center area ✅ ORGANIC TRANSITIONS: Avoid hard lines or rigid boundaries - think natural, flowing compositions ✅ FOLD-FRIENDLY: Design with the understanding that the center will be folded, but this creates beautiful continuity ✅ PRINT-SAFE TEXT: Position all text elements with extra safety margins to prevent any cutoff during printing or folding ⚠️ ABSOLUTELY FORBIDDEN: Never create any borders, frames, or rigid boundaries around the image or content ✅ MANDATORY: Full-bleed design where all visual elements flow seamlessly to the edges of the 16:9 frame 🚨 CRITICAL TEMPLATE COLOR OVERRIDE 🚨 The input template has RED and BLUE placeholder colors - YOU MUST COMPLETELY IGNORE THESE COLORS. Do NOT use red, blue, or any colors from the template. Instead, choose colors that match your card theme (birthday = warm yellows/oranges/greens, tech = cool grays/blues/purples, etc.). The template is ONLY for positioning guidance - its colors are meaningless placeholders. 📐 PERFECT CENTER SPLIT REQUIREMENT: Create a PRECISE 50/50 split down the exact center of the 16:9 image. Left half content must stay in left 50%, right half content must stay in right 50%. Ensure clean, balanced composition with equal visual weight on both sides.";
      const finalFrontPrompt = generatedPrompts.frontBackLayout + criticalSuffix;
      const finalInteriorPrompt = generatedPrompts.interiorLayout + criticalSuffix;

      // Generate images in parallel
      const frontInputImages = [];
      const interiorInputImages = [];
      
      if (selectedImageModel === "gpt-image-1") {
        if (baseImageTemplateB64) {
          frontInputImages.push(baseImageTemplateB64);
          interiorInputImages.push(baseImageTemplateB64);
        }
        if (referenceImageUrl) frontInputImages.push(referenceImageUrl);
        if (handwritingSampleUrl) interiorInputImages.push(handwritingSampleUrl);
      }
      
      const frontPayload = {
        tool_name: "generate_images_with_prompts",
        arguments: {
          user_number: "+17145986105",
          prompts: [finalFrontPrompt],
          model_version: selectedImageModel,
          aspect_ratio: "16:9",
          ...(frontInputImages.length > 0 && { input_images: [frontInputImages] })
        },
        user_id_context: "+17145986105"
      };

      const interiorPayload = {
        tool_name: "generate_images_with_prompts",
        arguments: {
          user_number: "+17145986105",
        prompts: [finalInteriorPrompt],
          model_version: selectedImageModel,
        aspect_ratio: "16:9",
          ...(interiorInputImages.length > 0 && { input_images: [interiorInputImages] })
        },
        user_id_context: "+17145986105"
      };

      const [frontResponse, interiorResponse] = await Promise.all([
        fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(frontPayload),
        }),
        fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(interiorPayload),
        })
      ]);

      // Process responses
      if (!frontResponse.ok || !interiorResponse.ok) {
        throw new Error("Image generation failed");
      }

      const frontResult = await frontResponse.json();
      const interiorResult = await interiorResponse.json();
      
      if (frontResult.error || interiorResult.error) {
        throw new Error(frontResult.error || interiorResult.error);
      }

      const frontData = JSON.parse(frontResult.result);
      const interiorData = JSON.parse(interiorResult.result);
      
      if (frontData.status !== "success" || interiorData.status !== "success") {
        throw new Error("Image generation failed");
      }

      const frontUrl = Array.isArray(frontData.results[0]) ? frontData.results[0][0] : frontData.results[0];
      const interiorUrl = Array.isArray(interiorData.results[0]) ? interiorData.results[0][0] : interiorData.results[0];

      const newCard: GeneratedCard = {
        id: Date.now().toString(),
        prompt,
        frontCover: frontUrl,
        leftPage: interiorUrl,
        rightPage: interiorUrl,
        createdAt: new Date(),
      };
      
      setGeneratedCard(newCard);
      toast.success("🎉 Your card is ready!");

    } catch (error) {
      toast.error("Failed to generate card. Please try again.");
      console.error("Card generation error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!generatedCard) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Greeting Card</title>
          <style>
            @page { size: 11in 8.5in; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; }
            .page { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; page-break-after: always; }
            .page-2 { transform: rotate(180deg); }
            .layout-image { width: 100%; height: 100%; object-fit: contain; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .page { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <img src="${generatedCard.frontCover}" alt="Front/Back" class="layout-image" />
              </div>
          <div class="page page-2">
            <img src="${generatedCard.leftPage}" alt="Interior" class="layout-image" />
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      }, 1000);
    };

    toast.success("Print dialog opened!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-slate-800 dark:to-gray-800">
      {/* Simplified Header */}
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                    Card Studio
                  </h1>
                </div>
              </div>
            </div>
            <ModeToggle />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Main Form */}
        <Card className="shadow-lg mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  Create Your Card
                </CardTitle>
                <CardDescription>
              Describe your card and we'll create it for you
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
            {/* Card Type */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                Card Type
                  </label>
              <div className="grid grid-cols-2 gap-2">
                    {cardTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <Button
                          key={type.id}
                          variant={selectedType === type.id ? "default" : "outline"}
                      onClick={() => setSelectedType(type.id)}
                      className="h-12 flex items-center gap-2"
                        >
                          <Icon className="w-4 h-4" />
                      {type.label}
                        </Button>
                      );
                    })}
                  </div>
                  
                  {/* Custom Card Type Input */}
                  {selectedType === "custom" && (
                    <div className="mt-3">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        Describe Your Card Type
                      </label>
                      <Input
                        placeholder="e.g., Get Well Soon, New Baby, Graduation, Sympathy..."
                        value={customCardType}
                        onChange={(e) => setCustomCardType(e.target.value)}
                        style={{ fontSize: '16px' }}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        What type of card is this? This helps personalize the message and style.
                      </p>
                    </div>
                  )}
                </div>

            {/* To/From Fields */}
            <div className="grid grid-cols-2 gap-3">
                  <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  To
                    </label>
                    <Input
                  placeholder="Sarah"
                      value={toField}
                      onChange={(e) => setToField(e.target.value)}
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  From
                    </label>
                    <Input
                  placeholder="Alex"
                      value={fromField}
                      onChange={(e) => setFromField(e.target.value)}
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>

            {/* Main Description */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Describe Your Card
                  </label>
              <Textarea
                placeholder="A cheerful birthday card with flowers and sunshine for my best friend who loves gardening..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="resize-none"
                style={{ fontSize: '16px' }}
              />
                </div>

            {/* Message Section */}
                <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Card Message
                  </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGetMessageHelp}
                  disabled={isGeneratingMessage || !prompt.trim()}
                  className="gap-1 text-xs"
                >
                  <MessageSquarePlus className="w-3 h-3" />
                  {isGeneratingMessage ? "Writing..." : "Help me write"}
                </Button>
                          </div>
                  <Textarea
                placeholder="Write your message here, or click 'Help me write' for AI assistance..."
                value={finalCardMessage}
                onChange={(e) => setFinalCardMessage(e.target.value)}
                    rows={3}
                    className="resize-none"
                    style={{ fontSize: '16px' }}
                  />
                </div>

            {/* Advanced Options */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Settings className="w-4 h-4" />
                    Advanced Options
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                {/* Style Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Artistic Style
                  </label>
                  <Select value={selectedArtisticStyle} onValueChange={setSelectedArtisticStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {artisticStyles.map((style) => (
                        <SelectItem key={style.id} value={style.id}>
                          <div>
                            <div className="font-medium">{style.label}</div>
                            <div className="text-xs text-muted-foreground">{style.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                    
                    {/* Custom Style Description */}
                    {selectedArtisticStyle === "custom" && (
                      <div className="mt-3">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                          Describe Your Custom Style
                  </label>
                  <Textarea
                          placeholder="e.g., in vintage 1920s art deco style with gold accents and geometric patterns..."
                          value={customStyleDescription}
                          onChange={(e) => setCustomStyleDescription(e.target.value)}
                    rows={3}
                    className="resize-none"
                          style={{ fontSize: '16px' }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Describe the artistic style you want for your card (colors, techniques, era, mood, etc.)
                  </p>
                </div>
                    )}
                  </div>

                {/* Model Selection */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Image Model
                    </label>
                  <Select value={selectedImageModel} onValueChange={setSelectedImageModel}>
                    <SelectTrigger>
                      <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                          <div>
                            <div className="font-medium">{model.label}</div>
                            <div className="text-xs text-muted-foreground">{model.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>

                {/* File Uploads */}
                <div className="space-y-3">
                  {/* Handwriting Sample */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Handwriting Sample (Optional)
                    </label>
                    {!handwritingSample ? (
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'handwriting')}
                          disabled={isUploading}
                          className="hidden"
                          id="handwriting-upload"
                        />
                        <label htmlFor="handwriting-upload" className="cursor-pointer">
                          <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {isUploading ? "Uploading..." : "Upload handwriting sample"}
                  </div>
                    </label>
                  </div>
                    ) : (
                      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-800 dark:text-green-200">{handwritingSample.name}</span>
                        </div>
                  <Button 
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setHandwritingSample(null);
                            setHandwritingSampleUrl(null);
                          }}
                        >
                          <X className="w-4 h-4" />
                  </Button>
                      </div>
                  )}
                </div>

                  {/* Reference Image */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Reference Photo (Optional)
                    </label>
                    {!referenceImage ? (
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'reference')}
                          disabled={isUploading}
                          className="hidden"
                          id="reference-upload"
                        />
                        <label htmlFor="reference-upload" className="cursor-pointer">
                          <Wand2 className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {isUploading ? "Uploading..." : "Upload photo to transform"}
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-purple-600" />
                            <span className="text-sm text-purple-800 dark:text-purple-200">{referenceImage.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReferenceImage(null);
                              setReferenceImageUrl(null);
                              setImageTransformation("");
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      <Textarea
                          placeholder="How should we transform your photo? (e.g., 'Turn us into cute cartoon characters while keeping our faces recognizable')"
                        value={imageTransformation}
                        onChange={(e) => setImageTransformation(e.target.value)}
                          rows={2}
                        className="resize-none"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  )}
                </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

                {/* Generate Button */}
                <Button
                  onClick={handleGenerateCard}
                  disabled={isGenerating || !prompt.trim()}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 h-12"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Creating Your Card...
                    </>
                  ) : (
                    <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Create Card
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

        {/* Card Preview */}
        {generatedCard && (
                  <Card className="shadow-lg">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                  <CardTitle>Your Card</CardTitle>
                          <CardDescription>
                            Created {generatedCard.createdAt.toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast.info("Download coming soon!")}>
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
                      <CardPreview 
                        card={generatedCard} 
                        onCardUpdate={(updatedCard) => setGeneratedCard(updatedCard)}
                      />
                    </CardContent>
                  </Card>
        )}

        {/* Empty State */}
        {!generatedCard && (
              <Card className="shadow-lg">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Ready to Create?
                  </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm max-w-sm">
                Describe your perfect card above and we'll bring it to life with AI magic!
                  </p>
                </CardContent>
              </Card>
            )}
      </div>
    </div>
  );
} 