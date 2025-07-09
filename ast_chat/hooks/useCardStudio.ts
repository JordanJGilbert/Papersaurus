"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import * as QRCode from 'qrcode';

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;      // Portrait image - what recipients see first
  backCover: string;       // Portrait image - back of the card
  leftPage: string;        // Portrait image - left interior (decorative art)
  rightPage: string;       // Portrait image - right interior (message area)
  createdAt: Date;
  shareUrl?: string;       // Shareable URL for the card
  // Store the actual prompts sent to image generation
  generatedPrompts?: {
    frontCover?: string;
    backCover?: string;
    leftInterior?: string;
    rightInterior?: string;
  };
  // Thumbnail URLs for faster loading
  thumbnails?: {
    frontCover?: string;
    backCover?: string;
    leftPage?: string;
    rightPage?: string;
  };
  // Style information for smart style mode
  styleInfo?: {
    styleName?: string;
    styleLabel?: string;
  };
}

// Helper function to format countdown as MM:SS
const formatCountdown = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Helper function to format generation time
const formatGenerationTime = (durationSeconds: number) => {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

// Email Helper Function
async function sendThankYouEmail(toEmail: string, cardType: string, cardUrl: string) {
  if (!toEmail.trim()) return;
  
  try {
    // Create HTML email body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin-bottom: 10px;">🎉 Your Card is Ready!</h1>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi there!</p>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Thank you for using VibeCarding to create your beautiful <strong>${cardType}</strong> card!
        </p>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          We hope you love how it turned out. Your card has been generated and is ready for printing or sharing.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${cardUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Your Card
          </a>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          If you have any questions or feedback, feel free to reach out to us.
        </p>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Happy card making!
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280;">
          <p style="margin-bottom: 5px;"><strong>Best regards,</strong></p>
          <p style="margin-bottom: 5px;">The VibeCarding Team</p>
          <p style="margin: 0;">
            <a href="mailto:vibecarding@ast.engineer" style="color: #2563eb; text-decoration: none;">vibecarding@ast.engineer</a>
          </p>
        </div>
      </div>
    `;

    // Plain text fallback
    const textBody = `Hi there!

Thank you for using VibeCarding to create your beautiful ${cardType} card!

We hope you love how it turned out. Your card has been generated and is ready for printing or sharing.

View your card: ${cardUrl}

If you have any questions or feedback, feel free to reach out to us.

Happy card making!

Best regards,
The VibeCarding Team
vibecarding@ast.engineer`;

    // Send to user
    const userResponse = await fetch(`${BACKEND_API_BASE_URL}/send_email_nodejs_style`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        to: toEmail,
        from: 'vibecarding@ast.engineer',
        subject: `Your ${cardType} card is ready!`,
        body: htmlBody,
        text: textBody,
        html: htmlBody
      })
    });

    // Send copy to jordan@ast.engineer
    const adminResponse = await fetch(`${BACKEND_API_BASE_URL}/send_email_nodejs_style`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'jordan@ast.engineer',
        from: 'vibecarding@ast.engineer',
        subject: `Card Created - ${cardType} for ${toEmail}`,
        body: `<div style="font-family: Arial, sans-serif; padding: 20px;">
          <h3 style="color: #2563eb;">New Card Created on VibeCarding</h3>
          <p><strong>User:</strong> ${toEmail}</p>
          <p><strong>Card Type:</strong> ${cardType}</p>
          <p><strong>Card URL:</strong> <a href="${cardUrl}">${cardUrl}</a></p>
          <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
            This is an automated notification of card creation activity.
          </p>
        </div>`,
        text: `New card created on VibeCarding:

User: ${toEmail}
Card Type: ${cardType}
Card URL: ${cardUrl}

This is an automated notification of card creation activity.`
      })
    });

    if (userResponse.ok) {
      toast.success("✉️ Thank you email sent!");
    }
  } catch (error) {
    console.error('Failed to send thank you email:', error);
    // Don't show error toast - this is a nice-to-have feature
  }
}

// Chat Helper Function
async function chatWithAI(userMessage: string, options: {
  systemPrompt?: string | null;
  model?: string;
  includeThoughts?: boolean;
  jsonSchema?: any;
  attachments?: string[];  // Add support for image attachments
} = {}) {
  const {
    systemPrompt = null,
    model = 'gemini-2.5-pro',
    includeThoughts = false,  // Default to false to avoid thinking content in responses
    jsonSchema = null,
    attachments = []  // Default to empty array
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
          json_schema: jsonSchema,
          ...(attachments.length > 0 && { attachments })  // Only include if there are attachments
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

// Card tone/style options
const cardTones = [
  { id: "funny", label: "😄 Funny", description: "Humorous and lighthearted" },
  { id: "genz-humor", label: "💀 GenZ Humor", description: "Internet memes, chaotic energy, and unhinged vibes" },
  { id: "romantic", label: "💕 Romantic", description: "Sweet and loving" },
  { id: "professional", label: "👔 Professional", description: "Formal and business-appropriate" },
  { id: "heartfelt", label: "❤️ Heartfelt", description: "Sincere and emotional" },
  { id: "playful", label: "🎉 Playful", description: "Fun and energetic" },
  { id: "elegant", label: "✨ Elegant", description: "Sophisticated and refined" },
  { id: "casual", label: "😊 Casual", description: "Relaxed and friendly" },
  { id: "inspirational", label: "🌟 Inspirational", description: "Motivating and uplifting" },
  { id: "quirky", label: "🤪 Quirky", description: "Unique and unconventional" },
  { id: "traditional", label: "🎭 Traditional", description: "Classic and timeless" },
];

// Curated artistic styles for beautiful cards
const artisticStyles = [
  {
    id: "ai-smart-style", 
    label: "✨ Smart Style", 
    description: "Let our experts choose the perfect style for your card",
    promptModifier: ""
  },
  {
    id: "custom", 
    label: "✨ Custom Style", 
    description: "Define your own unique artistic style",
    promptModifier: ""
  },
  { 
    id: "watercolor", 
    label: "🎨 Watercolor", 
    description: "Soft, flowing paint effects (our personal favorite)",
    promptModifier: "in watercolor painting style, with soft flowing colors, artistic brush strokes, paper texture, and organic paint bleeds"
  },
  {
    id: "minimalist", 
    label: "✨ Minimalist", 
    description: "Clean, simple, elegant design",
    promptModifier: "in minimalist style with clean lines, simple shapes, plenty of white space, sophisticated typography, and elegant simplicity"
  },
  { 
    id: "botanical", 
    label: "🌿 Botanical", 
    description: "Beautiful flowers and nature elements",
    promptModifier: "in botanical illustration style with detailed flowers, leaves, and natural elements, soft organic shapes, elegant floral arrangements, and nature-inspired designs perfect for greeting cards"
  },
  { 
    id: "comic-book", 
    label: "💥 Comic Book", 
    description: "Bold graphic novel style",
    promptModifier: "in comic book art style with bold outlines, vibrant colors, dynamic poses, speech bubble aesthetics, halftone patterns, and superhero comic book visual elements that create an exciting and energetic feel"
  },
  { 
    id: "dreamy-fantasy", 
    label: "🌸 Dreamy Fantasy", 
    description: "Enchanting anime-inspired art",
    promptModifier: "in dreamy fantasy anime style, with soft pastels, magical atmosphere, detailed nature elements, whimsical characters, and enchanting fairy-tale qualities"
  },
  { 
    id: "art-deco", 
    label: "✨ Art Deco", 
    description: "Elegant 1920s geometric luxury",
    promptModifier: "in vintage Art Deco style with geometric patterns, gold accents, elegant typography, luxurious details, and 1920s glamour"
  },
  { 
    id: "vintage-illustration", 
    label: "📚 Vintage Illustration", 
    description: "Classic storybook charm",
    promptModifier: "in vintage illustration style like classic children's books, with warm nostalgic colors, charming characters, whimsical details, and timeless fairy-tale aesthetics"
  },
  {
    id: "modern-geometric", 
    label: "🔷 Modern Geometric", 
    description: "Clean contemporary shapes",
    promptModifier: "in modern geometric style with clean shapes, contemporary design elements, balanced compositions, and sophisticated color palettes perfect for modern greeting cards"
  },
  {
    id: "soft-pastel", 
    label: "🌸 Soft Pastel", 
    description: "Gentle, soothing colors",
    promptModifier: "in soft pastel style with gentle colors, dreamy atmosphere, delicate textures, and calming visual elements that create a peaceful and heartwarming feeling"
  },
  {
    id: "retro-vintage", 
    label: "📻 Retro Vintage", 
    description: "Classic 1950s-60s nostalgia",
    promptModifier: "in retro vintage style with 1950s-60s aesthetics, classic typography, warm nostalgic colors, and mid-century design elements"
  }
];

// Paper size options
const paperSizes = [
  {
    id: "standard",
    label: "5×7 Card (Standard)",
    description: "Standard 5×7 greeting card (10×7 print layout)",
    aspectRatio: "9:16",
    dimensions: "1024x1536",
    printWidth: "10in",
    printHeight: "7in"
  },
  {
    id: "compact",
    label: "4×6 Card (Compact)",
    description: "Compact 4×6 greeting card (8×6 print layout)",
    aspectRatio: "2:3",
    dimensions: "768x1152",
    printWidth: "8in",
    printHeight: "6in"
  },
  {
    id: "a6",
    label: "A6 Card (4×6)",
    description: "A6 paper size (8.3×5.8 print layout)",
    aspectRatio: "2:3",
    dimensions: "768x1152",
    printWidth: "8.3in",
    printHeight: "5.8in"
  }
];

export function useCardStudio() {
  // All your existing state from page.tsx
  const [prompt, setPrompt] = useState("");
  const [finalCardMessage, setFinalCardMessage] = useState("");
  const [toField, setToField] = useState("");
  const [fromField, setFromField] = useState("");
  const [selectedType, setSelectedType] = useState<string>("birthday");
  const [customCardType, setCustomCardType] = useState<string>("");
  const [selectedTone, setSelectedTone] = useState<string>("funny");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);
  
  // Multiple cards state
  const [numberOfCards, setNumberOfCards] = useState<number>(1);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number>(0);

  // Writing assistant state
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedArtisticStyle, setSelectedArtisticStyle] = useState<string>("watercolor");
  const [customStyleDescription, setCustomStyleDescription] = useState<string>("");
  const [selectedImageModel, setSelectedImageModel] = useState<string>("gpt-image-1");

  // Draft mode specific model selection
  const [selectedDraftModel, setSelectedDraftModel] = useState<string>("gpt-image-1");

  // Progress tracking state
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);
  const [isCardCompleted, setIsCardCompleted] = useState<boolean>(false);

  // Job tracking state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Fast preview mode state
  const [fastPreviewMode, setFastPreviewMode] = useState<boolean>(true);
  
  // Draft mode state - generate 5 low-quality cards for selection
  const [isDraftMode, setIsDraftMode] = useState<boolean>(false);
  const [draftCards, setDraftCards] = useState<GeneratedCard[]>([]); // Cards in completion order (left to right)
  const [draftIndexMapping, setDraftIndexMapping] = useState<number[]>([]); // Maps display position to original draft index
  const [selectedDraftIndex, setSelectedDraftIndex] = useState<number>(-1); // Display position index
  const [isGeneratingFinalCard, setIsGeneratingFinalCard] = useState<boolean>(false);
  const [previewingDraftIndex, setPreviewingDraftIndex] = useState<number>(-1); // Display position index
  const [draftCompletionShown, setDraftCompletionShown] = useState<boolean>(false);
  const [draftCompletionCount, setDraftCompletionCount] = useState<number>(0); // Track actual completions

  // Upload state
  const [handwritingSample, setHandwritingSample] = useState<File | null>(null);
  const [handwritingSampleUrl, setHandwritingSampleUrl] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [imageTransformation, setImageTransformation] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  // Email state
  const [userEmail, setUserEmail] = useState<string>("");
  
  // Card ID for URL generation (generated once per card creation)
  const [currentCardId, setCurrentCardId] = useState<string | null>(null);

  // New options for handwritten messages and single-sided printing
  const [isHandwrittenMessage, setIsHandwrittenMessage] = useState(false);
  const [isFrontBackOnly, setIsFrontBackOnly] = useState(false);

  // Paper size options
  const [selectedPaperSize, setSelectedPaperSize] = useState<string>("standard");

  // Loading states for each card section
  const [sectionLoadingStates, setSectionLoadingStates] = useState<{
    frontCover: 'idle' | 'loading' | 'completed' | 'error';
    backCover: 'idle' | 'loading' | 'completed' | 'error';
    leftInterior: 'idle' | 'loading' | 'completed' | 'error';
    rightInterior: 'idle' | 'loading' | 'completed' | 'error';
  }>({
    frontCover: 'idle',
    backCover: 'idle',
    leftInterior: 'idle',
    rightInterior: 'idle',
  });

  // Clean progress tracking
  const [progressPercentage, setProgressPercentage] = useState<number>(0);

  // Track if initial load is complete
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  
  // Textarea expand state
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);

  // Message version control and refinement
  const [messageHistory, setMessageHistory] = useState<string[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [isRefiningMessage, setIsRefiningMessage] = useState(false);
  const [showRefinementBox, setShowRefinementBox] = useState(false);

  // Settings menu state
  const [showSettings, setShowSettings] = useState(false);

  // Template selection state
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [isSearchingTemplates, setIsSearchingTemplates] = useState(false);
  const [aiFilteredCards, setAiFilteredCards] = useState<any[]>([]);
  const [searchMode, setSearchMode] = useState<'text' | 'ai' | 'hybrid'>('text');
  const [textFilteredCards, setTextFilteredCards] = useState<any[]>([]);
  const [showPrompts, setShowPrompts] = useState(false);
  
  // Print options state
  const [printOption, setPrintOption] = useState<'physical' | 'email'>('physical');
  
  // Print confirmation dialog state
  const [showPrintConfirmation, setShowPrintConfirmation] = useState(false);

  // Generation time tracking
  const [generationDuration, setGenerationDuration] = useState<number | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [currentElapsedTime, setCurrentElapsedTime] = useState<number>(0);
  const [elapsedTimeInterval, setElapsedTimeInterval] = useState<NodeJS.Timeout | null>(null);

  // Template customization state
  const [showTemplateCustomization, setShowTemplateCustomization] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<GeneratedCard | null>(null);
  const [templateCustomizations, setTemplateCustomizations] = useState({
    promptChanges: "",
    messageChanges: "",
    useReferenceImage: false,
    referenceImageFile: null as File | null,
    referenceImageUrls: [] as string[],
    referenceImageTransformation: ""
  });

  // Job management functions
  const saveJobToStorage = (jobId: string, jobData: any) => {
    try {
      localStorage.setItem(`cardJob_${jobId}`, JSON.stringify({
        ...jobData,
        id: jobId,
        status: 'processing',
        createdAt: Date.now()
      }));
      
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      if (!pendingJobs.includes(jobId)) {
        pendingJobs.push(jobId);
        localStorage.setItem('pendingCardJobs', JSON.stringify(pendingJobs));
      }
    } catch (error) {
      console.error('Failed to save job to localStorage:', error);
    }
  };

  // Helper function to scroll to card preview
  const scrollToCardPreview = () => {
    setTimeout(() => {
      const cardPreviewElement = document.querySelector('[data-card-preview]');
      if (cardPreviewElement) {
        cardPreviewElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 500);
  };

  // Start elapsed time tracking
  const startElapsedTimeTracking = (startTime?: number, estimatedTotalSeconds?: number) => {
    const start = startTime || Date.now();
    setGenerationStartTime(start);
    
    localStorage.setItem('generation-start-time', start.toString());
    
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
    }
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setCurrentElapsedTime(elapsed);
      
      const estimatedTotal = estimatedTotalSeconds || (isDraftMode ? 45 : 150);
      const percentage = Math.min((elapsed / estimatedTotal) * 100, 95);
      setProgressPercentage(percentage);
    }, 1000);
    
    setElapsedTimeInterval(interval);
  };

  // Stop elapsed time tracking
  const stopElapsedTimeTracking = () => {
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
      setElapsedTimeInterval(null);
    }
    localStorage.removeItem('generation-start-time');
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
        setReferenceImages(prev => [...prev, file]);
        setReferenceImageUrls(prev => [...prev, result.url]);
        console.log("🔍 DEBUG: Reference image uploaded successfully:", {
          fileName: file.name,
          url: result.url,
          totalImages: referenceImages.length + 1
        });
        toast.success(`Reference image uploaded! ${referenceImages.length + 1} photo${referenceImages.length + 1 > 1 ? 's' : ''} ready for character creation.`);
      }
    } catch (error) {
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveReferenceImage = (index: number) => {
    const removedImage = referenceImages[index];
    const removedUrl = referenceImageUrls[index];
    
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    setReferenceImageUrls(prev => prev.filter((_, i) => i !== index));
    
    console.log("🔍 DEBUG: Reference image removed:", {
      fileName: removedImage?.name,
      url: removedUrl,
      remainingImages: referenceImages.length - 1
    });
    
    toast.success(`Reference image removed! ${referenceImages.length - 1} photo${referenceImages.length - 1 !== 1 ? 's' : ''} remaining.`);
  };

  // Writing Assistant - full function implemented below

  // Message version control functions
  const addMessageToHistory = (message: string) => {
    if (message.trim() === "") return;
    
    const cleanMessage = message.replace(/<\/?MESSAGE>/g, '').trim();
    if (cleanMessage === "") return;
    
    const newHistory = messageHistory.slice(0, currentMessageIndex + 1);
    newHistory.push(cleanMessage);
    
    if (newHistory.length > 10) {
      newHistory.shift();
    } else {
      setCurrentMessageIndex(currentMessageIndex + 1);
    }
    
    setMessageHistory(newHistory);
    setCurrentMessageIndex(newHistory.length - 1);
  };

  const undoMessage = () => {
    if (currentMessageIndex > 0) {
      const newIndex = currentMessageIndex - 1;
      setCurrentMessageIndex(newIndex);
      setFinalCardMessage(messageHistory[newIndex]);
    }
  };

  const redoMessage = () => {
    if (currentMessageIndex < messageHistory.length - 1) {
      const newIndex = currentMessageIndex + 1;
      setCurrentMessageIndex(newIndex);
      setFinalCardMessage(messageHistory[newIndex]);
    }
  };

  // Full message generation function (from original page.tsx)
  const handleGetMessageHelp = async () => {
    // Validate custom card type if selected
    if (selectedType === "custom" && !customCardType.trim()) {
      toast.error("Please describe your custom card type first!");
      return;
    }
    
    setIsGeneratingMessage(true);

    try {
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      
      // Use effective prompt logic here too
      const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;
      
      const messagePrompt = `Create a ${toneDescription} message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${effectivePrompt}"
${toField ? `Recipient: ${toField}` : "Recipient: [not specified]"}
${fromField ? `Sender: ${fromField}` : "Sender: [not specified]"}
Card Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}

Instructions:
- Write a message that is ${toneDescription} and feels personal and genuine
- ${toField ? `Address the message to ${toField} directly, using their name naturally` : "Write in a way that could be personalized to any recipient"}
- ${fromField ? `Write as if ${fromField} is personally writing this message` : `Write in a ${toneDescription} tone`}
- Match the ${toneDescription} tone and occasion of the ${cardTypeForPrompt} card type
- Be inspired by the theme: "${effectivePrompt}"
- Keep it concise but meaningful (2-4 sentences ideal)
- Make it feel authentic, not generic
- SAFETY: Never include brand names, character names, trademarked terms, or inappropriate content. If the theme references these, use generic alternatives or focus on the emotions/concepts instead
- Keep content family-friendly and appropriate for all ages
- ${selectedTone === 'funny' ? 'Include appropriate humor that fits the occasion' : ''}
- ${selectedTone === 'genz-humor' ? 'Use GenZ humor with internet slang, memes, and chaotic energy - think "no cap", "periodt", "it\'s giving...", "slay", etc. Be unhinged but endearing' : ''}
- ${selectedTone === 'professional' ? 'Keep it formal and business-appropriate' : ''}
- ${selectedTone === 'romantic' ? 'Include loving and romantic language' : ''}
- ${selectedTone === 'playful' ? 'Use fun and energetic language' : ''}
- ${toField && fromField ? `Show the relationship between ${fromField} and ${toField} through the ${toneDescription} message tone` : ""}
- ${fromField ? `End the message with a signature line like "Love, ${fromField}" or "- ${fromField}" or similar, naturally integrated into the message.` : ""}

Return ONLY the message text that should appear inside the card - no quotes, no explanations, no markdown formatting (no *bold*, _italics_, or other markdown), just the complete ${toneDescription} message in plain text.

IMPORTANT: Wrap your final message in <MESSAGE> </MESSAGE> tags. Everything outside these tags will be ignored.`;

      const generatedMessage = await chatWithAI(messagePrompt, {
        model: "gemini-2.5-pro",
        includeThoughts: false  // Don't include thinking content in message generation
      });

      if (generatedMessage?.trim()) {
        // Extract message content between <MESSAGE> tags using regex
        const messageMatch = generatedMessage.match(/<MESSAGE>([\s\S]*?)<\/MESSAGE>/);
        let extractedMessage = messageMatch ? messageMatch[1].trim() : generatedMessage.trim();
        
        // Ensure no MESSAGE tags are included in the final message
        extractedMessage = extractedMessage.replace(/<\/?MESSAGE>/g, '').trim();
        
        // Add current message to history if it exists and is different
        if (finalCardMessage.trim() && finalCardMessage.trim() !== extractedMessage) {
          addMessageToHistory(finalCardMessage);
        }
        
        setFinalCardMessage(extractedMessage);
        
        // Add the new message to history
        addMessageToHistory(extractedMessage);
        
        toast.success("✨ Personalized message created!");
      }
    } catch (error) {
      toast.error("Failed to generate message. Please try again.");
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  // Main card generation function
  const handleGenerateCardAsync = async () => {
    if (!userEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Validate custom style if selected
    if (selectedArtisticStyle === "custom" && !customStyleDescription.trim()) {
      toast.error("Please describe your custom artistic style");
      return;
    }

    // Validate reference images with model compatibility
    if (referenceImageUrls.length > 0 && selectedImageModel !== "gpt-image-1") {
      toast.error("Reference photos are only supported with GPT Image 1 model. Please switch to GPT Image 1 in Advanced Options or remove reference photos.");
      return;
    }

    // Clear all draft mode states to prevent UI conflicts
    setIsDraftMode(false);
    setDraftCards([]);
    setDraftIndexMapping([]);
    setSelectedDraftIndex(-1);
    setIsGeneratingFinalCard(false);
    setPreviewingDraftIndex(-1);
    setDraftCompletionShown(false);
    setDraftCompletionCount(0); // Reset completion counter
    
    // Clear any existing card states
    setGeneratedCards([]);
    setGeneratedCard(null);
    setSelectedCardIndex(0);
    setCurrentCardId(null);
    setIsCardCompleted(false);

    setIsGenerating(true);
    startElapsedTimeTracking(undefined, 120);
    setGenerationProgress("Creating your personalized card...");
    setProgressPercentage(0);

    try {
      // Create job tracking
      const jobId = uuidv4();
      setCurrentJobId(jobId);
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      let messageContent = finalCardMessage;
      
      // Handle message generation if needed
      if (isHandwrittenMessage) {
        messageContent = "[Blank space for handwritten message]";
      } else if (!messageContent.trim() && !isFrontBackOnly) {
        setGenerationProgress("✍️ Writing the perfect message...");
        
        const autoMessagePrompt = `Create a heartfelt message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${prompt || `A beautiful ${cardTypeForPrompt} card`}"
${toField ? `Recipient: ${toField}` : "Recipient: [not specified]"}
${fromField ? `Sender: ${fromField}` : "Sender: [not specified]"}

Instructions:
- Write a message that feels personal and genuine
- Keep it concise but meaningful (2-4 sentences ideal)
- Make it feel authentic, not generic
- Keep content family-friendly and appropriate for all ages
- ${fromField ? `End the message with a signature line like "Love, ${fromField}" or "- ${fromField}" or similar, naturally integrated into the message.` : ""}

Return ONLY the message text that should appear inside the card.

IMPORTANT: Wrap your final message in <MESSAGE> </MESSAGE> tags.`;

        const generatedMessage = await chatWithAI(autoMessagePrompt, {
          model: "gemini-2.5-pro",
          includeThoughts: false
        });
        
        if (generatedMessage?.trim()) {
          const messageMatch = generatedMessage.match(/<MESSAGE>([\s\S]*?)<\/MESSAGE>/);
          if (messageMatch && messageMatch[1]) {
            messageContent = messageMatch[1].trim();
            setFinalCardMessage(messageContent);
          }
        }
      }

      // Generate style and paper config
      const selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
      const styleModifier = selectedArtisticStyle === "custom" 
        ? customStyleDescription 
        : selectedStyle?.promptModifier || "";

      const paperConfig = paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0];

      setGenerationProgress("🎨 Creating artistic vision for your card...");

      // Generate prompts
      const promptGenerationQuery = `Create prompts for a ${cardTypeForPrompt} greeting card.

Theme: "${prompt || `A beautiful ${cardTypeForPrompt} card`}"
Style: ${selectedStyle?.label || "Default"}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
${!isFrontBackOnly ? `Message: "${messageContent}"` : ""}
${referenceImageUrls.length > 0 ? `Reference Photos: ${referenceImageUrls.length} photo(s) provided for character creation` : ""}

Requirements:
- Flat 2D artwork for printing
- Full-bleed backgrounds extending to edges
- Keep text, faces, and key elements at least 10% away from top/bottom edges
- Family-friendly and appropriate for greeting cards
- Style: ${styleModifier}

Return JSON:
{
  "frontCover": "detailed front cover prompt",
  "backCover": "detailed back cover prompt"${!isFrontBackOnly ? ',\n  "leftInterior": "detailed left interior prompt",\n  "rightInterior": "detailed right interior prompt"' : ''}
}`;

      const generatedPrompts = await chatWithAI(promptGenerationQuery, {
        jsonSchema: {
          type: "object",
          properties: {
            frontCover: { type: "string" },
            backCover: { type: "string" },
            ...(isFrontBackOnly ? {} : { 
              leftInterior: { type: "string" },
              rightInterior: { type: "string" }
            })
          },
          required: ["frontCover", "backCover", ...(isFrontBackOnly ? [] : ["leftInterior", "rightInterior"])]
        },
        model: "gemini-2.5-pro",
        attachments: referenceImageUrls
      });

      if (!generatedPrompts || !generatedPrompts.frontCover) {
        throw new Error("Failed to generate image prompts");
      }

      // Save job data
      const jobData = {
        prompt: prompt || `A beautiful ${cardTypeForPrompt} card`,
        selectedType,
        customCardType,
        selectedTone,
        finalCardMessage: messageContent,
        toField,
        fromField,
        userEmail,
        selectedArtisticStyle,
        customStyleDescription,
        selectedImageModel,
        isFrontBackOnly,
        numberOfCards,
        selectedPaperSize,
        prompts: generatedPrompts,
        paperConfig
      };
      
      saveJobToStorage(jobId, jobData);
      
      setGenerationProgress("🚀 Starting background generation...");
      
      // Prepare input images for reference photo support
      const inputImages: string[] = [];
      if (referenceImageUrls.length > 0 && selectedImageModel === "gpt-image-1") {
        inputImages.push(...referenceImageUrls);
      }

      const response = await fetch('/api/generate-card-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          prompts: generatedPrompts,
          config: {
            userNumber: "+17145986105",
            modelVersion: selectedImageModel,
            aspectRatio: paperConfig.aspectRatio,
            quality: "high",
            outputFormat: "jpeg",
            outputCompression: 100,
            moderation: "low",
            dimensions: paperConfig.dimensions,
            isFrontBackOnly,
            userEmail,
            cardType: cardTypeForPrompt,
            toField,
            fromField,
            isDraftMode: false,
            ...(inputImages.length > 0 && { 
              input_images: inputImages,
              input_images_mode: "front_cover_only"
            })
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.status !== 'processing') {
        throw new Error(result.message || 'Failed to start card generation');
      }

      setGenerationProgress("✨ Bringing your vision to life...");
      toast.success("🎉 Card generation started!");
      
      // Start polling for completion (we'll add this function next)
                  pollJobStatus(jobId);

    } catch (error) {
      console.error('Card generation error:', error);
      toast.error("Failed to generate card. Please try again.");
      
      if (currentJobId) {
        removeJobFromStorage(currentJobId);
        setCurrentJobId(null);
      }
      
      setIsGenerating(false);
      setGenerationProgress("");
      stopElapsedTimeTracking();
    }
  };

  // Draft mode generation - creates 5 front cover variations
  const handleGenerateDraftCards = async () => {
    if (!userEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Validate custom style if selected
    if (selectedArtisticStyle === "custom" && !customStyleDescription.trim()) {
      toast.error("Please describe your custom artistic style");
      return;
    }

    // Validate reference images with model compatibility
    if (referenceImageUrls.length > 0 && selectedDraftModel !== "gpt-image-1") {
      toast.error("Reference photos are only supported with GPT Image 1 model. Please switch to GPT Image 1 for draft mode or remove reference photos.");
      return;
    }

    setIsDraftMode(true);
    setIsGenerating(true);
    startElapsedTimeTracking(undefined, 45); // 45 seconds for draft mode
    setGenerationProgress("🎨 Creating 5 front cover variations for you to choose from...");
    setProgressPercentage(0);
    setDraftCards([]);
    setDraftIndexMapping([]);
    setSelectedDraftIndex(-1);
    setDraftCompletionShown(false);
    setDraftCompletionCount(0); // Reset completion counter
    
    // Clear any previous card state to avoid UI conflicts
    setGeneratedCard(null);
    setGeneratedCards([]);
    setIsCardCompleted(false);

    try {
      console.log("🚀 Starting draft mode generation with 5 variations");
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;

      // Show specific message for GPT-1 users about quality enforcement
      if (selectedDraftModel === "gpt-image-1") {
        const styleMessage = selectedArtisticStyle === "ai-smart-style" 
          ? " across 5 curated artistic styles!"
          : " (using low quality for fast previews)!";
        toast.success(`🎨 Generating 5 front cover variations with GPT-1${styleMessage}`);
      } else {
        const styleMessage = selectedArtisticStyle === "ai-smart-style" 
          ? " across 5 curated artistic styles!"
          : " for you to choose from!";
        toast.success(`🎨 Generating 5 front cover variations${styleMessage}`);
      }

      // Generate 5 draft variations with smart style distribution
      const draftPromises = Array.from({ length: 5 }, async (_, index) => {
        try {
          console.log(`🎨 Starting draft variation ${index + 1}`);
          
          // For smart style, use predefined styles for all 5 variations
          let styleOverride: string | undefined = undefined;
          let styleLabel: string | undefined = undefined;
          if (selectedArtisticStyle === "ai-smart-style") {
            const predefinedStyles = [
              "watercolor",
              "botanical",
              "comic-book", 
              "dreamy-fantasy",
              "minimalist"
            ];
            
            const styleLabels = [
              "🎨 Watercolor",
              "🌿 Botanical", 
              "💥 Comic Book",
              "🌸 Dreamy Fantasy",
              "✨ Minimalist"
            ];
            
            styleOverride = predefinedStyles[index];
            styleLabel = styleLabels[index];
            console.log(`🎨 Draft ${index + 1}: Using predefined style "${styleOverride}" (${styleLabel})`);
          }
          
          // Generate front cover prompt for this variation
          const selectedStyle = artisticStyles.find(style => style.id === (styleOverride || selectedArtisticStyle));
          const styleModifier = (styleOverride && styleOverride === "custom") 
            ? customStyleDescription 
            : selectedStyle?.promptModifier || "";

          const frontCoverPromptQuery = `You are an expert AI greeting card designer. Create a front cover prompt for a ${cardTypeForPrompt} greeting card.

Theme: "${effectivePrompt}"
Style: ${selectedStyle?.label || "Default"}
Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
${referenceImageUrls.length > 0 ? `Reference Photos: I have attached ${referenceImageUrls.length} reference photo${referenceImageUrls.length > 1 ? 's' : ''} for character creation.` : ""}

Front Cover Requirements:
- Include "${cardTypeForPrompt}" greeting text positioned safely in center area (avoid top/bottom 10%)
- Use beautiful, readable handwritten cursive script
- ${referenceImageUrls.length > 0 ? 'Create cartoon/illustrated characters from reference photos' : 'Create charming cartoon-style figures if needed'}
- Be creative and unique, avoid generic designs
- Flat 2D artwork for printing
- Style: ${styleModifier}

Return ONLY the front cover prompt as plain text.`;

          const frontCoverPrompt = await chatWithAI(frontCoverPromptQuery, {
            model: "gemini-2.5-pro",
            attachments: referenceImageUrls
          });

          if (!frontCoverPrompt?.trim()) {
            throw new Error("Failed to generate front cover prompt");
          }

          // Enhance with reference image instructions if available
          let enhancedFrontCoverPrompt = frontCoverPrompt.trim();
          if (referenceImageUrls.length > 0 && selectedDraftModel === "gpt-image-1") {
            enhancedFrontCoverPrompt += `\n\nCRITICAL CHARACTER REFERENCE INSTRUCTIONS: I have provided ${referenceImageUrls.length > 1 ? 'multiple reference photos' : 'a reference photo'} as input image${referenceImageUrls.length > 1 ? 's' : ''}. You MUST create cartoon/illustrated characters that accurately represent ONLY the people who are actually visible in ${referenceImageUrls.length > 1 ? 'these reference photos' : 'this reference photo'} with high fidelity to their appearance.`;
          }

          // Generate the image
          const jobId = `draft-${index}-${uuidv4()}`;
          const inputImages: string[] = [];
          if (referenceImageUrls.length > 0 && selectedDraftModel === "gpt-image-1") {
            inputImages.push(...referenceImageUrls);
          }

          const response = await fetch('/api/generate-card-async', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId,
              prompts: { frontCover: enhancedFrontCoverPrompt },
              config: {
                userNumber: "+17145986105",
                modelVersion: selectedDraftModel,
                aspectRatio: paperSizes.find(size => size.id === selectedPaperSize)?.aspectRatio || "9:16",
                quality: "low", // Low quality for draft mode
                outputFormat: "jpeg",
                outputCompression: 100,
                moderation: "low",
                dimensions: paperSizes.find(size => size.id === selectedPaperSize)?.dimensions || "1024x1536",
                isFrontBackOnly: true,
                userEmail,
                cardType: cardTypeForPrompt,
                toField,
                fromField,
                isDraftMode: true,
                ...(inputImages.length > 0 && { 
                  input_images: inputImages,
                  input_images_mode: "front_cover_only"
                })
              }
            })
          });

          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.status !== 'processing') {
            throw new Error(result.message || 'Failed to start draft generation');
          }

          console.log(`✅ Draft variation ${index + 1} job started:`, jobId);
          
          // Store the job with style info for later
          saveJobToStorage(jobId, {
            isDraft: true,
            draftIndex: index,
            styleInfo: styleOverride ? { styleName: styleOverride, styleLabel: styleLabel } : undefined,
            frontCoverPrompt: enhancedFrontCoverPrompt
          });

          // Start polling for this specific draft job
          console.log(`🔄 Starting polling for draft job ${jobId}`);
          pollJobStatus(jobId);

        } catch (error) {
          console.error(`❌ Draft variation ${index + 1} failed:`, error);
          toast.error(`Draft variation ${index + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      // Wait for all draft generations to start (but not complete)
      await Promise.allSettled(draftPromises);
      console.log("🚀 All draft variations started");

    } catch (error) {
      console.error('Draft card generation error:', error);
      toast.error(`Failed to start draft generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      setIsGenerating(false);
      setIsDraftMode(false);
      setDraftCompletionShown(false);
      setDraftCompletionCount(0); // Reset completion counter
      setGenerationProgress("");
      stopElapsedTimeTracking();
    }
  };

  // Check job status
  const checkJobStatus = async (jobId: string): Promise<any> => {
    try {
      const response = await fetch(`/api/job-status/${jobId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to check job status:', error);
      return null;
    }
  };

  // Poll job status with exponential backoff
  const pollJobStatus = async (jobId: string, attempt: number = 1) => {
    try {
      const statusResponse = await checkJobStatus(jobId);
      
      // Check if this is a draft job
      const isDraftJob = jobId.startsWith('draft-');
      const draftIndex = isDraftJob ? parseInt(jobId.split('-')[1]) : -1;
      
      if (statusResponse && statusResponse.status === 'completed') {
        console.log('🎉 Job completed! Card data:', statusResponse.cardData, 'isDraftJob:', isDraftJob);
        
        if (statusResponse.cardData) {
          if (isDraftJob && draftIndex >= 0) {
            // Handle draft card completion - no QR code needed for drafts
            console.log(`🎨 Draft variation ${draftIndex + 1} completed!`);
            
            // Get style info for smart style mode
            let styleInfo: { styleName: string; styleLabel: string } | undefined = undefined;
            if (selectedArtisticStyle === "ai-smart-style") {
              const predefinedStyles = [
                "watercolor", "botanical", "comic-book", "dreamy-fantasy", "minimalist"
              ];
              const styleLabels = [
                "🎨 Watercolor", "🌿 Botanical", "💥 Comic Book", "🌸 Dreamy Fantasy", "✨ Minimalist"
              ];
              if (draftIndex >= 0 && draftIndex < predefinedStyles.length) {
                styleInfo = {
                  styleName: predefinedStyles[draftIndex],
                  styleLabel: styleLabels[draftIndex]
                };
              }
            }

            const draftCard: GeneratedCard = {
              id: `draft-${draftIndex + 1}-${Date.now()}`,
              prompt: statusResponse.cardData.prompt || `Draft Variation ${draftIndex + 1}`,
              frontCover: statusResponse.cardData.frontCover || "",
              backCover: "", // Draft mode only generates front cover
              leftPage: "", // Will be generated in final high-quality version
              rightPage: "", // Will be generated in final high-quality version
              createdAt: new Date(),
              generatedPrompts: {
                frontCover: statusResponse.cardData.generatedPrompts?.frontCover || ""
              },
              styleInfo: styleInfo
            };
            
            // Update draft cards state - populate from left to right as they complete
            setDraftCards(prev => {
              const updated = [...prev];
              updated.push(draftCard); // Add to next available position (left to right)
              return updated;
            });
            
            // Update mapping to track which display position corresponds to which original draft index
            setDraftIndexMapping(prev => {
              const updatedMapping = [...prev];
              updatedMapping.push(draftIndex); // Map new display position to original draft index
              return updatedMapping;
            });
            
            // Increment completion counter and check completion
            setDraftCompletionCount(prevCount => {
              const newCompletedCount = prevCount + 1;
              console.log(`📊 Draft progress: ${newCompletedCount}/5 front cover variations complete`);
              
              // Scroll to draft preview when first card appears
              if (newCompletedCount === 1) {
                scrollToCardPreview();
              }
              
              if (newCompletedCount === 5) {
                setIsGenerating(false);
                setGenerationProgress("");
                setProgressPercentage(100);
                stopElapsedTimeTracking();
                
                // Only show completion toast once using a flag, and only if user hasn't moved to final generation
                setDraftCompletionShown(prev => {
                  if (!prev && !isGeneratingFinalCard) {
                    toast.success("🎨 All 5 front cover variations ready! Choose your favorite below.");
                    return true;
                  }
                  return prev;
                });
              } else {
                setGenerationProgress(`✨ ${newCompletedCount}/5 front cover variations complete... ${newCompletedCount >= 2 ? "You can select one now to proceed!" : ""}`);
                setProgressPercentage((newCompletedCount / 5) * 100);
              }
              
              return newCompletedCount;
            });
            
            removeJobFromStorage(jobId);
          } else {
            // Handle final card completion - apply QR code and full processing
            let cardWithQR = { ...statusResponse.cardData };
            
            // Ensure the card has a valid createdAt date
            if (!cardWithQR.createdAt) {
              cardWithQR.createdAt = new Date();
            } else if (typeof cardWithQR.createdAt === 'string' || typeof cardWithQR.createdAt === 'number') {
              cardWithQR.createdAt = new Date(cardWithQR.createdAt);
            }
            
            // Ensure the card has a valid ID
            if (!cardWithQR.id) {
              cardWithQR.id = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            }
            
            console.log('🔄 Final card data prepared:', cardWithQR);
            
            try {
              setGenerationProgress("✨ Adding interactive QR code to your card...");
              console.log('🔄 Starting QR overlay process for final card');
              
              // Store card data first to get a shareable URL
              if (cardWithQR.frontCover) {
                try {
                  const cardStoreResponse = await fetch('/api/cards/store', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      prompt: cardWithQR.prompt || '',
                      frontCover: cardWithQR.frontCover || '',
                      backCover: cardWithQR.backCover || '',
                      leftPage: cardWithQR.leftPage || '',
                      rightPage: cardWithQR.rightPage || '',
                      generatedPrompts: cardWithQR.generatedPrompts || null
                    })
                  });
                  
                  if (cardStoreResponse.ok) {
                    const cardStoreData = await cardStoreResponse.json();
                    const actualShareUrl = cardStoreData.share_url;
                    console.log('Using actual share URL for QR code:', actualShareUrl);
                    
                    // Apply QR code to back cover using the API-returned URL
                    if (cardWithQR.backCover && actualShareUrl) {
                      console.log('🔄 Applying QR overlay to final card...');
                      const originalBackCover = cardWithQR.backCover;
                      // cardWithQR.backCover = await overlayQRCodeOnImage(originalBackCover, actualShareUrl);
                      cardWithQR.shareUrl = actualShareUrl;
                      console.log('✅ QR overlay complete for final card');
                    }
                  } else {
                    console.warn('Failed to store card for sharing, continuing without QR code');
                  }
                } catch (error) {
                  console.error('❌ Failed to store card or overlay QR code:', error);
                  // Continue without QR code if there's an error
                }
              } else {
                console.warn('No front cover found, skipping QR code process');
              }
            } catch (error) {
              console.error('❌ Error in QR code process:', error);
              // Continue without QR code if there's an error
            }
            
            console.log('🎯 Setting final card state:', cardWithQR);
            
            // Set the card states - this is critical!
            setGeneratedCard(cardWithQR);
            setGeneratedCards([cardWithQR]);
            setSelectedCardIndex(0);
            setIsCardCompleted(true);
            setIsGenerating(false);
            setIsGeneratingFinalCard(false);
            setIsDraftMode(false);
            setDraftCompletionShown(false);
            setDraftCompletionCount(0); // Reset completion counter
            setGenerationProgress("");
            
            // Scroll to card preview
            scrollToCardPreview();
            
            // Capture generation time from backend
            if (statusResponse.cardData.generationTimeSeconds) {
              setGenerationDuration(statusResponse.cardData.generationTimeSeconds);
            }
            
            // Stop elapsed time tracking
            stopElapsedTimeTracking();
            
            // Set progress to 100%
            setProgressPercentage(100);
            setGenerationProgress("Card generation complete!");
            
            toast.success("🎉 Your card is ready!");
            
            // Send thank you email
            if (userEmail.trim()) {
              const cardTypeForEmail = selectedType === "custom" ? customCardType : selectedType;
              sendThankYouEmail(userEmail, cardTypeForEmail, cardWithQR.shareUrl || 'https://vibecarding.com');
            }
            
            console.log('✅ Final card completion process finished successfully');
            removeJobFromStorage(jobId);
            setCurrentJobId(null);
          }
        } else {
          console.error('❌ No card data in completed response');
          toast.error("❌ Card generation completed but no data received. Please try again.");
          removeJobFromStorage(jobId);
          if (!isDraftJob) {
            setCurrentJobId(null);
          }
        }
      } else if (statusResponse && statusResponse.status === 'failed') {
        console.error('❌ Job failed:', statusResponse);
        
        if (isDraftJob && draftIndex >= 0) {
          toast.error(`Draft variation ${draftIndex + 1} failed. Continuing with others...`);
        } else {
          toast.error("❌ Card generation failed. Please try again.");
          setIsGenerating(false);
          setIsGeneratingFinalCard(false);
          stopElapsedTimeTracking();
          setGenerationProgress("");
          setProgressPercentage(0);
          setCurrentJobId(null);
        }
        
        removeJobFromStorage(jobId);
      } else if (statusResponse && statusResponse.status === 'processing') {
        // Continue polling every 3 seconds - near real-time updates for better UX
        console.log(`🔄 Job still processing (attempt ${attempt}), polling again...`);
        setTimeout(() => pollJobStatus(jobId, attempt + 1), 3000);
      } else {
        console.warn('⚠️ Unexpected status response:', statusResponse);
        // Continue polling in case it's a temporary issue
        setTimeout(() => pollJobStatus(jobId, attempt + 1), 5000);
      }
    } catch (error) {
      console.error('Failed to poll job status:', error);
      // Retry after delay with exponential backoff
      const delay = Math.min(10000, 3000 * Math.pow(1.5, Math.min(attempt - 1, 5)));
      setTimeout(() => pollJobStatus(jobId, attempt + 1), delay);
    }
  };

  // Remove job from storage
  const removeJobFromStorage = (jobId: string) => {
    try {
      localStorage.removeItem(`cardJob_${jobId}`);
      
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      const updatedJobs = pendingJobs.filter((id: string) => id !== jobId);
      localStorage.setItem('pendingCardJobs', JSON.stringify(updatedJobs));
    } catch (error) {
      console.error('Failed to remove job from localStorage:', error);
    }
  };

  // Generate final high-quality card from selected draft
  const handleGenerateFinalFromDraft = async (displayIndex: number) => {
    if (displayIndex < 0 || displayIndex >= draftCards.length || !draftCards[displayIndex]) {
      toast.error("Invalid draft selection");
      return;
    }

    // Get the original draft index from the mapping
    const originalDraftIndex = draftIndexMapping[displayIndex];
    if (originalDraftIndex === undefined) {
      toast.error("Could not find original draft data");
      return;
    }

    // Stop remaining draft generations to focus on the selected design
    const remainingDrafts = 5 - draftCards.length;
    if (remainingDrafts > 0 && isGenerating) {
      setIsGenerating(false); // Stop the draft generation process
      toast.info(`🎯 Focusing on your selected design! Skipping ${remainingDrafts} remaining variations.`);
    }

    setIsGeneratingFinalCard(true);
    setSelectedDraftIndex(displayIndex); // Store display index for UI
    startElapsedTimeTracking(undefined, 120); // 120 seconds for final card generation
    setGenerationProgress("🎨 Creating high-quality version of your selected design...");

    try {
      const selectedDraft = draftCards[displayIndex];
      const jobId = uuidv4();
      
      // Generate the missing prompts using the stored frontCover prompt + user info
      console.log("🔄 Generating complete prompts from stored front cover prompt + user info");
      
      // The draft should have at least the frontCover prompt
      const storedFrontCoverPrompt = selectedDraft.generatedPrompts?.frontCover;
      if (!storedFrontCoverPrompt) {
        throw new Error("Selected draft is missing frontCover prompt");
      }
      
      console.log("✅ Found stored front cover prompt:", storedFrontCoverPrompt.substring(0, 100) + "...");
      
      // Now generate the missing 3 prompts using the front cover context + user info
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;
      
      let messageContent = finalCardMessage;
      if (isHandwrittenMessage) {
        messageContent = "[Blank space for handwritten message]";
      }
      
      // Get style from the selected draft or fall back to current setting  
      const draftStyleInfo = selectedDraft.styleInfo;
      let styleModifier = "";
      if (draftStyleInfo && draftStyleInfo.styleName) {
        const selectedStyle = artisticStyles.find(style => style.id === draftStyleInfo.styleName);
        styleModifier = selectedStyle?.promptModifier || "";
      } else {
        const selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
        styleModifier = selectedArtisticStyle === "custom" 
          ? customStyleDescription 
          : selectedStyle?.promptModifier || "";
      }
      
      const generateOtherPromptsQuery = `You are creating the remaining prompts for a greeting card. You already have the front cover prompt below.

EXISTING FRONT COVER PROMPT:
"${storedFrontCoverPrompt}"

CARD CONTEXT:
- Type: ${cardTypeForPrompt}
- Theme: "${effectivePrompt}"  
- Tone: ${toneDescription}
${toField ? `- To: ${toField}` : ""}
${fromField ? `- From: ${fromField}` : ""}
${!isFrontBackOnly ? `- Message: "${messageContent}"` : ""}
${isHandwrittenMessage ? "- Note: Include space for handwritten message" : ""}

TASK: Create prompts for the remaining card sections that are visually cohesive with the existing front cover. Use the same color palette, artistic style, lighting, and visual elements from the front cover to create a unified design.

Requirements:
- Maintain visual continuity with the front cover design
- Use the same artistic style: ${styleModifier}
- Keep consistent color palette, lighting, and mood
- Full-bleed backgrounds extending to edges
- Keep text/faces 0.5" from left/right edges for safe printing
- IMPORTANT: Keep text, faces, and key elements at least 10% away from top/bottom edges

Generate prompts for:

1. Back Cover: Create a simple, peaceful design that complements the front cover. Reference subtle elements from the front cover but keep it minimal and serene. NO PEOPLE, just beautiful artistic elements. IMPORTANT: Leave the bottom-right corner area (approximately 1 inch square) completely clear and undecorated for QR code placement.

${!isFrontBackOnly ? `2. Left Interior: Creative decorative art that harmonizes with the front cover style. NO PEOPLE or characters, focus on artistic elements like patterns, landscapes, objects, or abstract art that matches the front cover's mood and style.

3. Right Interior: ${isHandwrittenMessage ? `Design elegant writing space with decorative elements that complement the front cover style. Position decorative elements safely away from edges. NO PEOPLE or characters.` : `Include message text: "${messageContent}" in beautiful handwritten cursive script, integrated into decorative artwork that matches the front cover style. NO PEOPLE or characters.`}` : ''}

Return JSON:
{
  "frontCover": "${storedFrontCoverPrompt}",
  "backCover": "detailed back cover prompt"${!isFrontBackOnly ? ',\n  "leftInterior": "detailed left interior prompt",\n  "rightInterior": "detailed right interior prompt"' : ''}
}`;

      const finalPrompts = await chatWithAI(generateOtherPromptsQuery, {
        jsonSchema: {
          type: "object",
          properties: {
            frontCover: { type: "string" },
            backCover: { type: "string" },
            ...(isFrontBackOnly ? {} : { 
              leftInterior: { type: "string" },
              rightInterior: { type: "string" }
            })
          },
          required: ["frontCover", "backCover", ...(isFrontBackOnly ? [] : ["leftInterior", "rightInterior"])]
        },
        model: "gemini-2.5-pro",
        attachments: referenceImageUrls
      });

      if (!finalPrompts || !finalPrompts.frontCover || !finalPrompts.backCover) {
        throw new Error("Failed to generate complete prompts for final card");
      }
      
      console.log("✅ Generated complete prompts for final card:", {
        hasFrontCover: !!finalPrompts.frontCover,
        hasBackCover: !!finalPrompts.backCover,
        hasLeftInterior: !!finalPrompts.leftInterior,
        hasRightInterior: !!finalPrompts.rightInterior
      });
      
      // Prepare input images for final generation (reference photos)
      const inputImages: string[] = [];
      if (referenceImageUrls.length > 0 && selectedImageModel === "gpt-image-1") {
        inputImages.push(...referenceImageUrls);
        console.log("🔍 DEBUG: Added reference images to final draft generation:", referenceImageUrls);
        console.log("🔍 DEBUG: Total input images for final draft generation:", inputImages.length);
        toast.success(`📸 ${referenceImageUrls.length} reference photo${referenceImageUrls.length > 1 ? 's' : ''} applied to final generation!`);
      }

      const response = await fetch('/api/generate-card-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          prompts: finalPrompts,
          config: {
            userNumber: "+17145986105",
            modelVersion: selectedImageModel,
            aspectRatio: paperSizes.find(size => size.id === selectedPaperSize)?.aspectRatio || "9:16",
            quality: "high", // HIGH QUALITY for final card
            outputFormat: "jpeg",
            outputCompression: 100,
            moderation: "low",
            dimensions: paperSizes.find(size => size.id === selectedPaperSize)?.dimensions || "1024x1536",
            isFrontBackOnly,
            userEmail,
            cardType: selectedType === "custom" ? customCardType : selectedType,
            toField,
            fromField,
            isDraftMode: false,
            ...(inputImages.length > 0 && { 
              input_images: inputImages,
              input_images_mode: "front_cover_only" // All reference images should go to front cover for character creation
            })
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.status !== 'processing') {
        throw new Error(result.message || 'Failed to start final card generation');
      }

      setCurrentJobId(jobId);
      toast.success("🎨 Generating high-quality version of your selected design!");
      
      // Poll for completion (reuse existing pollJobStatus)
      pollJobStatus(jobId);

    } catch (error) {
      console.error('Final card generation error:', error);
      toast.error("Failed to generate final card. Please try again.");
      setIsGeneratingFinalCard(false);
      setGenerationProgress("");
      stopElapsedTimeTracking();
    }
  };

  // Recovery function - check for pending jobs on page load
  const checkPendingJobs = async () => {
    try {
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      
      for (const jobId of pendingJobs) {
        const jobData = localStorage.getItem(`cardJob_${jobId}`);
        if (!jobData) continue;
        
        const job = JSON.parse(jobData);
        const statusResponse = await checkJobStatus(jobId);
        
        if (statusResponse && statusResponse.status === 'completed') {
          console.log('🎉 Job completed while user was away! Card data:', statusResponse.cardData);
          
          // Handle completed job based on type
          if (jobId.startsWith('draft-')) {
            // Draft job completion
            const draftIndex = parseInt(jobId.split('-')[1]);
            if (statusResponse.cardData && draftIndex >= 0) {
              const draftCard: GeneratedCard = {
                id: `draft-${draftIndex + 1}-${Date.now()}`,
                prompt: statusResponse.cardData.prompt || `Draft Variation ${draftIndex + 1}`,
                frontCover: statusResponse.cardData.frontCover || "",
                backCover: "",
                leftPage: "",
                rightPage: "",
                createdAt: new Date(),
                generatedPrompts: {
                  frontCover: statusResponse.cardData.generatedPrompts?.frontCover || ""
                }
              };
              
              setDraftCards(prev => [...prev, draftCard]);
              setDraftIndexMapping(prev => [...prev, draftIndex]);
              toast.success(`🎨 Draft variation ${draftIndex + 1} completed while you were away!`);
            }
          } else {
            // Regular card completion
            if (statusResponse.cardData) {
              let cardWithQR = { ...statusResponse.cardData };
              
              if (!cardWithQR.createdAt) {
                cardWithQR.createdAt = new Date();
              } else if (typeof cardWithQR.createdAt === 'string' || typeof cardWithQR.createdAt === 'number') {
                cardWithQR.createdAt = new Date(cardWithQR.createdAt);
              }
              
              if (!cardWithQR.id) {
                cardWithQR.id = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              }
              
              setGeneratedCard(cardWithQR);
              setGeneratedCards([cardWithQR]);
              setSelectedCardIndex(0);
              setIsCardCompleted(true);
              setIsGenerating(false);
              setGenerationProgress("");
              
              if (statusResponse.cardData.generationTimeSeconds) {
                setGenerationDuration(statusResponse.cardData.generationTimeSeconds);
              }
              
              stopElapsedTimeTracking();
              setProgressPercentage(100);
              
              toast.success("🎉 Your card finished generating while you were away!");
              
              // Send thank you email using job data
              if (job.userEmail && job.userEmail.trim()) {
                const cardTypeForEmail = job.selectedType === "custom" ? job.customCardType : job.selectedType;
                sendThankYouEmail(job.userEmail, cardTypeForEmail, cardWithQR.shareUrl || 'https://vibecarding.com');
              }
            }
          }
          
          removeJobFromStorage(jobId);
        } else if (statusResponse && statusResponse.status === 'failed') {
          // Job failed
          toast.error("❌ A card generation job failed. Please try again.");
          removeJobFromStorage(jobId);
        } else if (statusResponse && statusResponse.status === 'processing') {
          // Still processing - restore loading states and start polling
          setIsGenerating(true);
          setCurrentJobId(jobId);
          setGenerationProgress("Resuming card generation...");
          
          // Start elapsed time tracking from when job was originally created
          const jobStartTime = job.createdAt ? new Date(job.createdAt).getTime() : Date.now();
          startElapsedTimeTracking(jobStartTime);
          
          toast.info("🔄 Resuming card generation where you left off...");
          pollJobStatus(jobId);
        }
      }
    } catch (error) {
      console.error('Failed to check pending jobs:', error);
    }
  };

  // Return all the state and functions that the UI needs
  return {
    // Core state
    prompt,
    setPrompt,
    finalCardMessage,
    setFinalCardMessage,
    toField,
    setToField,
    fromField,
    setFromField,
    selectedType,
    setSelectedType,
    customCardType,
    setCustomCardType,
    selectedTone,
    setSelectedTone,
    isGenerating,
    setIsGenerating,
    isGeneratingMessage,
    setIsGeneratingMessage,
    generatedCard,
    setGeneratedCard,
    numberOfCards,
    setNumberOfCards,
    generatedCards,
    setGeneratedCards,
    selectedCardIndex,
    setSelectedCardIndex,
    
    // Advanced options
    showAdvanced,
    setShowAdvanced,
    selectedArtisticStyle,
    setSelectedArtisticStyle,
    customStyleDescription,
    setCustomStyleDescription,
    selectedImageModel,
    setSelectedImageModel,
    selectedDraftModel,
    setSelectedDraftModel,
    
    // Draft mode
    isDraftMode,
    setIsDraftMode,
    draftCards,
    setDraftCards,
    draftIndexMapping,
    setDraftIndexMapping,
    selectedDraftIndex,
    setSelectedDraftIndex,
    isGeneratingFinalCard,
    setIsGeneratingFinalCard,
    previewingDraftIndex,
    setPreviewingDraftIndex,
    draftCompletionShown,
    setDraftCompletionShown,
    draftCompletionCount,
    setDraftCompletionCount,
    
    // Progress tracking
    generationProgress,
    setGenerationProgress,
    progressPercentage,
    setProgressPercentage,
    isCardCompleted,
    setIsCardCompleted,
    
    // Upload and personalization
    referenceImages,
    setReferenceImages,
    referenceImageUrls,
    setReferenceImageUrls,
    imageTransformation,
    setImageTransformation,
    isUploading,
    setIsUploading,
    
    // Email and settings
    userEmail,
    setUserEmail,
    isHandwrittenMessage,
    setIsHandwrittenMessage,
    isFrontBackOnly,
    setIsFrontBackOnly,
    selectedPaperSize,
    setSelectedPaperSize,
    
    // UI state
    isTextareaExpanded,
    setIsTextareaExpanded,
    isMessageExpanded,
    setIsMessageExpanded,
    showSettings,
    setShowSettings,
    showTemplateGallery,
    setShowTemplateGallery,
    showPrintConfirmation,
    setShowPrintConfirmation,
    
    // Generation time
    generationDuration,
    setGenerationDuration,
    currentElapsedTime,
    setCurrentElapsedTime,
    
    // Helper functions
    formatGenerationTime,
    formatCountdown,
    sendThankYouEmail,
    chatWithAI,
    scrollToCardPreview,
    
    // Time tracking functions
    startElapsedTimeTracking,
    stopElapsedTimeTracking,
    
    // File handling functions
    handleFileUpload,
    handleRemoveReferenceImage,
    
    // Message functions
    handleGetMessageHelp,
    addMessageToHistory,
    undoMessage,
    redoMessage,
    
    // Job management
    saveJobToStorage,
    removeJobFromStorage,
    checkJobStatus,
    pollJobStatus,
    checkPendingJobs,
    
    // Main generation functions
    handleGenerateCardAsync,
    handleGenerateDraftCards,
    handleGenerateFinalFromDraft,
    
    // Additional state for message refinement
    messageHistory,
    setMessageHistory,
    currentMessageIndex,
    setCurrentMessageIndex,
    refinementPrompt,
    setRefinementPrompt,
    isRefiningMessage,
    setIsRefiningMessage,
    showRefinementBox,
    setShowRefinementBox,
    
    // Template state
    showTemplateCustomization,
    setShowTemplateCustomization,
    selectedTemplate,
    setSelectedTemplate,
    templateCustomizations,
    setTemplateCustomizations,
    templateSearchQuery,
    setTemplateSearchQuery,
    isSearchingTemplates,
    setIsSearchingTemplates,
    aiFilteredCards,
    setAiFilteredCards,
    searchMode,
    setSearchMode,
    textFilteredCards,
    setTextFilteredCards,
    showPrompts,
    setShowPrompts,
    
    // Print state
    printOption,
    setPrintOption,
    
    // Additional draft mode state - removed duplicates
    
    // Additional upload state
    handwritingSample,
    setHandwritingSample,
    handwritingSampleUrl,
    setHandwritingSampleUrl,
    
    // Job tracking
    currentJobId,
    setCurrentJobId,
    countdown,
    setCountdown,
    countdownInterval,
    setCountdownInterval,
    
    // Section loading states
    sectionLoadingStates,
    setSectionLoadingStates,
    
    // Fast preview mode
    fastPreviewMode,
    setFastPreviewMode,
    
    // Additional tracking
    currentCardId,
    setCurrentCardId,
    isInitialLoadComplete,
    setIsInitialLoadComplete,
    
    // Elapsed time tracking
    generationStartTime,
    setGenerationStartTime,
    elapsedTimeInterval,
    setElapsedTimeInterval,
    
    // Constants for UI
    artisticStyles,
    paperSizes,
  };
} 