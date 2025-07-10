"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import * as QRCode from 'qrcode';
import io, { Socket } from 'socket.io-client';
import { PromptGenerator, CardConfig, DraftConfig, MessageConfig, FinalFromDraftConfig } from '@/lib/promptGenerator';

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
  console.log('📧 sendThankYouEmail called with:', { toEmail, cardType, cardUrl });
  if (!toEmail.trim()) {
    console.log('📧 sendThankYouEmail - toEmail is empty, returning');
    return;
  }
  
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
    console.log('📧 Attempting to send email to user:', toEmail);
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
    
    console.log('📧 User email response status:', userResponse.status);
    if (userResponse.ok) {
      const userResponseData = await userResponse.json();
      console.log('📧 User email response data:', userResponseData);
    }

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
  // WebSocket connection management
  const socketRef = useRef<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const currentJobRef = useRef<string | null>(null);
  const lastJobUpdateRef = useRef<number>(Date.now());

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
    if (typeof window === 'undefined') return;
    
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

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('✅ WebSocket already connected');
      return;
    }

    try {
      console.log('🔌 Connecting to WebSocket...');
      const socket = io(BACKEND_API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      socket.on('connect', () => {
        console.log('✅ WebSocket connected:', socket.id);
        setIsSocketConnected(true);
        toast.success('🔗 Real-time updates connected');
        
        // Resubscribe to current job if any
        if (currentJobRef.current) {
          console.log('🔄 Resubscribing to job:', currentJobRef.current);
          socket.emit('subscribe_job', { job_id: currentJobRef.current });
        }
      });

      socket.on('disconnect', (reason: string) => {
        console.log('❌ WebSocket disconnected:', reason);
        setIsSocketConnected(false);
        
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          socket.connect();
        }
      });

      socket.on('connect_error', (error: Error) => {
        console.error('❌ WebSocket connection error:', error);
        setIsSocketConnected(false);
      });

      socket.on('job_update', (data: any) => {
        console.log('📦 Job update received:', data);
        handleJobUpdate(data);
      });

      socketRef.current = socket;
    } catch (error) {
      console.error('❌ Failed to connect WebSocket:', error);
      toast.error('Failed to connect real-time updates. Using fallback mode.');
    }
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 Disconnecting WebSocket...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsSocketConnected(false);
    }
  }, []);

  const subscribeToJob = useCallback((jobId: string) => {
    currentJobRef.current = jobId;
    if (socketRef.current?.connected) {
      console.log('📡 Subscribing to job updates:', jobId);
      socketRef.current.emit('subscribe_job', { job_id: jobId });
    } else {
      console.log('⏳ WebSocket not connected, will subscribe when connected');
    }
  }, []);

  const unsubscribeFromJob = useCallback((jobId: string) => {
    if (currentJobRef.current === jobId) {
      currentJobRef.current = null;
    }
    
    if (socketRef.current?.connected) {
      console.log('📡 Unsubscribing from job updates:', jobId);
      socketRef.current.emit('unsubscribe_job', { job_id: jobId });
    }
  }, []);

  // Handle job updates from WebSocket
  const handleJobUpdate = useCallback((data: any) => {
    const { job_id, status, progress, cardData, error, completedAt } = data;
    
    if (!job_id) return;
    
    // Check if this is a draft job
    const isDraftJob = job_id.startsWith('draft-');
    const draftIndex = isDraftJob ? parseInt(job_id.split('-')[1]) : -1;
    
    console.log('🔄 Processing job update:', { job_id, status, isDraftJob, draftIndex, progress });
    
    // Store last update time for the job
    if (job_id === currentJobRef.current) {
      lastJobUpdateRef.current = Date.now();
    }
    
    // Update progress if provided
    if (progress) {
      setGenerationProgress(progress);
      
      // Extract percentage from progress string if possible
      const percentMatch = progress.match(/(\d+)%/);
      if (percentMatch) {
        const percent = parseInt(percentMatch[1]);
        setProgressPercentage(percent);
        console.log(`📊 Progress update: ${percent}% - ${progress}`);
      }
    }
    
    if (status === 'completed' && cardData) {
      console.log('🎉 Job completed! Card data:', cardData, 'isDraftJob:', isDraftJob);
      
      if (isDraftJob && draftIndex >= 0) {
        // Handle draft card completion
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
          prompt: cardData.prompt || `Draft Variation ${draftIndex + 1}`,
          frontCover: cardData.frontCover || "",
          backCover: "",
          leftPage: "",
          rightPage: "",
          createdAt: new Date(),
          generatedPrompts: {
            frontCover: cardData.generatedPrompts?.frontCover || ""
          },
          styleInfo: styleInfo
        };
        
        // Update draft cards state
        setDraftCards(prev => {
          const updated = [...prev];
          updated.push(draftCard);
          return updated;
        });
        
        setDraftIndexMapping(prev => {
          const updatedMapping = [...prev];
          updatedMapping.push(draftIndex);
          return updatedMapping;
        });
        
        // Update completion count
        setDraftCompletionCount(prevCount => {
          const newCompletedCount = prevCount + 1;
          console.log(`📊 Draft progress: ${newCompletedCount}/5 front cover variations complete`);
          
          if (newCompletedCount === 1) {
            scrollToCardPreview();
          }
          
          if (newCompletedCount === 5) {
            // Only reset generation state if we're not generating the final card
            if (!isGeneratingFinalCard) {
              setIsGenerating(false);
              setGenerationProgress("");
              setProgressPercentage(100);
              stopElapsedTimeTracking();
            }
            
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
        
        removeJobFromStorage(job_id);
      } else {
        // Handle final card completion
        handleFinalCardCompletion(cardData);
        removeJobFromStorage(job_id);
        setCurrentJobId(null);
        unsubscribeFromJob(job_id);
      }
    } else if (status === 'failed') {
      console.error('❌ Job failed:', error);
      
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
        unsubscribeFromJob(job_id);
      }
      
      removeJobFromStorage(job_id);
    } else if (status === 'not_found') {
      console.warn('⚠️ Job not found on server, cleaning up stale reference:', job_id);
      
      // Clean up stale job reference without showing error to user
      // (job might have expired or been cleaned up normally)
      if (currentJobRef.current === job_id) {
        currentJobRef.current = null;
      }
      
      // Reset UI state if this was the current job
      if (currentJobId === job_id) {
        setCurrentJobId(null);
        setIsGenerating(false);
        setIsGeneratingFinalCard(false);
        setGenerationProgress("");
        setProgressPercentage(0);
        stopElapsedTimeTracking();
      }
      
      // Clean up storage
      removeJobFromStorage(job_id);
      unsubscribeFromJob(job_id);
    }
  }, [selectedArtisticStyle, isGeneratingFinalCard]);

  // Helper function to handle final card completion
  const handleFinalCardCompletion = useCallback(async (cardData: any) => {
    console.log('🎯 handleFinalCardCompletion called with cardData:', cardData);
    console.log('🎯 Current userEmail state:', userEmail);
    let cardWithQR = { ...cardData };
    
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
    
    // Note: QR code overlay is now handled automatically by the backend during card generation
    // The backend will store the card and add QR codes to the back cover for final cards
    console.log('✅ Card completion processing finished - QR codes handled by backend');
    
    console.log('🎯 Setting final card state:', cardWithQR);
    
    // Set the card states
    setGeneratedCard(cardWithQR);
    setGeneratedCards([cardWithQR]);
    setSelectedCardIndex(0);
    setIsCardCompleted(true);
    setIsGenerating(false);
    setIsGeneratingFinalCard(false);
    setIsDraftMode(false);
    setDraftCompletionShown(false);
    setDraftCompletionCount(0);
    setGenerationProgress("");
    
    // Scroll to card preview
    scrollToCardPreview();
    
    // Capture generation time from backend
    if (cardData.generationTimeSeconds) {
      setGenerationDuration(cardData.generationTimeSeconds);
    }
    
    // Stop elapsed time tracking
    stopElapsedTimeTracking();
    
    // Set progress to 100%
    setProgressPercentage(100);
    setGenerationProgress("Card generation complete!");
    
    toast.success("🎉 Your card is ready!");
    
    // Show email confirmation toast if email is provided
    if (userEmail.trim()) {
      toast.success(`✉️ Card sent to ${userEmail}`, {
        duration: 5000,
      });
    }
    
    // Email notifications are now handled by the backend on job completion
    // Keeping this disabled to avoid duplicate emails
    console.log('📧 Email sending disabled - backend handles email notifications');
    // if (userEmail.trim()) {
    //   const cardTypeForEmail = selectedType === "custom" ? customCardType : selectedType;
    //   console.log('📧 Sending thank you email to:', userEmail, 'cardType:', cardTypeForEmail, 'shareUrl:', cardWithQR.shareUrl);
    //   sendThankYouEmail(userEmail, cardTypeForEmail, cardWithQR.shareUrl || 'https://vibecarding.com');
    // } else {
    //   console.log('📧 No email sent - userEmail is empty or whitespace');
    // }
    
    console.log('✅ Final card completion process finished successfully');
  }, [userEmail, selectedType, customCardType]);

  // WebSocket connection lifecycle management
  useEffect(() => {
    // Connect WebSocket when component mounts
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);

  // Auto-reconnect WebSocket if disconnected during active generation
  useEffect(() => {
    if (!isSocketConnected && (isGenerating || isGeneratingFinalCard) && currentJobRef.current) {
      console.log('🔄 WebSocket disconnected during generation, attempting reconnect...');
      const reconnectTimer = setTimeout(() => {
        connectWebSocket();
        
        // Re-subscribe to current job after reconnection
        const jobId = currentJobRef.current;
        if (jobId) {
          setTimeout(() => {
            console.log('📡 Re-subscribing to job after reconnect:', jobId);
            subscribeToJob(jobId);
          }, 1000); // Give socket time to connect
        }
      }, 2000);
      
      return () => clearTimeout(reconnectTimer);
    }
  }, [isSocketConnected, isGenerating, isGeneratingFinalCard, connectWebSocket, subscribeToJob]);

  // Monitor for stale job updates (no update for 30 seconds)
  useEffect(() => {
    if ((isGenerating || isGeneratingFinalCard) && currentJobRef.current) {
      const checkInterval = setInterval(async () => {
        const timeSinceLastUpdate = Date.now() - lastJobUpdateRef.current;
        if (timeSinceLastUpdate > 30000) { // 30 seconds without update
          console.warn('⚠️ No job updates for 30 seconds, checking connection...');
          
          // If WebSocket is disconnected, try to reconnect
          if (!isSocketConnected) {
            console.log('🔄 WebSocket disconnected, reconnecting...');
            connectWebSocket();
          } else {
            // WebSocket is connected but no updates - might need to re-subscribe
            const jobId = currentJobRef.current;
            if (jobId) {
              console.log('📡 Re-subscribing to job due to stale updates:', jobId);
              subscribeToJob(jobId);
              
              // If stuck at 95% for too long, try to check job status directly
              if (progressPercentage >= 95) {
                console.log('🔍 Checking job status directly due to progress stuck at 95%');
                try {
                  const response = await fetch(`/api/job-status/${jobId}`);
                  if (response.ok) {
                    const jobStatus = await response.json();
                    if (jobStatus.status === 'completed' && jobStatus.data) {
                      console.log('✅ Job is actually completed! Processing result...');
                      handleJobUpdate({
                        job_id: jobId,
                        status: 'completed',
                        progress: 'Card generation complete!',
                        cardData: jobStatus.data
                      });
                    }
                  }
                } catch (error) {
                  console.error('Failed to check job status:', error);
                }
              }
            }
          }
          
          // Reset the timer
          lastJobUpdateRef.current = Date.now();
        }
      }, 10000); // Check every 10 seconds
      
      return () => clearInterval(checkInterval);
    }
  }, [isGenerating, isGeneratingFinalCard, isSocketConnected, connectWebSocket, subscribeToJob, progressPercentage, handleJobUpdate]);

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
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('generation-start-time', start.toString());
    }
    
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('generation-start-time');
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
      
      // Use PromptGenerator for message generation
      const messageConfig: MessageConfig = {
        cardType: selectedType,
        customCardType: customCardType,
        tone: selectedTone,
        toneLabel: selectedToneObj ? selectedToneObj.label : "Heartfelt",
        toneDescription: toneDescription,
        theme: effectivePrompt,
        toField: toField,
        fromField: fromField
      };

      const messagePrompt = PromptGenerator.generateMessagePrompt(messageConfig);

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
        
        // Return the generated message so the caller can use it
        return extractedMessage;
      }
    } catch (error) {
      toast.error("Failed to generate message. Please try again.");
      return null;
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
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
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

      // Use PromptGenerator for card prompts
      const cardConfig: CardConfig = {
        cardType: selectedType,
        customCardType: customCardType,
        tone: selectedTone,
        toneDescription: selectedToneObj?.description.toLowerCase() || "heartfelt and sincere",
        theme: prompt || `A beautiful ${cardTypeForPrompt} card`,
        toField: toField,
        fromField: fromField,
        message: messageContent,
        isHandwrittenMessage: isHandwrittenMessage,
        artisticStyle: selectedStyle,
        referenceImageUrls: referenceImageUrls,
        isFrontBackOnly: isFrontBackOnly,
        selectedImageModel: selectedImageModel
      };

      const generatedPrompts = PromptGenerator.generateCardPrompts(cardConfig);

      // Apply reference photo enhancements for GPT-1
      if (referenceImageUrls.length > 0 && selectedImageModel === "gpt-1") {
        generatedPrompts.frontCover = PromptGenerator.enhancePromptWithReferencePhotos(
          generatedPrompts.frontCover, 
          true, 
          selectedImageModel
        );
      }

      // For compatibility with the chatWithAI response format, we'll need to format the prompts
      const formattedPrompts = {
        frontCover: generatedPrompts.frontCover,
        backCover: generatedPrompts.backCover,
        ...(isFrontBackOnly ? {} : {
          leftInterior: generatedPrompts.leftInterior,
          rightInterior: generatedPrompts.rightInterior
        })
      };

      if (!formattedPrompts || !formattedPrompts.frontCover) {
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
        prompts: formattedPrompts,
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
          prompts: formattedPrompts,
          config: {
            userNumber: "+17145986105",
            modelVersion: selectedImageModel,
            aspectRatio: paperConfig.aspectRatio,
            quality: "medium",
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
      
      // Subscribe to WebSocket updates for real-time progress
      subscribeToJob(jobId);

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

          // Use PromptGenerator for draft prompts
          const draftConfig: DraftConfig = {
            cardType: selectedType,
            customCardType: customCardType,
            tone: selectedTone,
            toneLabel: selectedToneObj ? selectedToneObj.label : "Heartfelt",
            toneDescription: toneDescription,
            theme: effectivePrompt,
            toField: toField,
            fromField: fromField,
            artisticStyle: selectedStyle,
            referenceImageUrls: referenceImageUrls,
            isDraftVariation: selectedArtisticStyle === "smart",
            variationIndex: index
          };

          const frontCoverPromptQuery = PromptGenerator.generateDraftPrompt(draftConfig);

          const frontCoverPrompt = await chatWithAI(frontCoverPromptQuery, {
            model: "gemini-2.5-pro",
            attachments: referenceImageUrls
          });

          if (!frontCoverPrompt?.trim()) {
            throw new Error("Failed to generate front cover prompt");
          }

          // Enhance with reference image instructions if available
          let enhancedFrontCoverPrompt = frontCoverPrompt.trim();
          enhancedFrontCoverPrompt = PromptGenerator.enhancePromptWithReferencePhotos(
            enhancedFrontCoverPrompt,
            referenceImageUrls.length > 0,
            selectedDraftModel
          );

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

          // Subscribe to WebSocket updates for draft job
          console.log(`🔄 Subscribing to WebSocket updates for draft job ${jobId}`);
          subscribeToJob(jobId);

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



  // Remove job from storage
  const removeJobFromStorage = (jobId: string) => {
    if (typeof window === 'undefined') return;
    
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
    // Prevent duplicate calls if already generating final card
    if (isGeneratingFinalCard) {
      console.log('⚠️ Final card generation already in progress, skipping duplicate call');
      return;
    }
    
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
      let selectedStyle;
      let styleModifier = "";
      if (draftStyleInfo && draftStyleInfo.styleName) {
        selectedStyle = artisticStyles.find(style => style.id === draftStyleInfo.styleName);
        styleModifier = selectedStyle?.promptModifier || "";
      } else {
        selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
        styleModifier = selectedArtisticStyle === "custom" 
          ? customStyleDescription 
          : selectedStyle?.promptModifier || "";
      }
      
      // Use PromptGenerator for final card from draft
      const finalFromDraftConfig: FinalFromDraftConfig = {
        frontCoverPrompt: storedFrontCoverPrompt,
        cardType: selectedType,
        customCardType: customCardType,
        theme: effectivePrompt,
        tone: selectedTone,
        toneDescription: toneDescription,
        toField: toField,
        fromField: fromField,
        message: messageContent,
        isHandwrittenMessage: isHandwrittenMessage,
        artisticStyle: selectedStyle,
        isFrontBackOnly: isFrontBackOnly
      };

      const finalPrompts = PromptGenerator.generateFinalFromDraftPrompts(finalFromDraftConfig);

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
            quality: "medium", // HIGH QUALITY for final card
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
      
      // Subscribe to WebSocket updates for real-time progress
      subscribeToJob(jobId);

    } catch (error) {
      console.error('Final card generation error:', error);
      toast.error("Failed to generate final card. Please try again.");
      setIsGeneratingFinalCard(false);
      setGenerationProgress("");
      stopElapsedTimeTracking();
    }
  };

  // Recovery function - resume WebSocket subscriptions for pending jobs
  const checkPendingJobs = async () => {
    if (typeof window === 'undefined') return;
    
    try {
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      
      for (const jobId of pendingJobs) {
        const jobData = localStorage.getItem(`cardJob_${jobId}`);
        if (!jobData) continue;
        
        const job = JSON.parse(jobData);
        
        // Since we rely on WebSocket only, just restore the loading state and resubscribe
        setIsGenerating(true);
        setCurrentJobId(jobId);
        setGenerationProgress("Resuming card generation...");
        
        // Start elapsed time tracking from when job was originally created
        const jobStartTime = job.createdAt ? new Date(job.createdAt).getTime() : Date.now();
        startElapsedTimeTracking(jobStartTime);
        
        toast.info("🔄 Resuming card generation where you left off...");
        
        // Subscribe to WebSocket for resumed job
        subscribeToJob(jobId);
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
    cardTones,
    artisticStyles,
    paperSizes,
    
    // WebSocket functions and state
    isSocketConnected,
    connectWebSocket,
    disconnectWebSocket,
    subscribeToJob,
    unsubscribeFromJob,
    handleJobUpdate,
    handleFinalCardCompletion,
  };
} 