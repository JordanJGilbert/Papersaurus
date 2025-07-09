"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Sparkles, Printer, Heart, Gift, GraduationCap, Calendar, Wand2, MessageSquarePlus, ChevronDown, Settings, Zap, Palette, Edit3, Upload, X, Cake, ThumbsUp, PartyPopper, Trophy, TreePine, Stethoscope, CloudRain, Baby, Church, Home, MessageCircle, Eye, Wrench, Clock, Undo2, Redo2, RefreshCw, Settings2, AlertTriangle, CheckCircle, Circle, Image as ImageIcon, MessageSquare } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import CardPreview from "@/components/CardPreview";
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { ModeToggle } from "@/components/mode-toggle";
import RecentCardsPreview from "@/components/RecentCardsPreview";
import FastHorizontalGallery from "@/components/FastHorizontalGallery";
import CriticalResourcePreloader from "@/components/CriticalResourcePreloader";
import EarlyCardPreloader from "@/components/EarlyCardPreloader";
import { useCardCache } from "@/hooks/useCardCache";

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

// Common card types with custom option
const cardTypes = [
  { id: "custom", label: "Custom", description: "Create your own unique card type", icon: Wrench },
  { id: "birthday", label: "Birthday", description: "Celebrate another year of life", icon: Cake },
  { id: "thank-you", label: "Thank You", description: "Express gratitude and appreciation", icon: ThumbsUp },
  { id: "anniversary", label: "Anniversary", description: "Commemorate special milestones", icon: Heart },
  { id: "congratulations", label: "Congratulations", description: "Celebrate achievements and success", icon: Trophy },
  { id: "holiday", label: "Holiday", description: "Seasonal and holiday greetings", icon: TreePine },
  { id: "get-well", label: "Get Well Soon", description: "Send healing wishes and support", icon: Stethoscope },
  { id: "sympathy", label: "Sympathy", description: "Offer comfort during difficult times", icon: CloudRain },
  { id: "love", label: "Love & Romance", description: "Express romantic feelings", icon: Heart },
  { id: "graduation", label: "Graduation", description: "Celebrate educational achievements", icon: GraduationCap },
  { id: "new-baby", label: "New Baby", description: "Welcome new arrivals", icon: Baby },
  { id: "wedding", label: "Wedding", description: "Celebrate unions and marriages", icon: Church },
  { id: "retirement", label: "Retirement", description: "Honor career achievements", icon: Gift },
  { id: "housewarming", label: "Housewarming", description: "Welcome to new homes", icon: Home },
  { id: "apology", label: "Apology", description: "Make amends and seek forgiveness", icon: MessageCircle },
  { id: "thinking-of-you", label: "Thinking of You", description: "Show you care and remember", icon: Eye },
];

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
    promptModifier: "" // Will be dynamically generated
  },
  {
    id: "custom", 
    label: "✨ Custom Style", 
    description: "Define your own unique artistic style",
    promptModifier: "" // Will be replaced with user input
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

// Image model options
const imageModels = [
  { 
    id: "gpt-image-1", 
    label: "GPT Image 1", 
    description: "Highest quality variant : Recommended",
  },
  { 
    id: "flux-1.1-pro", 
    label: "FLUX 1.1 Pro", 
    description: "Fastest & highest quality : $0.04 per image, 3-10 seconds",
  },
  { 
    id: "seedream-3", 
    label: "SeeDream 3", 
    description: "2K photorealistic quality : $0.03 per image, 5-15 seconds",
  },
  { 
    id: "ideogram-v3-turbo", 
    label: "Ideogram V3 Turbo", 
    description: "Excellent text rendering : Magic prompt enhancement, fast generation",
  },
  { 
    id: "ideogram-v3-quality", 
    label: "Ideogram V3 Quality", 
    description: "Highest quality text rendering : Slower but better results",
  },
  { 
    id: "imagen-4.0-ultra-generate-preview-06-06", 
    label: "Imagen 4.0 Ultra", 
    description: "Experimental, not recommended for text-heavy cards.",
  },
];



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

export default function CardStudioPage() {
  // Core state
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
  
  // Draft mode state - generate 10 low-quality cards for selection
  const [isDraftMode, setIsDraftMode] = useState<boolean>(false);
  const [draftCards, setDraftCards] = useState<GeneratedCard[]>([]); // Cards in completion order (left to right)
  const [draftIndexMapping, setDraftIndexMapping] = useState<number[]>([]); // Maps display position to original draft index
  const [selectedDraftIndex, setSelectedDraftIndex] = useState<number>(-1); // Display position index
  const [isGeneratingFinalCard, setIsGeneratingFinalCard] = useState<boolean>(false);
  const [previewingDraftIndex, setPreviewingDraftIndex] = useState<number>(-1); // Display position index
  const [draftCompletionShown, setDraftCompletionShown] = useState<boolean>(false);

  // Helper function to format countdown as MM:SS
  const formatCountdown = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Job management functions
  const saveJobToStorage = (jobId: string, jobData: any) => {
    try {
      localStorage.setItem(`cardJob_${jobId}`, JSON.stringify({
        ...jobData,
        id: jobId,
        status: 'processing',
        createdAt: Date.now()
      }));
      
      // Also add to pending jobs list
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      if (!pendingJobs.includes(jobId)) {
        pendingJobs.push(jobId);
        localStorage.setItem('pendingCardJobs', JSON.stringify(pendingJobs));
      }
    } catch (error) {
      console.error('Failed to save job to localStorage:', error);
    }
  };

  const removeJobFromStorage = (jobId: string) => {
    try {
      localStorage.removeItem(`cardJob_${jobId}`);
      
      // Remove from pending jobs list
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      const updatedJobs = pendingJobs.filter((id: string) => id !== jobId);
      localStorage.setItem('pendingCardJobs', JSON.stringify(updatedJobs));
    } catch (error) {
      console.error('Failed to remove job from localStorage:', error);
    }
  };

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
          
          // Job completed while user was away!
          if (statusResponse.cardData) {
            // Apply QR code to back cover before setting the card data
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
            
            console.log('🔄 Card data prepared for recovery:', cardWithQR);
            
            try {
              console.log('🔄 Starting QR overlay process for recovered card');
              
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
                     console.log('Using actual share URL for QR code (recovered):', actualShareUrl);
                     
                     // Apply QR code to back cover using the API-returned URL
                     if (cardWithQR.backCover && actualShareUrl) {
                       console.log('🔄 Applying QR overlay to recovered card...');
                       const originalBackCover = cardWithQR.backCover;
                       cardWithQR.backCover = await overlayQRCodeOnImage(originalBackCover, actualShareUrl);
                       cardWithQR.shareUrl = actualShareUrl;
                       console.log('✅ QR overlay complete for recovered card');
                     }
                  } else {
                    console.warn('Failed to store recovered card for sharing, continuing without QR code');
                   }
                } catch (error) {
                  console.error('❌ Failed to store card or overlay QR code (recovered):', error);
                  // Continue without QR code if there's an error
                }
              } else {
                console.warn('No front cover found in recovered card, skipping QR code process');
              }
            } catch (error) {
              console.error('❌ Error in QR code process (recovered):', error);
              // Continue without QR code if there's an error
            }
            
            console.log('🎯 Setting recovered card state:', cardWithQR);
            
            // Set the card states - this is critical!
            setGeneratedCard(cardWithQR);
            setGeneratedCards([cardWithQR]);
            setSelectedCardIndex(0);
            setIsCardCompleted(true);
            setIsGenerating(false);
            setGenerationProgress("");
            
            // Scroll to card preview
            scrollToCardPreview();
            
            // Set all sections as completed
            setSectionLoadingStates({
              frontCover: 'completed',
              backCover: 'completed',
              leftInterior: 'completed',
              rightInterior: 'completed',
            });
            
            // Capture generation time from backend
            if (statusResponse.cardData.generationTimeSeconds) {
              setGenerationDuration(statusResponse.cardData.generationTimeSeconds);
            }
            
            // Stop elapsed time tracking
            stopElapsedTimeTracking();
            
            // Set progress to 100%
            setProgressPercentage(100);
            
                         // Force a state update by updating localStorage (without base64 QR code to avoid quota issues)
             try {
               // Create a lightweight version without base64 QR code for localStorage
               const cardForStorage = { ...cardWithQR };
               if (cardForStorage.backCover && cardForStorage.backCover.startsWith('data:image/png;base64,')) {
                 // Replace the base64 QR code with the original back cover URL to save space
                 cardForStorage.backCover = statusResponse.cardData.backCover;
                 console.log('💾 Replaced base64 QR code with original URL for localStorage storage (recovery)');
               }
               
               const cardsData = {
                 mostRecentCard: cardForStorage,
                 generationDuration: statusResponse.cardData.generationTimeSeconds || null
               };
               localStorage.setItem('vibecarding-generated-cards', JSON.stringify(cardsData));
               console.log('💾 Recovered card saved to localStorage');
             } catch (storageError) {
               console.error('Failed to save recovered card to localStorage:', storageError);
             }
            
            toast.success("🎉 Your card with QR code finished generating while you were away!");
            
            // Send thank you email using job data
            if (job.userEmail && job.userEmail.trim()) {
              const cardTypeForEmail = job.selectedType === "custom" ? job.customCardType : job.selectedType;
              sendThankYouEmail(job.userEmail, cardTypeForEmail, cardWithQR.shareUrl || 'https://vibecarding.com');
            }
            
            console.log('✅ Card recovery process finished successfully');
          } else {
            console.error('❌ No card data in completed recovery response');
            toast.error("❌ Card generation completed but no data received. Please try again.");
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
          
          // Restore section loading states based on job data
          if (job.prompts) {
            const loadingStates = {
              frontCover: 'loading' as const,
              backCover: 'loading' as const,
              leftInterior: job.isFrontBackOnly ? 'idle' as const : 'loading' as const,
              rightInterior: job.isFrontBackOnly ? 'idle' as const : 'loading' as const,
            };
            setSectionLoadingStates(loadingStates);
          }
          
          // Initialize progress - will be updated by timer
          setGenerationProgress("Resuming card generation...");
          setProgressPercentage(0); // Will be calculated by timer based on elapsed time
          
          toast.info("🔄 Resuming card generation where you left off...");
          pollJobStatus(jobId);
        }
        // If still processing, leave it in storage
      }
    } catch (error) {
      console.error('Failed to check pending jobs:', error);
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
                "watercolor", "botanical", "hand-drawn", "dreamy-fantasy", "minimalist",
                "vintage-illustration", "art-deco", "soft-pastel", "modern-geometric", "watercolor"
              ];
              const styleLabels = [
                "🎨 Watercolor", "🌿 Botanical", "✏️ Hand-Drawn", "🌸 Dreamy Fantasy", "✨ Minimalist",
                "📚 Vintage Illustration", "✨ Art Deco", "🌸 Soft Pastel", "🔷 Modern Geometric", "🎨 Watercolor"
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
                frontCover: statusResponse.cardData.generatedPrompts?.frontCover || "" // Only store front cover prompt for draft mode
              },
              styleInfo: styleInfo // Store style information for smart style mode
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
            
            // Update progress and check completion
            const newCompletedCount = draftCards.length + 1; // +1 because state update is async
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
                      cardWithQR.backCover = await overlayQRCodeOnImage(originalBackCover, actualShareUrl);
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
            setDraftCompletionShown(false); // Reset completion flag
            setGenerationProgress("");
            
            // Scroll to card preview
            scrollToCardPreview();
            
            // Set all sections as completed
            setSectionLoadingStates({
              frontCover: 'completed',
              backCover: 'completed',
              leftInterior: 'completed',
              rightInterior: 'completed',
            });
            
            // Capture generation time from backend
            console.log('🔍 Checking for generationTimeSeconds:', statusResponse.cardData.generationTimeSeconds);
            if (statusResponse.cardData.generationTimeSeconds) {
              console.log('⏱️ Setting generation duration:', statusResponse.cardData.generationTimeSeconds, 'seconds');
              setGenerationDuration(statusResponse.cardData.generationTimeSeconds);
            } else {
              console.log('⚠️ No generationTimeSeconds found in card data');
            }
            
            // Stop elapsed time tracking
            stopElapsedTimeTracking();
            
            // Set progress to 100%
            setProgressPercentage(100);
            setGenerationProgress("Card generation complete!");
            
            // Force a state update by updating localStorage (without base64 QR code to avoid quota issues)
            try {
              // Create a lightweight version without base64 QR code for localStorage
              const cardForStorage = { ...cardWithQR };
              if (cardForStorage.backCover && cardForStorage.backCover.startsWith('data:image/png;base64,')) {
                // Replace the base64 QR code with the original back cover URL to save space
                cardForStorage.backCover = statusResponse.cardData.backCover;
                console.log('💾 Replaced base64 QR code with original URL for localStorage storage');
              }
              
              const cardsData = {
                mostRecentCard: cardForStorage,
                generationDuration: statusResponse.cardData.generationTimeSeconds || null
              };
              localStorage.setItem('vibecarding-generated-cards', JSON.stringify(cardsData));
              console.log('💾 Card saved to localStorage');
            } catch (storageError) {
              console.error('Failed to save to localStorage:', storageError);
            }
            
            toast.success("🎉 Your card with QR code is ready!");
            
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
          
          // Set all sections as error
          setSectionLoadingStates({
            frontCover: 'error',
            backCover: 'error',
            leftInterior: 'error',
            rightInterior: 'error',
          });
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

  // Function to overlay QR code on back cover image
  const overlayQRCodeOnImage = async (imageUrl: string, cardUrl: string, logoUrl?: string): Promise<string> => {
    console.log('🔧 Starting QR overlay for:', cardUrl);
    try {
      // Get the most recent saved logo if no specific logo provided
      let qrLogoUrl = logoUrl;
      if (!qrLogoUrl) {
        try {
          const logoResponse = await fetch('/api/logos');
          if (logoResponse.ok) {
            const logoData = await logoResponse.json();
            if (logoData.status === 'success' && logoData.logos.length > 0) {
              // Use the most recent logo
              qrLogoUrl = logoData.logos[0].url;
              console.log('🎨 Using saved logo for QR code:', qrLogoUrl);
            }
          }
        } catch (logoError) {
          console.log('No saved logos available, generating QR without logo');
        }
      }
      
      // Generate QR code as data URL with optional logo
      console.log('📱 Generating QR code...');
      let qrCodeDataUrl;
      
      if (qrLogoUrl) {
        try {
          // Generate QR with logo using the server endpoint
          const qrResponse = await fetch('/api/generate-qr-with-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: cardUrl,
              logo_url: qrLogoUrl,
              size: 160,
              seamless: true
            })
          });
          
          if (qrResponse.ok) {
            const qrData = await qrResponse.json();
            if (qrData.status === 'success') {
              qrCodeDataUrl = qrData.qr_code;
              console.log('✅ QR code with logo generated successfully');
            }
          }
        } catch (logoQrError) {
          console.log('Failed to generate QR with logo, falling back to simple QR:', logoQrError);
        }
      }
      
      // Fallback to simple QR code if logo generation failed
      if (!qrCodeDataUrl) {
        qrCodeDataUrl = await QRCode.toDataURL(cardUrl, {
          width: 160, // Size in pixels (roughly 1.3 inches at 120 DPI)
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          errorCorrectionLevel: 'M'
        });
        console.log('✅ Simple QR code generated successfully');
      }

      // Create canvas to composite the images
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      // Load the back cover image
      const backCoverImg = new Image();
      // Try without crossOrigin first to avoid CORS issues
      // backCoverImg.crossOrigin = 'anonymous';
      
      return new Promise((resolve, reject) => {
        backCoverImg.onload = () => {
          console.log('🖼️ Back cover image loaded, size:', backCoverImg.width, 'x', backCoverImg.height);
          
          // Set canvas size to match the image
          canvas.width = backCoverImg.width;
          canvas.height = backCoverImg.height;
          
          // Draw the back cover image
          ctx.drawImage(backCoverImg, 0, 0);
          
          // Load and draw the QR code
          const qrImg = new Image();
          qrImg.onload = () => {
            console.log('📱 QR code image loaded, overlaying...');
            
            // Position QR code in bottom right corner with some padding
            const qrSize = 160; // Size of QR code
            const padding = 40; // Padding from edges
            const x = canvas.width - qrSize - padding;
            const y = canvas.height - qrSize - padding - 30; // Extra space for text
            
            console.log('📍 QR position:', x, y, 'on canvas:', canvas.width, 'x', canvas.height);
            
            // Cut out a clean section for the QR code with rounded corners
            const cutoutPadding = 12;
            const cutoutX = x - cutoutPadding;
            const cutoutY = y - cutoutPadding;
            const cutoutWidth = qrSize + (cutoutPadding * 2);
            const cutoutHeight = qrSize + (cutoutPadding * 2) + 25; // Extra height for text
            
            // Create rounded rectangle cutout
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.roundRect(cutoutX, cutoutY, cutoutWidth, cutoutHeight, 8);
            ctx.fill();
            
            // Add subtle border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Draw the QR code
            ctx.drawImage(qrImg, x, y, qrSize, qrSize);
            
            // Add "Scan me :)" text
            ctx.fillStyle = '#666666';
            ctx.font = '18px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            const textX = x + qrSize / 2;
            const textY = y + qrSize + 18;
            ctx.fillText('Scan me :)', textX, textY);
            
            // Convert canvas to data URL and resolve
            const result = canvas.toDataURL('image/png', 0.9);
            console.log('✅ QR overlay complete, result length:', result.length);
            resolve(result);
          };
          qrImg.onerror = (error) => {
            console.error('❌ Failed to load QR code image:', error);
            reject(new Error('Failed to load QR code'));
          };
          qrImg.src = qrCodeDataUrl;
        };
        backCoverImg.onerror = (error) => {
          console.error('❌ Failed to load back cover image:', error);
          reject(new Error('Failed to load back cover image'));
        };
        backCoverImg.src = imageUrl;
      });
    } catch (error) {
      console.error('❌ Error overlaying QR code:', error);
      // Return original image if QR overlay fails
      return imageUrl;
    }
  };

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

  // Cleanup countdown interval on unmount
  useEffect(() => {
    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, [countdownInterval]);

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
  
  // Preload template cards for instant access
  const { preloadAllCards, getCachedCards, totalCards } = useCardCache();

  // Print confirmation dialog state
  const [showPrintConfirmation, setShowPrintConfirmation] = useState(false);

  // Generation time tracking
  const [generationDuration, setGenerationDuration] = useState<number | null>(null);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [currentElapsedTime, setCurrentElapsedTime] = useState<number>(0);
  const [elapsedTimeInterval, setElapsedTimeInterval] = useState<NodeJS.Timeout | null>(null);

  // Helper function to format generation time
  const formatGenerationTime = (durationSeconds: number) => {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
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
    
    // Save start time to localStorage for persistence
    localStorage.setItem('generation-start-time', start.toString());
    
    // Clear any existing interval
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
    }
    
    // Start new interval to update elapsed time and progress every second
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000; // Convert to seconds
      setCurrentElapsedTime(elapsed);
      
      // Use provided estimated total or default based on mode
      const estimatedTotal = estimatedTotalSeconds || (isDraftMode ? 45 : 150); // 45 seconds for draft mode, 150 seconds (2.5 minutes) for final
      const percentage = Math.min((elapsed / estimatedTotal) * 100, 95); // Cap at 95% until completion
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

  // Restore elapsed time tracking from localStorage
  const restoreElapsedTimeTracking = () => {
    const savedStartTime = localStorage.getItem('generation-start-time');
    if (savedStartTime && isGenerating) {
      const startTime = parseInt(savedStartTime);
      const elapsed = (Date.now() - startTime) / 1000;
      setCurrentElapsedTime(elapsed);
      startElapsedTimeTracking(startTime);
    }
  };

  // localStorage persistence hooks
  useEffect(() => {
    // Load saved state from localStorage on component mount
    const loadSavedState = () => {
      try {
        const savedFormData = localStorage.getItem('vibecarding-form-data');
        console.log('🔍 Loading saved form data:', savedFormData);
        if (savedFormData) {
          const formData = JSON.parse(savedFormData);
          console.log('📋 Parsed form data:', formData);
          setPrompt(formData.prompt || "");
          setFinalCardMessage(formData.finalCardMessage || "");
          setToField(formData.toField || "");
          setFromField(formData.fromField || "");
          setSelectedType(formData.selectedType || "birthday");
          setCustomCardType(formData.customCardType || "");
          setSelectedTone(formData.selectedTone || "funny");
          setSelectedArtisticStyle(formData.selectedArtisticStyle || "watercolor");
          setCustomStyleDescription(formData.customStyleDescription || "");
          setSelectedImageModel(formData.selectedImageModel || "gpt-image-1");
          setSelectedDraftModel(formData.selectedDraftModel || "gpt-image-1");
          setNumberOfCards(formData.numberOfCards || 1);
          setUserEmail(formData.userEmail || "");
          setReferenceImageUrls(formData.referenceImageUrls || []);
          setImageTransformation(formData.imageTransformation || "");
          setIsHandwrittenMessage(formData.isHandwrittenMessage || false);
          setIsFrontBackOnly(formData.isFrontBackOnly || false);
          setSelectedPaperSize(formData.selectedPaperSize || "standard");
          setShowAdvanced(formData.showAdvanced || false);
          setHandwritingSampleUrl(formData.handwritingSampleUrl || "");
          setIsTextareaExpanded(formData.isTextareaExpanded || false);
          setIsMessageExpanded(formData.isMessageExpanded || false);
          setMessageHistory(formData.messageHistory || []);
          setCurrentMessageIndex(formData.currentMessageIndex || -1);
          setShowRefinementBox(formData.showRefinementBox || false);
          setShowSettings(formData.showSettings || false);
          setShowPrintConfirmation(formData.showPrintConfirmation || false);
          setIsCardCompleted(formData.isCardCompleted || false);
          setGenerationDuration(formData.generationDuration || null);
          console.log('✅ Form data loaded successfully');
        } else {
          console.log('ℹ️ No saved form data found');
        }

        const savedCards = localStorage.getItem('vibecarding-generated-cards');
        if (savedCards) {
          const cardsData = JSON.parse(savedCards);
          
          // Check for old format (with cards array) and migrate to new format
          if (cardsData.cards && Array.isArray(cardsData.cards)) {
            console.log('🔄 Detected old localStorage format, migrating to new format...');
            
            // Get the most recent card from the old format
            let mostRecentCard = null;
            if (cardsData.cards.length > 0) {
              // Use selected card if available, otherwise use the last card in array
              const selectedIndex = cardsData.selectedIndex || 0;
              mostRecentCard = cardsData.cards[selectedIndex] || cardsData.cards[cardsData.cards.length - 1];
              
              if (mostRecentCard) {
                // Convert to new format and save immediately
                const newCardsData = {
                  mostRecentCard: mostRecentCard,
                  generationDuration: cardsData.generationDuration || null
                };
                
                try {
                  localStorage.setItem('vibecarding-generated-cards', JSON.stringify(newCardsData));
                  console.log('✅ Migrated to new localStorage format with most recent card');
                } catch (error) {
                  console.error('❌ Failed to save migrated data:', error);
                }
                
                // Set up the UI with the migrated card
                const cardWithDate = {
                  ...mostRecentCard,
                  createdAt: new Date(mostRecentCard.createdAt)
                };
                setGeneratedCards([cardWithDate]);
                setSelectedCardIndex(0);
                setGeneratedCard(cardWithDate);
                
                if (cardsData.generationDuration) {
                  setGenerationDuration(cardsData.generationDuration);
                }
              }
            } else {
              // Old format but no cards, just clear it
              console.log('🧹 Old format with no cards, clearing localStorage');
              localStorage.removeItem('vibecarding-generated-cards');
            }
          }
          // Handle new format (with mostRecentCard)
          else if (cardsData.mostRecentCard) {
            const mostRecentCard = {
              ...cardsData.mostRecentCard,
              createdAt: new Date(cardsData.mostRecentCard.createdAt)
            };
            setGeneratedCards([mostRecentCard]);
            setSelectedCardIndex(0);
            setGeneratedCard(mostRecentCard);
            
            // Restore generation duration if available
            if (cardsData.generationDuration) {
              setGenerationDuration(cardsData.generationDuration);
              console.log('⏱️ Restored generation duration:', cardsData.generationDuration, 'seconds');
            }
            console.log('✅ Most recent card loaded from localStorage');
          }
          // Invalid or empty format, clear it
          else {
            console.log('🧹 Invalid localStorage format detected, clearing...');
            localStorage.removeItem('vibecarding-generated-cards');
          }
        }
      } catch (error) {
        console.error('Error loading saved state:', error);
      }
    };

    // Cleanup function to remove any stale or unnecessary localStorage data
    const cleanupLocalStorage = () => {
      try {
        // List of keys we want to keep
        const keepKeys = [
          'vibecarding-form-data',
          'vibecarding-generated-cards',
          'vibecarding-templates',
          'vibecarding-templates-timestamp',
          'generation-start-time'
        ];
        
        // Get all localStorage keys that start with 'vibecarding-' or other app-related prefixes
        const keysToCheck = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('vibecarding-') || key.startsWith('cardJob_') || key === 'pendingCardJobs')) {
            keysToCheck.push(key);
          }
        }
        
        // Remove any keys that are not in our keep list
        let removedCount = 0;
        keysToCheck.forEach(key => {
          if (!keepKeys.includes(key)) {
            // Special handling for job-related keys - keep recent ones, remove old ones
            if (key.startsWith('cardJob_') || key === 'pendingCardJobs') {
              try {
                if (key === 'pendingCardJobs') {
                  const pendingJobs = JSON.parse(localStorage.getItem(key) || '[]');
                  // Keep only jobs from the last 24 hours
                  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                  const recentJobs = pendingJobs.filter((jobId: string) => {
                    const jobData = localStorage.getItem(`cardJob_${jobId}`);
                    if (jobData) {
                      const job = JSON.parse(jobData);
                      return job.createdAt && job.createdAt > oneDayAgo;
                    }
                    return false;
                  });
                  
                  if (recentJobs.length !== pendingJobs.length) {
                    localStorage.setItem(key, JSON.stringify(recentJobs));
                    console.log(`🧹 Cleaned up ${pendingJobs.length - recentJobs.length} old pending jobs`);
                  }
                } else if (key.startsWith('cardJob_')) {
                  const jobData = localStorage.getItem(key);
                  if (jobData) {
                    const job = JSON.parse(jobData);
                    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                    if (!job.createdAt || job.createdAt < oneDayAgo) {
                      localStorage.removeItem(key);
                      removedCount++;
                    }
                  }
                }
              } catch (error) {
                // If we can't parse the job data, it's probably corrupted, so remove it
                localStorage.removeItem(key);
                removedCount++;
              }
            } else {
              // Remove any other unknown keys
              localStorage.removeItem(key);
              removedCount++;
            }
          }
        });
        
        if (removedCount > 0) {
          console.log(`🧹 Cleaned up ${removedCount} stale localStorage items`);
        }
      } catch (error) {
        console.error('Error during localStorage cleanup:', error);
      }
    };

    loadSavedState();
    cleanupLocalStorage();
    setIsInitialLoadComplete(true);
    
    // Start preloading template cards immediately on page load
    preloadAllCards();
  }, [preloadAllCards]);

  // Cleanup elapsed time interval on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimeInterval) {
        clearInterval(elapsedTimeInterval);
      }
    };
  }, [elapsedTimeInterval]);

  // Check for pending jobs and restore timer on page load
  useEffect(() => {
    checkPendingJobs();
    // Restore elapsed time tracking if generation is in progress
    restoreElapsedTimeTracking();
  }, []);

  // Save form data to localStorage whenever form state changes
  useEffect(() => {
    // Only save after initial load is complete to avoid overwriting loaded data
    if (!isInitialLoadComplete) return;
    
    const saveFormData = () => {
      try {
        const formData = {
          prompt,
          finalCardMessage,
          toField,
          fromField,
          selectedType,
          customCardType,
          selectedTone,
          selectedArtisticStyle,
          customStyleDescription,
          selectedImageModel,
          selectedDraftModel,
          numberOfCards,
          userEmail,
          referenceImageUrls,
          imageTransformation,
          isHandwrittenMessage,
          isFrontBackOnly,
          selectedPaperSize,
          showAdvanced,
          handwritingSampleUrl,
          isTextareaExpanded,
          isMessageExpanded,
          messageHistory,
          currentMessageIndex,
          showRefinementBox,
          showSettings,
          showPrintConfirmation,
          isCardCompleted,
          generationDuration
        };
        localStorage.setItem('vibecarding-form-data', JSON.stringify(formData));
        console.log('✅ Form data saved to localStorage:', formData);
      } catch (error) {
        console.error('❌ Error saving form data:', error);
      }
    };

    saveFormData();
      }, [isInitialLoadComplete, prompt, finalCardMessage, toField, fromField, selectedType, customCardType, selectedTone, selectedArtisticStyle, customStyleDescription, selectedImageModel, numberOfCards, userEmail, referenceImageUrls, imageTransformation, isHandwrittenMessage, isFrontBackOnly, selectedPaperSize, showAdvanced, handwritingSampleUrl, isTextareaExpanded, isMessageExpanded, messageHistory, currentMessageIndex, showRefinementBox, showSettings, showPrintConfirmation, isCardCompleted, generationDuration]);

  // Save only the most recent card to localStorage whenever it changes
  useEffect(() => {
    const saveGeneratedCards = () => {
      try {
        if (generatedCards.length === 0) return;
        
        // Get the most recent card (the last one in the array, or the selected one)
        const mostRecentCard = generatedCard || generatedCards[generatedCards.length - 1];
        
        // Create lightweight version without base64 QR codes for localStorage
        const cardForStorage = { ...mostRecentCard };
        if (cardForStorage.backCover && cardForStorage.backCover.startsWith('data:image/png;base64,')) {
          // Don't store the base64 QR code version - it's too large for localStorage
          // The QR code will be regenerated when needed
          console.log('💾 Skipping base64 QR code storage for card:', cardForStorage.id);
          // Keep the original back cover URL if we have it
          // Note: In practice, we'd need to store the original URL separately
          // For now, we'll just not save the base64 version
        }
        
        const cardsData = {
          mostRecentCard: cardForStorage,
          generationDuration: generationDuration
        };
        localStorage.setItem('vibecarding-generated-cards', JSON.stringify(cardsData));
        console.log('💾 Most recent card saved to localStorage:', cardForStorage.id);
      } catch (error) {
        console.error('Error saving generated cards:', error);
      }
    };

    if (generatedCards.length > 0) {
      saveGeneratedCards();
    }
  }, [generatedCards, generatedCard, generationDuration]);

  // Track manual message changes for version control
  useEffect(() => {
    if (!isInitialLoadComplete) return;
    
    const timeoutId = setTimeout(() => {
      if (finalCardMessage.trim() && 
          messageHistory.length > 0 && 
          finalCardMessage !== messageHistory[currentMessageIndex]) {
        // User has manually edited the message, add to history
        addMessageToHistory(finalCardMessage);
      }
    }, 2000); // Wait 2 seconds after user stops typing

    return () => clearTimeout(timeoutId);
  }, [finalCardMessage, isInitialLoadComplete]);


  // Clear saved data function
  const clearSavedData = () => {
    try {
      localStorage.removeItem('vibecarding-form-data');
      localStorage.removeItem('vibecarding-generated-cards');
      localStorage.removeItem('vibecarding-templates');
      localStorage.removeItem('vibecarding-templates-timestamp');
      toast.success("Saved data cleared!");
    } catch (error) {
      console.error('Error clearing saved data:', error);
      toast.error("Failed to clear saved data");
    }
  };

  // Storage management function
  const getStorageUsage = () => {
    try {
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key) && key.startsWith('vibecarding-')) {
          totalSize += localStorage[key].length;
        }
      }
      return {
        used: totalSize,
        usedMB: (totalSize / (1024 * 1024)).toFixed(2),
        percentage: Math.round((totalSize / (5 * 1024 * 1024)) * 100) // Assume 5MB limit
      };
    } catch (error) {
      return { used: 0, usedMB: '0', percentage: 0 };
    }
  };


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

  const applyTemplate = (template: GeneratedCard) => {
    // Store the selected template and show customization dialog
    setSelectedTemplate(template);
    setShowTemplateCustomization(true);
    setShowTemplateGallery(false);
    
    // Initialize customization form with template data
    setTemplateCustomizations({
      promptChanges: "",
      messageChanges: "",
      useReferenceImage: false,
      referenceImageFile: null,
      referenceImageUrls: [],
      referenceImageTransformation: ""
    });
  };

  // Generate card directly with existing prompts (for template customization)
  const generateCardWithExistingPrompts = async (prompts: any) => {
    if (!userEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    // Clear all draft mode states to prevent UI conflicts
    setIsDraftMode(false);
    setDraftCards([]);
    setDraftIndexMapping([]);
    setSelectedDraftIndex(-1);
    setIsGeneratingFinalCard(false);
    setPreviewingDraftIndex(-1);
    setDraftCompletionShown(false); // Reset completion flag
    
    // Clear any existing card states
    setGeneratedCards([]);
    setGeneratedCard(null);
    setSelectedCardIndex(0);
    setCurrentCardId(null);
    setIsCardCompleted(false);

    setIsGenerating(true);
    startElapsedTimeTracking();
    setGenerationProgress("🎨 Creating your customized template card...");
    setProgressPercentage(0);

    try {
      // Create job tracking
      const jobId = uuidv4();
      setCurrentJobId(jobId);
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const paperConfig = paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0];

      // Handle message customization
      let messageContent = templateCustomizations.messageChanges.trim() || finalCardMessage;
      if (isHandwrittenMessage) {
        messageContent = "[Blank space for handwritten message]";
      }

      // Update the right interior prompt with custom message if provided
      if (messageContent && prompts.rightInterior && !isHandwrittenMessage) {
        prompts.rightInterior = prompts.rightInterior
          .replace(/Include message text: "[^"]*"/g, `Include message text: "${messageContent}"`)
          .replace(/"MESSAGE GOES HERE"/g, `"${messageContent}"`)
          .replace(/MESSAGE GOES HERE/g, messageContent);
      }

      // Save job data
      const jobData = {
        prompt: selectedTemplate?.prompt || "",
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
        numberOfCards: 1,
        selectedPaperSize,
        prompts,
        paperConfig,
        isTemplateCustomization: true
      };
      
      saveJobToStorage(jobId, jobData);
      
      setGenerationProgress("🚀 Starting your personalized template card generation...");
      
      // Prepare input images for reference photo support
      const inputImages: string[] = [];
      
              // Include both template customization reference images and main reference images
        if (selectedImageModel === "gpt-image-1") {
          // Add template customization reference images
          if (templateCustomizations.referenceImageUrls.length > 0) {
            inputImages.push(...templateCustomizations.referenceImageUrls);
            console.log("🔍 DEBUG: Added template customization reference images:", templateCustomizations.referenceImageUrls);
          }
          // Add main reference images from the form
          if (referenceImageUrls.length > 0) {
            inputImages.push(...referenceImageUrls);
            console.log("🔍 DEBUG: Added main form reference images:", referenceImageUrls);
          }
          
          if (inputImages.length > 0) {
            console.log("🔍 DEBUG: Total input images for template generation:", inputImages.length);
            toast.success(`📸 ${inputImages.length} reference photo${inputImages.length > 1 ? 's' : ''} ready for template customization!`);
          }
        }

      // Enhance prompts with reference image instructions if available
      const enhancedPrompts = { ...prompts };
      if (inputImages.length > 0 && selectedImageModel === "gpt-image-1") {
        const totalReferenceImages = (templateCustomizations.referenceImageUrls?.length || 0) + (referenceImageUrls?.length || 0);
        const characterInstructions = `\n\nCRITICAL CHARACTER REFERENCE INSTRUCTIONS: I have provided ${totalReferenceImages > 1 ? 'multiple reference photos' : 'a reference photo'} as input image${totalReferenceImages > 1 ? 's' : ''}. You MUST create cartoon/illustrated characters that accurately represent ONLY the people who are actually visible in ${totalReferenceImages > 1 ? 'these reference photos' : 'this reference photo'} with high fidelity to their appearance.

MANDATORY CHARACTER MATCHING REQUIREMENTS - ONLY INCLUDE WHAT IS ACTUALLY VISIBLE:
- REPRESENT ONLY PEOPLE ACTUALLY IN THE PHOTOS: Create cartoon versions of ONLY the people who are actually shown in the reference photos. Do NOT add, create, or imagine any additional people not present in the reference images.
- EXACT hair color, hair style, and hair length from each reference photo - only what is actually visible
- PRECISE facial features for each person: eye color, eye shape, nose shape, face structure, skin tone - exactly as shown in the reference
- ACCURATE clothing: replicate ONLY the EXACT clothing items, colors, patterns, and styles actually worn by each person in their reference photo - do not add or change any clothing items
- ACCESSORIES ONLY IF VISIBLE: Include accessories (glasses, jewelry, hats, watches, bags, etc.) ONLY if they are actually visible on each person in the reference photo. DO NOT add glasses if they are not wearing glasses in the photo. DO NOT add jewelry if they are not wearing jewelry in the photo. DO NOT add any accessories that are not clearly visible in the reference image.
- CORRECT body proportions and posture as shown for each person in their reference
- FAITHFUL age representation and gender presentation for each individual - exactly as they appear
- AUTHENTIC facial expressions and poses from the reference images, lean towards making the people look happier unless the user specifically asks for a different expression
- GROUP COMPOSITION: If multiple people are actually shown in the photos, arrange them naturally together in a pleasing composition that fits the card's theme

CRITICAL RESTRICTION: Do not add, remove, or modify any visual elements beyond what is actually visible in the reference photos. Only include people, clothing, and accessories that are clearly shown in the reference images.

${templateCustomizations.referenceImageTransformation || imageTransformation || 'Study every detail of the people actually in the reference image and recreate them as stylized cartoon characters while maintaining 100% accuracy to their distinctive visual features. The characters must be immediately recognizable as the same people from the reference photo. Pay special attention to clothing details and accessories that are actually visible, and unique personal style elements that make each person distinctive. Do not add or imagine any elements not present in the reference.'}

The cartoon style should be charming and artistic while preserving complete visual accuracy to the reference photo. Only represent people, clothing, and accessories that are actually visible in the reference images.`;

        if (enhancedPrompts.frontCover) {
          enhancedPrompts.frontCover += characterInstructions;
        }
      }

      const response = await fetch('/api/generate-card-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          prompts: enhancedPrompts,
          config: {
            userNumber: "+17145986105",
            modelVersion: selectedImageModel,
            aspectRatio: paperConfig.aspectRatio,
            quality: "high", // High quality for template customization
            outputFormat: "jpeg",
            outputCompression: 100,
            moderation: "low",
            dimensions: paperConfig.dimensions,
            isFrontBackOnly,
            userEmail,
            cardType: cardTypeForPrompt,
            toField,
            fromField,
            isDraftMode: false, // Explicitly set to false for template generation
            isTemplateCustomization: true,
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
        throw new Error(result.message || 'Failed to start card generation');
      }

      setGenerationProgress("✨ Bringing your customized template to life...");
      toast.success("🎉 Your personalized template card generation started!");
      
      pollJobStatus(jobId);

    } catch (error) {
      console.error('Template customization generation error:', error);
      toast.error("Failed to generate customized card. Please try again.");
      
      if (currentJobId) {
        removeJobFromStorage(currentJobId);
        setCurrentJobId(null);
      }
      
      setIsGenerating(false);
      setGenerationProgress("");
      stopElapsedTimeTracking();
    }
  };

  const handleApplyTemplateWithCustomizations = async () => {
    if (!selectedTemplate) return;
    
    // Show loading state if we have customizations to process
    if (templateCustomizations.promptChanges.trim() && selectedTemplate.generatedPrompts) {
      toast.info("🤖 AI is applying your customizations to the template...");
    }
    
    // Apply template data to form - start with original prompt
    let finalPrompt = selectedTemplate.prompt || "";
    
    // If we have customizations and generated prompts, modify them directly and generate immediately
    if (templateCustomizations.promptChanges.trim() && selectedTemplate.generatedPrompts) {
      try {
        // Directly modify the generated prompts using AI
        const modificationQuery = `You are an expert at modifying detailed image generation prompts for greeting cards. You have existing prompts for each section of a card, and the user wants to make specific changes.

USER'S CUSTOMIZATION REQUEST: "${templateCustomizations.promptChanges}"

TASK: Modify each of the provided prompts to incorporate the user's requested changes while preserving all the original technical specifications, safety guidelines, and artistic details.

INSTRUCTIONS:
1. Only modify elements specifically mentioned in the user's customization request
2. Preserve ALL technical specifications (portrait format, text positioning, edge safety, etc.)
3. Maintain the same artistic style and quality level
4. Keep all safety guidelines and content policies
5. Preserve the greeting card context and purpose
6. If the customization affects multiple sections, apply it consistently

ORIGINAL PROMPTS TO MODIFY:

FRONT COVER:
${selectedTemplate.generatedPrompts.frontCover}

BACK COVER:
${selectedTemplate.generatedPrompts.backCover}

${selectedTemplate.generatedPrompts.leftInterior ? `LEFT INTERIOR:
${selectedTemplate.generatedPrompts.leftInterior}

` : ''}${selectedTemplate.generatedPrompts.rightInterior ? `RIGHT INTERIOR:
${selectedTemplate.generatedPrompts.rightInterior}` : ''}

Return the modified prompts in JSON format:
{
  "frontCover": "complete modified front cover prompt",
  "backCover": "complete modified back cover prompt"${selectedTemplate.generatedPrompts.leftInterior ? ',\n  "leftInterior": "complete modified left interior prompt"' : ''}${selectedTemplate.generatedPrompts.rightInterior ? ',\n  "rightInterior": "complete modified right interior prompt"' : ''}
}`;

        const modifiedPrompts = await chatWithAI(modificationQuery, {
          model: 'gemini-2.5-pro',
          includeThoughts: false,
          jsonSchema: {
            type: "object",
            properties: {
              frontCover: { type: "string" },
              backCover: { type: "string" },
              ...(selectedTemplate.generatedPrompts.leftInterior ? { leftInterior: { type: "string" } } : {}),
              ...(selectedTemplate.generatedPrompts.rightInterior ? { rightInterior: { type: "string" } } : {})
            },
            required: ["frontCover", "backCover"]
          }
        });

        if (modifiedPrompts && modifiedPrompts.frontCover) {
          // Generate card directly with modified prompts, bypassing the normal prompt-to-prompts flow
          toast.info("🤖 AI has customized the template prompts! Generating your personalized card...");
          
          // Set basic form data
          setPrompt(selectedTemplate.prompt || "");
          
          // Clear states and start generation directly with modified prompts
          setGeneratedCards([]);
          setGeneratedCard(null);
          setSelectedCardIndex(0);
          setCurrentCardId(null);
          
          // Clear draft mode states to prevent UI conflicts
          setIsDraftMode(false);
          setDraftCards([]);
          setDraftIndexMapping([]);
          setSelectedDraftIndex(-1);
          setIsGeneratingFinalCard(false);
          setPreviewingDraftIndex(-1);
          setDraftCompletionShown(false); // Reset completion flag
          
          // Clear progress states
          setGenerationProgress("");
          setIsGenerating(false);
          setIsCardCompleted(false);
          
          // Close dialogs
          setShowTemplateCustomization(false);
          setSelectedTemplate(null);
          
          // Start generation with modified prompts
          setTimeout(() => {
            generateCardWithExistingPrompts(modifiedPrompts);
          }, 1000);
          
          return; // Exit early since we're handling generation directly
        }
      } catch (error) {
        console.error('Failed to modify template prompts directly:', error);
        toast.error("Failed to customize template prompts. Using fallback method.");
      }
    }
    
    // Fallback: modify the user prompt and use normal generation flow
    if (templateCustomizations.promptChanges.trim()) {
      finalPrompt = `${finalPrompt}

CUSTOMIZATION REQUEST: ${templateCustomizations.promptChanges}`;
    }
    
    setPrompt(finalPrompt);
    
    // Try to extract card type from prompt
    const promptLower = (selectedTemplate.prompt || "").toLowerCase();
    let detectedType = "birthday"; // default
    
    cardTypes.forEach(type => {
      if (type.id !== "custom" && promptLower.includes(type.id.toLowerCase())) {
        detectedType = type.id;
      }
    });
    
    setSelectedType(detectedType);
    
    // Apply message customizations
    if (templateCustomizations.messageChanges.trim()) {
      setFinalCardMessage(templateCustomizations.messageChanges);
    } else {
      setFinalCardMessage(""); // Let it auto-generate
    }
    
    // Handle reference image if provided
    if (templateCustomizations.useReferenceImage && templateCustomizations.referenceImageFile) {
      try {
        // Upload the reference image
        const formData = new FormData();
        formData.append('file', templateCustomizations.referenceImageFile);
        
        const uploadResponse = await fetch(`${BACKEND_API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData,
        });
        
        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          // Add to existing reference images instead of replacing them
          setReferenceImages(prev => [...prev, templateCustomizations.referenceImageFile!]);
          setReferenceImageUrls(prev => [...prev, uploadResult.url]);
          setImageTransformation(templateCustomizations.referenceImageTransformation || "Transform into the same artistic style as the template");
          toast.success("Reference image uploaded successfully!");
        } else {
          toast.error("Failed to upload reference image");
        }
      } catch (error) {
        console.error('Reference image upload failed:', error);
        toast.error("Failed to upload reference image");
      }
    }
    
    // Clear current generated cards since we're starting fresh with a template
    setGeneratedCards([]);
    setGeneratedCard(null);
    setSelectedCardIndex(0);
    setCurrentCardId(null);
    
    // Clear draft mode states to prevent UI conflicts
    setIsDraftMode(false);
    setDraftCards([]);
    setDraftIndexMapping([]);
    setSelectedDraftIndex(-1);
    setIsGeneratingFinalCard(false);
    setPreviewingDraftIndex(-1);
    setDraftCompletionShown(false); // Reset completion flag
    
    // Clear progress states
    setGenerationProgress("");
    setIsGenerating(false);
    setIsCardCompleted(false);
    
    // Close customization dialog
    setShowTemplateCustomization(false);
    setSelectedTemplate(null);
    
    const customizationSummary = [];
    if (templateCustomizations.promptChanges.trim()) customizationSummary.push("prompt changes");
    if (templateCustomizations.messageChanges.trim()) customizationSummary.push("custom message");
    if (templateCustomizations.useReferenceImage) customizationSummary.push("reference image");
    
    const summaryText = customizationSummary.length > 0 
      ? ` with ${customizationSummary.join(", ")}`
      : "";
    
    toast.success(`✨ Template customized${summaryText}! Generating your personalized card...`);
    
    // Automatically start card generation
    setTimeout(() => {
      handleGenerateCardAsync();
    }, 1000); // Small delay to let the user see the success message
  };

  // Create new card function - clears all data
  const handleCreateNewCard = () => {
    // Clear all form fields
    setPrompt("");
    setFinalCardMessage("");
    setToField("");
    setFromField("");
    setSelectedType("birthday");
    setCustomCardType("");
    setSelectedTone("funny");
    setSelectedArtisticStyle("watercolor");
    setCustomStyleDescription("");
    setSelectedImageModel("gpt-image-1");
    setNumberOfCards(1);
    setUserEmail("");
    setReferenceImages([]);
    setReferenceImageUrls([]);
    setImageTransformation("");
    setHandwritingSample(null);
    setHandwritingSampleUrl(null);
    setIsHandwrittenMessage(false);
    setIsFrontBackOnly(false);
    setSelectedPaperSize("standard");
    
    // Clear generated cards
    setGeneratedCards([]);
    setGeneratedCard(null);
    setSelectedCardIndex(0);
    setCurrentCardId(null);
    
    // Clear draft mode states
    setIsDraftMode(false);
    setDraftCards([]);
    setDraftIndexMapping([]);
    setSelectedDraftIndex(-1);
    setIsGeneratingFinalCard(false);
    setPreviewingDraftIndex(-1);
    setDraftCompletionShown(false);
    
    // Clear progress and states
    setGenerationProgress("");
    setIsGenerating(false);
    setIsGeneratingMessage(false);
    setIsCardCompleted(false);
    setCountdown(0);
    if (countdownInterval) {
      clearInterval(countdownInterval);
      setCountdownInterval(null);
    }
    
    // Clear message history
    setMessageHistory([]);
    setCurrentMessageIndex(-1);
    setRefinementPrompt("");
    setShowRefinementBox(false);
    
    // Clear localStorage
    try {
      localStorage.removeItem('vibecarding-form-data');
      localStorage.removeItem('vibecarding-generated-cards');
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
    
    toast.success("✨ Ready to create a new card!");
  };

  // Regenerate with same prompt function
  const handleRegenerateCard = () => {
    // Keep all current settings but clear generated results
    setGeneratedCards([]);
    setGeneratedCard(null);
    setSelectedCardIndex(0);
    setCurrentCardId(null);
    
    // Clear draft mode states
    setIsDraftMode(false);
    setDraftCards([]);
    setDraftIndexMapping([]);
    setSelectedDraftIndex(-1);
    setIsGeneratingFinalCard(false);
    setPreviewingDraftIndex(-1);
    setDraftCompletionShown(false);
    
    // Clear progress and states
    setGenerationProgress("");
    setIsGenerating(false);
    setIsGeneratingMessage(false);
    setIsCardCompleted(false);
    setCountdown(0);
    if (countdownInterval) {
      clearInterval(countdownInterval);
      setCountdownInterval(null);
    }
    
    // Clear generated cards from localStorage but keep form data
    try {
      localStorage.removeItem('vibecarding-generated-cards');
    } catch (error) {
      console.error('Error clearing generated cards:', error);
    }
    
    toast.success("🔄 Ready to regenerate with the same settings!");
  };

  // Message version control functions
  const addMessageToHistory = (message: string) => {
    if (message.trim() === "") return;
    
    // Safety check: Remove any MESSAGE tags that might have slipped through
    const cleanMessage = message.replace(/<\/?MESSAGE>/g, '').trim();
    if (cleanMessage === "") return;
    
    // Remove any future history if we're not at the end
    const newHistory = messageHistory.slice(0, currentMessageIndex + 1);
    newHistory.push(cleanMessage);
    
    // Keep only last 10 versions to prevent memory issues
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

  // Handle message refinement
  const handleRefineMessage = async () => {
    if (!refinementPrompt.trim() || !finalCardMessage.trim()) {
      toast.error("Please enter both a message and refinement instructions!");
      return;
    }

    setIsRefiningMessage(true);

    try {
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      
      const refinementAPIPrompt = `Please refine this greeting card message based on the user's instructions.

Current Message: "${finalCardMessage}"

Refinement Instructions: "${refinementPrompt}"

Card Context:
- Type: ${cardTypeForPrompt}
- Tone: ${toneDescription}
${toField ? `- Recipient: ${toField}` : ""}
${fromField ? `- Sender: ${fromField}` : ""}

Please provide only the refined message, maintaining the ${toneDescription} tone while implementing the requested changes.`;

      const refinedMessage = await chatWithAI(refinementAPIPrompt, {
        model: "gemini-2.5-pro",
        includeThoughts: false
      });

      if (refinedMessage?.trim()) {
        // Add current message to history before changing
        addMessageToHistory(finalCardMessage);
        
        // Clean any potential MESSAGE tags from refined message (safety check)
        const cleanedRefinedMessage = refinedMessage.trim().replace(/<\/?MESSAGE>/g, '').trim();
        
        // Set the new refined message
        setFinalCardMessage(cleanedRefinedMessage);
        
        // Add the new message to history
        addMessageToHistory(cleanedRefinedMessage);
        
        setRefinementPrompt("");
        setShowRefinementBox(false);
        toast.success("Message refined successfully!");
      } else {
        throw new Error('No message received');
      }
    } catch (error) {
      console.error('Error refining message:', error);
      toast.error("Failed to refine message. Please try again.");
    } finally {
      setIsRefiningMessage(false);
    }
  };

  // Writing Assistant
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

  // Simplified draft mode generation - calls consolidated function 4 times
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
             console.log("🔍 DEBUG: Reference image validation failed:", {
         referenceImageUrlsLength: referenceImageUrls.length,
         referenceImageUrls: referenceImageUrls,
         selectedDraftModel: selectedDraftModel,
         referenceImagesLength: referenceImages.length
       });
       
       // Show a more helpful error with action buttons
       const clearPhotos = () => {
         setReferenceImages([]);
         setReferenceImageUrls([]);
         toast.success("Reference photos cleared! You can now use draft mode.");
       };
       
       const switchToGPT1 = () => {
         setSelectedDraftModel("gpt-image-1");
         toast.success("Switched to GPT Image 1 for draft mode!");
       };
       
       toast.error(
         <div className="space-y-2">
           <p>Reference photos are only supported with GPT Image 1 model.</p>
           <p className="text-xs">You have {referenceImageUrls.length} reference photo{referenceImageUrls.length > 1 ? 's' : ''} but selected {imageModels.find(m => m.id === selectedDraftModel)?.label}.</p>
           <div className="flex gap-2 mt-2">
             <button 
               onClick={switchToGPT1}
               className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
             >
               Use GPT Image 1
             </button>
             <button 
               onClick={clearPhotos}
               className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
             >
               Remove Photos
             </button>
           </div>
         </div>,
         { duration: 8000 }
       );
      return;
    }

    setIsDraftMode(true);
    setIsGenerating(true);
    startElapsedTimeTracking(undefined, 45); // 45 seconds for draft mode
    setGenerationProgress("🎨 Creating 10 front cover variations for you to choose from...");
    setProgressPercentage(0);
    setDraftCards([]);
    setDraftIndexMapping([]);
    setSelectedDraftIndex(-1);
    setDraftCompletionShown(false); // Reset completion flag
    
    // Clear any previous card state to avoid UI conflicts
    setGeneratedCard(null);
    setGeneratedCards([]);
    setIsCardCompleted(false);

    try {
      console.log("🚀 Starting draft mode generation with 5 variations");
      
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
            
            await handleGenerateCardAsyncInternal({
              isDraftMode: true,
              draftIndex: index,
              styleOverride: styleOverride,
              styleLabel: styleLabel,
              onDraftComplete: (card: GeneratedCard, idx: number) => {
                console.log(`✅ Draft variation ${idx + 1} completed:`, card.id);
                setDraftCards(prev => {
                  const updated = [...prev];
                  updated[idx] = card;
                  
                  // Check if all 5 variations are complete
                  const completedCount = updated.filter(c => c).length;
                  console.log(`📊 Draft progress: ${completedCount}/5 variations complete`);
                  
                  if (completedCount === 5) {
                    setIsGenerating(false);
                    setGenerationProgress("");
                    setProgressPercentage(100);
                    stopElapsedTimeTracking();
                    toast.success("🎨 All 5 design variations ready! Choose your favorite below.");
                  } else {
                    setGenerationProgress(`✨ ${completedCount}/5 variations complete...`);
                    setProgressPercentage((completedCount / 5) * 100);
                  }
                  
                  return updated;
                });
              }
            });
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
      setDraftCompletionShown(false); // Reset completion flag
      setGenerationProgress("");
      stopElapsedTimeTracking();
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
        model: "gemini-2.5-pro"
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

  // Consolidated card generation function
  const handleGenerateCardAsyncInternal = async (options: {
    isDraftMode?: boolean;
    draftIndex?: number;
    styleOverride?: string;
    styleLabel?: string;
    onDraftComplete?: (card: GeneratedCard, index: number) => void;
  } = {}) => {
    const { isDraftMode = false, draftIndex = 0, styleOverride = undefined, styleLabel = undefined, onDraftComplete } = options;
    
    console.log(`🔍 handleGenerateCardAsyncInternal called:`, { isDraftMode, draftIndex, hasOnDraftComplete: !!onDraftComplete });
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

    // Determine which model to use based on mode
    const modelToUse = isDraftMode ? selectedDraftModel : selectedImageModel;

    // Validate reference images with model compatibility
    if (referenceImageUrls.length > 0 && modelToUse !== "gpt-image-1") {
      const modeText = isDraftMode ? "draft mode" : "final generation";
      toast.error(`Reference photos are only supported with GPT Image 1 model. Please switch to GPT Image 1 for ${modeText} or remove reference photos.`);
      return;
    }

    // Only set global generating state if not in draft mode (draft mode manages its own state)
    if (!isDraftMode) {
      setIsGenerating(true);
      startElapsedTimeTracking(undefined, 120); // 120 seconds for regular card generation
      setGenerationProgress("Creating your personalized card...");
      setProgressPercentage(0);
    }

    try {
      // Create job tracking
      const jobId = isDraftMode ? `draft-${draftIndex}-${uuidv4()}` : uuidv4();
      if (!isDraftMode) {
        setCurrentJobId(jobId);
      }
      
      // Generate all prompts client-side first
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;

      let messageContent = finalCardMessage;
      
      // Handle message generation if needed
      if (isHandwrittenMessage) {
        messageContent = "[Blank space for handwritten message]";
      } else if (!messageContent.trim() && !isFrontBackOnly) {
        setGenerationProgress("✍️ Writing the perfect message...");
        
        // Auto-generate message (keeping existing logic)
        const autoMessagePrompt = `Create a ${toneDescription} message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${effectivePrompt}"
${toField ? `Recipient: ${toField}` : "Recipient: [not specified]"}
${fromField ? `Sender: ${fromField}` : "Sender: [not specified]"}
Card Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}

Instructions:
- Write a message that is ${toneDescription} and feels personal and genuine
- ${toField ? `Address the message to ${toField} directly, using their name naturally` : "Write in a way that could be personalized to any recipient"}
- ${fromField ? `Write as if ${fromField} is personally writing this message` : `Write in a ${toneDescription} tone`}
- Match the ${toneDescription} tone and occasion of the ${cardTypeForPrompt} card type
- Be inspired by the theme: "${prompt}"
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
      let effectiveArtisticStyle = selectedArtisticStyle;
      
      // Use style override if provided (for smart style distribution in draft mode)
      if (styleOverride) {
        effectiveArtisticStyle = styleOverride;
        console.log(`🎨 Using style override: ${styleOverride} instead of ${selectedArtisticStyle}`);
      }
      
      const selectedStyle = artisticStyles.find(style => style.id === effectiveArtisticStyle);
      const styleModifier = effectiveArtisticStyle === "custom" 
        ? customStyleDescription 
        : selectedStyle?.promptModifier || "";

      const paperConfig = paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0];

      setGenerationProgress("🎨 Creating artistic vision for your card...");

      // Generate prompts for all cards
      // In draft mode, only generate frontCover prompt for speed
      const promptGenerationQuery = isDraftMode ? 
        `You are an expert AI greeting card designer. Create a front cover prompt for a ${cardTypeForPrompt} greeting card.

Theme: "${effectivePrompt}"
Style: ${selectedStyle?.label || "Default"}
Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
${referenceImageUrls.length > 0 ? `Reference Photos: I have attached ${referenceImageUrls.length} reference photo${referenceImageUrls.length > 1 ? 's' : ''} for character creation.
Transformation instructions: "${imageTransformation || 'Create stylized cartoon characters that accurately represent the people in the reference photos'}"` : ""}

Front Cover Requirements:
- Include "${cardTypeForPrompt}" greeting text positioned safely in center area (avoid top/bottom 10%)
- Use beautiful, readable handwritten cursive script
- ${referenceImageUrls.length > 0 ? 'Create cartoon/illustrated characters from reference photos' : 'Create charming cartoon-style figures if needed'}
- Be creative and unique, avoid generic designs
- Flat 2D artwork for printing
- Style: ${styleModifier}

Return ONLY the front cover prompt as plain text.` 
        :
        `You are an expert AI greeting card designer tasked with creating cohesive, visually stunning prompts for a ${cardTypeForPrompt} greeting card${numberOfCards > 1 ? ` (this is variant ${1} of ${numberOfCards} unique designs)` : ''}.

Theme: "${effectivePrompt}"
Style: ${selectedStyle?.label || "Default"}
Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
${!isFrontBackOnly ? `Message: "${messageContent}"` : ""}
${isHandwrittenMessage ? "Note: Include space for handwritten message" : ""}
${referenceImageUrls.length > 0 ? `Reference Photos: I have attached ${referenceImageUrls.length} reference photo${referenceImageUrls.length > 1 ? 's' : ''} for you to analyze. Please look at ${referenceImageUrls.length > 1 ? 'these photos' : 'this photo'} to understand what the people look like - their hair color/style, facial features, clothing, accessories, body type, age, etc. Use this visual information to create accurate cartoon/illustrated versions of ${referenceImageUrls.length > 1 ? 'these people' : 'this person'} in the prompts.
Transformation instructions: "${imageTransformation || 'Create stylized cartoon characters that accurately represent the people in the reference photos while maintaining their distinctive features'}"` : ""}

CRITICAL: Create a cohesive visual narrative that flows chronologically through the card experience:
1. FRONT COVER: First impression - sets the scene/introduces the story
2. INTERIOR SPREAD: The heart of the experience - continuation and climax of the visual story
3. BACK COVER: Conclusion - peaceful resolution or complementary ending

Requirements:
- Flat 2D artwork for printing (not 3D card images)
- Full-bleed backgrounds extending to edges
- IMPORTANT: Keep text, faces, and key elements at least 10% away from top/bottom edges (small amount may be cropped in printing)
- Keep text/faces 0.5" from left/right edges for safe printing
- CONSISTENT visual elements throughout: same characters, color palette, lighting, art style
- Progressive visual storytelling from front → interior → back
- Put any text in quotes and make it clear/readable
- Each section should feel like part of the same artistic universe
- TONE: Ensure the visual mood and atmosphere matches the ${toneDescription} tone throughout all sections
- INTELLECTUAL PROPERTY SAFETY: If the user mentions specific characters, brands, logos, or products, automatically replace them with original generic alternatives in your prompts. For example: replace specific character names with "cartoon mouse character" or "superhero character", replace brand names with "colorful cereal" or "sports car", etc. Create inspired-by designs that capture the essence without referencing any protected names or specific copyrighted elements. Never include actual brand names, character names, or trademarked terms in the image generation prompts
- CONTENT SAFETY: Ensure all prompts are family-friendly and appropriate for greeting cards. Avoid any content that could be flagged by safety systems including: violence, weapons, inappropriate imagery, political content, controversial topics, scary or disturbing elements, or anything not suitable for all ages. If the user requests something potentially inappropriate, redirect to positive, wholesome alternatives that capture their intent in a family-friendly way
${selectedTone === 'funny' ? '- Include visual humor, playful elements, and whimsical details' : ''}
${selectedTone === 'genz-humor' ? '- Include GenZ visual elements like chaotic energy, internet meme references, bold contrasting colors, and unhinged but endearing visual style' : ''}
${selectedTone === 'romantic' ? '- Include romantic elements like soft lighting, hearts, flowers, or intimate scenes' : ''}
${selectedTone === 'professional' ? '- Keep visuals clean, sophisticated, and business-appropriate' : ''}
${selectedTone === 'playful' ? '- Include bright colors, dynamic poses, and energetic visual elements' : ''}
${selectedTone === 'elegant' ? '- Focus on sophisticated design, refined color palettes, and graceful compositions' : ''}
${referenceImageUrls.length > 0 ? `- Create cartoon/illustrated characters inspired by reference images - DO NOT make realistic depictions` : ''}

Create prompts that flow chronologically:

1. Front Cover (Opening Scene): BE GENUINELY CREATIVE AND UNIQUE! Include "${cardTypeForPrompt}" greeting text positioned safely in the center area (avoid top/bottom 10% of image). TEXT STYLE: Write the greeting text in beautiful, clearly readable handwritten cursive script that matches the elegant style used inside the card - legible, flowing, and graceful with natural character and warmth. ${referenceImageUrls.length > 0 ? `I have included ${referenceImageUrls.length > 1 ? 'multiple' : 'my own'} reference image${referenceImageUrls.length > 1 ? 's' : ''}. Create stylized cartoon/illustrated characters inspired by the reference image${referenceImageUrls.length > 1 ? 's' : ''} - DO NOT make realistic depictions of real people, instead create charming cartoon-style characters with simplified, friendly features.` : 'Create charming cartoon-style or stylized illustrated figures if people are needed for the theme.'} This is the story opening - introduce key visual elements (colors, motifs, artistic style) that will continue throughout the other sections. Think of something unexpected, innovative, and memorable that will surprise and delight the recipient. Avoid generic designs! Style: ${styleModifier}

2. ${!isFrontBackOnly ? `Left Interior (Story Development): UNLEASH YOUR CREATIVITY! You have complete creative freedom to design whatever you want for this left interior page! This is your artistic playground - create something genuinely innovative and unexpected that feels right for a ${cardTypeForPrompt} card with ${toneDescription} tone. You can include: scenes, landscapes, objects, patterns, quotes, text, illustrations, realistic art, abstract art, or anything else that inspires you - but NO PEOPLE or characters unless the user specifically mentioned wanting people in their card description. Position any text safely in center area (avoid top/bottom 10%). Think of something no one has done before! Surprise us with bold, imaginative, and memorable artistic choices while maintaining visual harmony with the overall card style and tone. Style: ${styleModifier}

3. Right Interior (Story Climax): BE CREATIVE WITH MESSAGE DESIGN! ${isHandwrittenMessage ? `Design with elegant writing space that complements the visual story from left interior. Position decorative elements safely away from top/bottom edges. Create innovative and artistic decorative elements, borders, or flourishes that are unique and memorable - NO PEOPLE or characters.` : `Include message text: "${messageContent}" positioned safely in center area (avoid top/bottom 10% of image) integrated into beautiful, innovative decorative artwork. HANDWRITING STYLE: Write the message in beautiful, clearly readable handwritten cursive script that feels elegant and personal. The handwriting should be legible, flowing, and have natural character - not overly perfect but graceful and warm. Use a nice pen-style appearance with natural ink flow and slight variations in line weight. Think of sophisticated calligraphy that's still approachable and easy to read. Make the handwriting feel genuine and heartfelt. Think beyond typical florals and patterns - create something unexpected and artistic that perfectly frames the handwritten message - NO PEOPLE or characters.`} This should feel like the emotional peak of the card experience, harmonizing with the left interior as a cohesive spread. Avoid cliché designs and create something genuinely special!${handwritingSampleUrl ? ' Match the provided handwriting style sample exactly.' : ' Use the elegant cursive handwriting style described above.'} Style: ${styleModifier}

4. ` : ''}Back Cover (Story Resolution): BE SUBTLY CREATIVE! Create a simple yet innovative decorative design that brings peaceful closure to the visual story. Reference subtle elements from the front cover but keep it minimal and serene - NO PEOPLE, just beautiful, unexpected artistic elements that go beyond typical patterns or florals. IMPORTANT: Leave the bottom-right corner area (approximately 1 inch square) completely clear and undecorated - this space should remain empty. Focus decorative elements toward the center and left side of the design. Think of something quietly beautiful and memorable that complements the overall design while being genuinely unique. This should feel like a peaceful, artistic ending that surprises with its subtle creativity. Style: ${styleModifier}

VISUAL CONTINUITY CHECKLIST:
- Same color palette across all sections
- Consistent lighting/time of day
- Same artistic techniques and brushwork
- Recurring visual motifs or symbols (but make them unique and memorable!)
- Progressive emotional journey from introduction to resolution
- Front cover: stylized cartoon/illustrated characters if people are needed for the theme
- Left interior: CREATIVE FREEDOM but NO PEOPLE unless user specifically requested people in their description
- Right interior: focus on message space with innovative decorative elements (NO PEOPLE)
- Back cover: simple yet creative decorative design without text or people
- Use simplified, friendly, charming character design if including people (front cover only)
- CREATIVITY PRIORITY: Always choose the more innovative, surprising, and memorable option over generic designs

Return JSON:
{
  "frontCover": "detailed prompt with story opening elements",
  "backCover": "detailed prompt with story conclusion elements"${!isFrontBackOnly ? ',\n  "leftInterior": "detailed prompt with story development elements",\n  "rightInterior": "detailed prompt with story climax elements"' : ''}
}`;

      let generatedPrompts;

      if (isDraftMode) {
        // For draft mode, get just the front cover prompt as plain text
        const frontCoverPrompt = await chatWithAI(promptGenerationQuery, {
          model: "gemini-2.5-pro",
          attachments: referenceImageUrls
        });

        if (!frontCoverPrompt?.trim()) {
          console.error("❌ Failed to generate front cover prompt:", frontCoverPrompt);
          throw new Error("Failed to generate front cover prompt");
        }

        generatedPrompts = {
          frontCover: frontCoverPrompt.trim()
        };
      } else {
        // For regular mode, get all prompts as JSON
        generatedPrompts = await chatWithAI(promptGenerationQuery, {
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
        console.error("❌ Failed to generate image prompts:", generatedPrompts);
        throw new Error("Failed to generate image prompts");
        }
      }
      
      console.log("✅ Generated prompts successfully:", { 
        isDraftMode, 
        draftIndex, 
        hasFrontCover: !!generatedPrompts.frontCover,
        hasBackCover: !!generatedPrompts.backCover
      });

      // Enhance front cover prompt with reference image instructions if available
      if (referenceImageUrls.length > 0 && modelToUse === "gpt-image-1") {
        generatedPrompts.frontCover = `${generatedPrompts.frontCover}\n\nCRITICAL CHARACTER REFERENCE INSTRUCTIONS: I have provided ${referenceImageUrls.length > 1 ? 'multiple reference photos' : 'a reference photo'} as input image${referenceImageUrls.length > 1 ? 's' : ''}. You MUST create cartoon/illustrated characters that accurately represent ONLY the people who are actually visible in ${referenceImageUrls.length > 1 ? 'these reference photos' : 'this reference photo'} with high fidelity to their appearance.

MANDATORY CHARACTER MATCHING REQUIREMENTS - ONLY INCLUDE WHAT IS ACTUALLY VISIBLE:
- REPRESENT ONLY PEOPLE ACTUALLY IN THE PHOTOS: Create cartoon versions of ONLY the people who are actually shown in the reference photos. Do NOT add, create, or imagine any additional people not present in the reference images.
- EXACT hair color, hair style, and hair length from each reference photo - only what is actually visible
- PRECISE facial features for each person: eye color, eye shape, nose shape, face structure, skin tone - exactly as shown in the reference
- ACCURATE clothing: replicate ONLY the EXACT clothing items, colors, patterns, and styles actually worn by each person in their reference photo - do not add or change any clothing items
- ACCESSORIES ONLY IF VISIBLE: Include accessories (glasses, jewelry, hats, watches, bags, etc.) ONLY if they are actually visible on each person in the reference photo. DO NOT add glasses if they are not wearing glasses in the photo. DO NOT add jewelry if they are not wearing jewelry in the photo. DO NOT add any accessories that are not clearly visible in the reference image.
- CORRECT body proportions and posture as shown for each person in their reference
- FAITHFUL age representation and gender presentation for each individual - exactly as they appear
- AUTHENTIC facial expressions and poses from the reference images, lean towards making the people look happier unless the user specifically asks for a different expression
- GROUP COMPOSITION: If multiple people are actually shown in the photos, arrange them naturally together in a pleasing composition that fits the card's theme

CRITICAL RESTRICTION: Do not add, remove, or modify any visual elements beyond what is actually visible in the reference photos. Only include people, clothing, and accessories that are clearly shown in the reference images.

${imageTransformation || 'Study every detail of the people actually in the reference image and recreate them as stylized cartoon characters while maintaining 100% accuracy to their distinctive visual features. The characters must be immediately recognizable as the same people from the reference photo. Pay special attention to clothing details and accessories that are actually visible, and unique personal style elements that make each person distinctive. Do not add or imagine any elements not present in the reference.'}

The cartoon style should be charming and artistic while preserving complete visual accuracy to the reference photo. Only represent people, clothing, and accessories that are actually visible in the reference images.`;
      }

      // Save job data to localStorage and server
      const jobData = {
        prompt: effectivePrompt,
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
      
      // Create job on server and start async generation
      setGenerationProgress("🚀 Starting background generation - you can safely leave this page!");
      
      // Prepare input images for reference photo support - only for GPT-1
      const inputImages: string[] = [];
      if (referenceImageUrls.length > 0 && modelToUse === "gpt-image-1") {
        inputImages.push(...referenceImageUrls);
        console.log("🔍 DEBUG: Added reference images to async generation:", referenceImageUrls);
        console.log("🔍 DEBUG: Total input images for async generation:", inputImages.length);
        console.log("🔍 DEBUG: Reference images should ALL go to front cover for character creation of multiple people");
      }

      console.log("🚀 Making API call to /api/generate-card-async:", { 
        isDraftMode, 
        draftIndex, 
        jobId, 
        modelToUse,
        quality: isDraftMode ? "low" : "high"
      });
      
      const response = await fetch('/api/generate-card-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          prompts: isDraftMode ? { frontCover: generatedPrompts.frontCover } : generatedPrompts, // Draft mode: front cover only
          config: {
            userNumber: "+17145986105",
            modelVersion: modelToUse,
            aspectRatio: paperConfig.aspectRatio,
            quality: isDraftMode ? "low" : "high", // GPT-1 forced to low quality for speed
            outputFormat: "jpeg",
            outputCompression: 100,
            moderation: "low",
            dimensions: paperConfig.dimensions,
            isFrontBackOnly,
            userEmail,
            cardType: cardTypeForPrompt,
            toField,
            fromField,
            isDraftMode: isDraftMode, // Add flag to help backend understand this is draft mode
            ...(inputImages.length > 0 && { 
              input_images: inputImages,
              input_images_mode: "front_cover_only" // All reference images should go to front cover for character creation
            })
          }
        })
      });
      
      console.log("📡 API response status:", response.status, response.ok);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log("📋 API response result:", result);
      
      if (result.status !== 'processing') {
        console.error("❌ API returned unexpected status:", result.status, result.message);
        throw new Error(result.message || 'Failed to start card generation');
      }

      console.log("✅ Job started successfully:", jobId);

      // Start polling for completion
      if (isDraftMode) {
        setGenerationProgress("✨ Creating draft generations...");
        console.log(`🔄 Starting polling for draft job ${jobId}`);
        // For draft mode, we'll handle polling differently if needed
        pollJobStatus(jobId);
      } else {
        setGenerationProgress("✨ Bringing your vision to life with artistic precision...");
        toast.success("🎉 Card generation started! You can leave this page and return later.");
        pollJobStatus(jobId);
      }

    } catch (error) {
      console.error(`❌ Card generation error (isDraftMode: ${isDraftMode}, draftIndex: ${draftIndex}):`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (isDraftMode) {
        toast.error(`Draft variation ${draftIndex + 1} failed: ${errorMessage}`);
        // For draft mode, we don't want to stop the entire generation process
        // The parent function will handle individual draft failures
      } else {
        toast.error(`Failed to start card generation: ${errorMessage}`);
        
        // Remove failed job from localStorage
        if (currentJobId) {
          removeJobFromStorage(currentJobId);
          setCurrentJobId(null);
        }
        
        setIsGenerating(false);
        setGenerationProgress("");
      }
    }
  };

  // Wrapper function for regular card generation (used as click handler)
  const handleGenerateCardAsync = async () => {
    return handleGenerateCardAsyncInternal({});
  };

  // Original synchronous card generation (keep as fallback)
  const handleGenerateCard = async () => {
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

    // Create job tracking
    const jobId = uuidv4();
    setCurrentJobId(jobId);
    
    // Save job to localStorage and server
    const jobData = {
      prompt: prompt.trim() || `A beautiful ${selectedType === "custom" ? customCardType : selectedType} card`,
      selectedType,
      customCardType,
      selectedTone,
      finalCardMessage,
      toField,
      fromField,
      userEmail,
      selectedArtisticStyle,
      customStyleDescription,
      selectedImageModel,
      isFrontBackOnly,
      numberOfCards,
      selectedPaperSize
    };
    saveJobToStorage(jobId, jobData);
    
    // Also save to server
    try {
      await fetch('/api/create-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, jobData })
      });
    } catch (error) {
      console.error('Failed to create server job:', error);
      // Continue anyway - localStorage tracking will still work
    }

    // Initialize progress tracking
    setGenerationProgress("Analyzing your request...");
    setProgressPercentage(5);

    // Reset section loading states
    setSectionLoadingStates({
      frontCover: 'idle',
      backCover: 'idle',
      leftInterior: 'idle',
      rightInterior: 'idle',
    });

    // Use custom card type if selected, otherwise use the standard type
    const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
    const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
    const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";

    // Use a default prompt if none provided
    const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;

    let messageContent = finalCardMessage;
    
    // Handle handwritten message case
    if (isHandwrittenMessage) {
      messageContent = "[Blank space for handwritten message]";
    } else if (!messageContent.trim() && !isFrontBackOnly) {
      // Auto-generate message if empty (but not for front/back only cards)
      setGenerationProgress("✍️ Penning the perfect words just for you...");
      setIsGeneratingMessage(true); // Show "Crafting the perfect message..." in button
      
      // Update progress for message generation
      setGenerationProgress("Creating your message...");
      try {
        const autoMessagePrompt = `Create a ${toneDescription} message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${effectivePrompt}"
${toField ? `Recipient: ${toField}` : "Recipient: [not specified]"}
${fromField ? `Sender: ${fromField}` : "Sender: [not specified]"}
Card Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}

Instructions:
- Write a message that is ${toneDescription} and feels personal and genuine
- ${toField ? `Address the message to ${toField} directly, using their name naturally` : "Write in a way that could be personalized to any recipient"}
- ${fromField ? `Write as if ${fromField} is personally writing this message` : `Write in a ${toneDescription} tone`}
- Match the ${toneDescription} tone and occasion of the ${cardTypeForPrompt} card type
- Be inspired by the theme: "${prompt}"
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

        const generatedMessage = await chatWithAI(autoMessagePrompt, {
          model: "gemini-2.5-pro",
          includeThoughts: false  // Don't include thinking content in message generation
        });
        if (generatedMessage?.trim()) {
          // Extract message content between <MESSAGE> tags using regex
          const messageMatch = generatedMessage.match(/<MESSAGE>([\s\S]*?)<\/MESSAGE>/);
          let extractedMessage = messageMatch ? messageMatch[1].trim() : generatedMessage.trim();
          
          // Ensure no MESSAGE tags are included in the final message
          extractedMessage = extractedMessage.replace(/<\/?MESSAGE>/g, '').trim();
          
          messageContent = extractedMessage;
          setFinalCardMessage(messageContent);
          setGenerationProgress("✅ Perfect message crafted! Now for the magic visuals...");
          toast.success("✨ Generated a personalized message for your card!");
        } else {
          messageContent = effectivePrompt;
        }
        setIsGeneratingMessage(false); // Reset message generation state
        
        // Message generation complete
      } catch {
        messageContent = effectivePrompt;
        setIsGeneratingMessage(false); // Reset message generation state on error
      }
    }

    // Determine which model to use based on mode
    const modelToUse = isDraftMode ? selectedDraftModel : selectedImageModel;

    // Validate reference images with model compatibility
    if (referenceImageUrls.length > 0 && modelToUse !== "gpt-image-1") {
      const modeText = isDraftMode ? "draft mode" : "final generation";
      toast.error(`Reference photos are only supported with GPT Image 1 model. Please switch to GPT Image 1 for ${modeText} or remove reference photos.`);
      return;
    }

    // Only set global generating state if not in draft mode (draft mode manages its own state)
    if (!isDraftMode) {
      setIsGenerating(true);
      startElapsedTimeTracking(undefined, 120); // 120 seconds for regular card generation  
      setGenerationProgress("Creating your personalized card...");
      setProgressPercentage(0);
    }
    
    // Generate unique card ID for URL
    const cardId = uuidv4();
    setCurrentCardId(cardId);
    const cardUrl = `${BACKEND_API_BASE_URL}/card/${cardId}`;
    
    // Reset cards state
    setGeneratedCards([]);
    setSelectedCardIndex(0);
    
    try {
      // Get style details
      setGenerationProgress("🎨 Applying your artistic style...");
      const selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
      let styleModifier = selectedStyle ? selectedStyle.promptModifier : "";
      
      // Handle AI Smart Style - let AI choose the best style
      if (selectedArtisticStyle === "ai-smart-style") {
        setGenerationProgress("✨ Style experts selecting the perfect look...");
        
        // Style selection progress
        
        try {
          const styleSelectionPrompt = `You are an expert art director specializing in beautiful, heartfelt greeting cards. Your job is to choose the perfect artistic style that will create a warm, emotional, and memorable card.

Card Details:
- Type: ${cardTypeForPrompt}
- Theme/Description: "${effectivePrompt}"
${toField ? `- Recipient: ${toField}` : ""}
${fromField ? `- Sender: ${fromField}` : ""}
${referenceImageUrls.length > 0 ? `- Has ${referenceImageUrls.length} reference photo${referenceImageUrls.length > 1 ? 's' : ''} for transformation` : ""}
${isHandwrittenMessage ? `- Will have handwritten message` : `- Message: "${finalCardMessage}"`}

IMPORTANT GUIDELINES:
- Choose styles that are WARM, EMOTIONAL, and PERSONAL (greeting cards are about human connection)
- AVOID: robots, tech, cyberpunk, futuristic, sci-fi, digital, mechanical themes
- PREFER: watercolor, oil painting, hand-drawn, illustrated, artistic, painterly, natural, organic styles
- Consider the emotional tone: joyful, loving, celebratory, peaceful, artistic
- Think about what would make someone smile when they receive this card

Great card styles include:
- Watercolor illustrations with soft, flowing colors
- Hand-painted artwork with visible brushstrokes
- Charming illustrated characters and scenes
- Beautiful botanical and nature themes
- Vintage artistic styles with character
- Warm, inviting color palettes
- Artistic techniques that feel handmade and personal

Choose ONE artistic style that perfectly matches this ${cardTypeForPrompt} card's emotional purpose. Respond with:
"in [detailed artistic style description focusing on warmth, beauty, and emotional appeal]"

Make it feel like something created with love for someone special.`;

          const aiSelectedStyle = await chatWithAI(styleSelectionPrompt, {
            model: "gemini-2.5-pro",
            includeThoughts: false  // Don't include thinking content for style selection
          });

          if (aiSelectedStyle?.trim()) {
            styleModifier = aiSelectedStyle.trim();
            setGenerationProgress("✨ Perfect style chosen! Time to bring your card to life...");
            toast.success("🎨 Perfect artistic style chosen for your card!");
          } else {
            // Fallback to a beautiful default style
            styleModifier = "in a sophisticated artistic style with harmonious colors, elegant composition, and beautiful visual elements perfectly suited for this special card";
          }
        } catch (error) {
          console.error('Style selection failed:', error);
          // Fallback to a beautiful default style
          styleModifier = "in a sophisticated artistic style with harmonious colors, elegant composition, and beautiful visual elements perfectly suited for this special card";
          toast.info("Using a beautiful default style for your card");
        }
      }
      // Use custom style description if custom style is selected
      else if (selectedArtisticStyle === "custom" && customStyleDescription.trim()) {
        styleModifier = `in ${customStyleDescription.trim()}`;
      } else if (selectedArtisticStyle === "custom" && !customStyleDescription.trim()) {
        // Fallback to default if custom is selected but no description provided
        styleModifier = "in artistic style with creative and unique visual elements";
      }
      
      // Get paper size configuration
      const paperConfig = paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0];
      
      // Generate multiple unique prompt sets for each card
      setGenerationProgress(`🎯 Crafting ${numberOfCards} masterpiece design${numberOfCards > 1 ? 's' : ''}...`);
      
      // Create the base prompt generation query that will be used for each card variant
      const legacyPromptGenerationQuery = `Create ${isFrontBackOnly ? '2' : '4'} prompts for a cohesive, chronologically flowing ${cardTypeForPrompt} greeting card that tells a visual story (${paperConfig.aspectRatio} ratio):

🎨 CREATIVITY MANDATE: Be genuinely creative, unique, and innovative! Avoid generic or cliché designs. Think outside the box, surprise with unexpected elements, use bold artistic choices, and create something truly memorable and special. Push creative boundaries while staying appropriate for the card type and tone.

Theme: "${effectivePrompt}"
Style: ${selectedStyle?.label || "Default"}
Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
${!isFrontBackOnly ? `Message: "${messageContent}"` : ""}
${isHandwrittenMessage ? "Note: Include space for handwritten message" : ""}
${referenceImageUrls.length > 0 ? `Reference Photos: I have attached ${referenceImageUrls.length} reference photo${referenceImageUrls.length > 1 ? 's' : ''} for you to analyze. Please look at ${referenceImageUrls.length > 1 ? 'these photos' : 'this photo'} to understand what the people look like - their hair color/style, facial features, clothing, accessories, body type, age, etc. Use this visual information to create accurate cartoon/illustrated versions of ${referenceImageUrls.length > 1 ? 'these people' : 'this person'} in the prompts.
Transformation instructions: "${imageTransformation || 'Create stylized cartoon characters that accurately represent the people in the reference photos while maintaining their distinctive features'}"` : ""}

CRITICAL: Create a cohesive visual narrative that flows chronologically through the card experience:
1. FRONT COVER: First impression - sets the scene/introduces the story
2. INTERIOR SPREAD: The heart of the experience - continuation and climax of the visual story
3. BACK COVER: Conclusion - peaceful resolution or complementary ending

Requirements:
- Flat 2D artwork for printing (not 3D card images)
- Full-bleed backgrounds extending to edges
- IMPORTANT: Keep text, faces, and key elements at least 10% away from top/bottom edges (small amount may be cropped in printing)
- Keep text/faces 0.5" from left/right edges for safe printing
- CONSISTENT visual elements throughout: same characters, color palette, lighting, art style
- Progressive visual storytelling from front → interior → back
- Put any text in quotes and make it clear/readable
- Each section should feel like part of the same artistic universe
- TONE: Ensure the visual mood and atmosphere matches the ${toneDescription} tone throughout all sections
- INTELLECTUAL PROPERTY SAFETY: If the user mentions specific characters, brands, logos, or products, automatically replace them with original generic alternatives in your prompts. For example: replace specific character names with "cartoon mouse character" or "superhero character", replace brand names with "colorful cereal" or "sports car", etc. Create inspired-by designs that capture the essence without referencing any protected names or specific copyrighted elements. Never include actual brand names, character names, or trademarked terms in the image generation prompts
- CONTENT SAFETY: Ensure all prompts are family-friendly and appropriate for greeting cards. Avoid any content that could be flagged by safety systems including: violence, weapons, inappropriate imagery, political content, controversial topics, scary or disturbing elements, or anything not suitable for all ages. If the user requests something potentially inappropriate, redirect to positive, wholesome alternatives that capture their intent in a family-friendly way
${selectedTone === 'funny' ? '- Include visual humor, playful elements, and whimsical details' : ''}
${selectedTone === 'genz-humor' ? '- Include GenZ visual elements like chaotic energy, internet meme references, bold contrasting colors, and unhinged but endearing visual style' : ''}
${selectedTone === 'romantic' ? '- Include romantic elements like soft lighting, hearts, flowers, or intimate scenes' : ''}
${selectedTone === 'professional' ? '- Keep visuals clean, sophisticated, and business-appropriate' : ''}
${selectedTone === 'playful' ? '- Include bright colors, dynamic poses, and energetic visual elements' : ''}
${selectedTone === 'elegant' ? '- Focus on sophisticated design, refined color palettes, and graceful compositions' : ''}
${referenceImageUrls.length > 0 ? `- Create cartoon/illustrated characters inspired by reference images - DO NOT make realistic depictions` : ''}

Create prompts that flow chronologically:

1. Front Cover (Opening Scene): BE GENUINELY CREATIVE AND UNIQUE! Include "${cardTypeForPrompt}" greeting text positioned safely in the center area (avoid top/bottom 10% of image). TEXT STYLE: Write the greeting text in beautiful, clearly readable handwritten cursive script that matches the elegant style used inside the card - legible, flowing, and graceful with natural character and warmth. ${referenceImageUrls.length > 0 ? `I have included ${referenceImageUrls.length > 1 ? 'multiple' : 'my own'} reference image${referenceImageUrls.length > 1 ? 's' : ''}. Create stylized cartoon/illustrated characters inspired by the reference image${referenceImageUrls.length > 1 ? 's' : ''} - DO NOT make realistic depictions of real people, instead create charming cartoon-style characters with simplified, friendly features.` : 'Create charming cartoon-style or stylized illustrated figures if people are needed for the theme.'} This is the story opening - introduce key visual elements (colors, motifs, artistic style) that will continue throughout the other sections. Think of something unexpected, innovative, and memorable that will surprise and delight the recipient. Avoid generic designs! Style: ${styleModifier}

2. ${!isFrontBackOnly ? `Left Interior (Story Development): UNLEASH YOUR CREATIVITY! You have complete creative freedom to design whatever you want for this left interior page! This is your artistic playground - create something genuinely innovative and unexpected that feels right for a ${cardTypeForPrompt} card with ${toneDescription} tone. You can include: scenes, landscapes, objects, patterns, quotes, text, illustrations, realistic art, abstract art, or anything else that inspires you - but NO PEOPLE or characters unless the user specifically mentioned wanting people in their card description. Position any text safely in center area (avoid top/bottom 10%). Think of something no one has done before! Surprise us with bold, imaginative, and memorable artistic choices while maintaining visual harmony with the overall card style and tone. Style: ${styleModifier}

3. Right Interior (Story Climax): BE CREATIVE WITH MESSAGE DESIGN! ${isHandwrittenMessage ? `Design with elegant writing space that complements the visual story from left interior. Position decorative elements safely away from top/bottom edges. Create innovative and artistic decorative elements, borders, or flourishes that are unique and memorable - NO PEOPLE or characters.` : `Include message text: "${messageContent}" positioned safely in center area (avoid top/bottom 10% of image) integrated into beautiful, innovative decorative artwork. HANDWRITING STYLE: Write the message in beautiful, clearly readable handwritten cursive script that feels elegant and personal. The handwriting should be legible, flowing, and have natural character - not overly perfect but graceful and warm. Use a nice pen-style appearance with natural ink flow and slight variations in line weight. Think of sophisticated calligraphy that's still approachable and easy to read. Make the handwriting feel genuine and heartfelt. Think beyond typical florals and patterns - create something unexpected and artistic that perfectly frames the handwritten message - NO PEOPLE or characters.`} This should feel like the emotional peak of the card experience, harmonizing with the left interior as a cohesive spread. Avoid cliché designs and create something genuinely special!${handwritingSampleUrl ? ' Match the provided handwriting style sample exactly.' : ' Use the elegant cursive handwriting style described above.'} Style: ${styleModifier}

4. ` : ''}Back Cover (Story Resolution): BE SUBTLY CREATIVE! Create a simple yet innovative decorative design that brings peaceful closure to the visual story. Reference subtle elements from the front cover but keep it minimal and serene - NO PEOPLE, just beautiful, unexpected artistic elements that go beyond typical patterns or florals. IMPORTANT: Leave the bottom-right corner area (approximately 1 inch square) completely clear and undecorated - this space should remain empty. Focus decorative elements toward the center and left side of the design. Think of something quietly beautiful and memorable that complements the overall design while being genuinely unique. This should feel like a peaceful, artistic ending that surprises with its subtle creativity. Style: ${styleModifier}

VISUAL CONTINUITY CHECKLIST:
- Same color palette across all sections
- Consistent lighting/time of day
- Same artistic techniques and brushwork
- Recurring visual motifs or symbols (but make them unique and memorable!)
- Progressive emotional journey from introduction to resolution
- Front cover: stylized cartoon/illustrated characters if people are needed for the theme
- Left interior: CREATIVE FREEDOM but NO PEOPLE unless user specifically requested people in their description
- Right interior: focus on message space with innovative decorative elements (NO PEOPLE)
- Back cover: simple yet creative decorative design without text or people
- Use simplified, friendly, charming character design if including people (front cover only)
- CREATIVITY PRIORITY: Always choose the more innovative, surprising, and memorable option over generic designs

Return JSON:
{
  "frontCover": "detailed prompt with story opening elements",
  "backCover": "detailed prompt with story conclusion elements"${!isFrontBackOnly ? ',\n  "leftInterior": "detailed prompt with story development elements",\n  "rightInterior": "detailed prompt with story climax elements"' : ''}
}`;

      // Generate multiple unique prompt sets in parallel
      const promptGenerationPromises = Array.from({ length: numberOfCards }, (_, cardIndex) => {
        const uniquePromptQuery = legacyPromptGenerationQuery + `

🎨 CARD VARIANT ${cardIndex + 1} CREATIVE DIRECTION: 
Create a completely unique visual interpretation that's distinctly different from other possible variants. Use different:
- Color palettes and mood lighting
- Artistic composition and layout approaches  
- Creative visual metaphors and symbols
- Character designs and poses (if applicable)
- Background elements and settings
- Typography styles and text placement
- Overall creative theme while keeping same core message

Make this card variant stand out as its own unique artistic vision!

Return JSON:
{
  "frontCover": "detailed prompt with story opening elements",
  "backCover": "detailed prompt with story conclusion elements"${!isFrontBackOnly ? ',\n  "leftInterior": "detailed prompt with story development elements",\n  "rightInterior": "detailed prompt with story climax elements"' : ''}
}`;

        return chatWithAI(uniquePromptQuery, {
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
          includeThoughts: false,  // Don't include thinking content for prompt generation
          attachments: referenceImageUrls  // Pass reference images to AI for better prompt generation
        });
      });

      // Wait for all prompt generations to complete
      const allGeneratedPrompts = await Promise.all(promptGenerationPromises);
      
      setGenerationProgress(`✅ ${numberOfCards} brilliant design${numberOfCards > 1 ? 's' : ''} ready! Now painting them into reality...`);

      // Generate all images in parallel
      setGenerationProgress(`🖼️ Generating your ${numberOfCards} card${numberOfCards > 1 ? 's' : ''} with ${isFrontBackOnly ? '2' : '4'} images each...`);
      
      // Starting image generation
      
      // Set section states to loading
      setSectionLoadingStates({
        frontCover: 'loading',
        backCover: 'idle',
        leftInterior: isFrontBackOnly ? 'idle' : 'idle',
        rightInterior: isFrontBackOnly ? 'idle' : 'idle',
      });
      
      // Prepare input images for each section
      const frontCoverInputImages: string[] = [];
      const backCoverInputImages: string[] = [];
      const leftInteriorInputImages: string[] = [];
      const rightInteriorInputImages: string[] = [];
      
      // Handle reference images - only for models with direct image support
      if (referenceImageUrls.length > 0 && modelToUse === "gpt-image-1") {
        // GPT-1 supports direct image input - pass reference images directly
        frontCoverInputImages.push(...referenceImageUrls);
        console.log("🔍 DEBUG: Added reference images to frontCoverInputImages:", referenceImageUrls);
        console.log("🔍 DEBUG: frontCoverInputImages length:", frontCoverInputImages.length);
        setGenerationProgress(`✨ Reference photos will be used directly for character creation...`);
        toast.success(`📸 ${referenceImageUrls.length} reference photo${referenceImageUrls.length > 1 ? 's' : ''} ready for character creation!`);
      }
      
      if (modelToUse === "gpt-image-1") {
        // Add handwriting sample to right interior for message styling
        if (handwritingSampleUrl && !isFrontBackOnly) {
          rightInteriorInputImages.push(handwritingSampleUrl);
        }
      }
        
        // Create payloads for all cards with their unique prompts
      const allCardPayloads: any[] = [];
      
      // Create payloads for each card with its unique prompts
      allGeneratedPrompts.forEach((generatedPrompts, cardIndex) => {
        // Enhance front cover prompt with reference image instructions if available
        let enhancedFrontCoverPrompt = generatedPrompts.frontCover;
        if (referenceImageUrls.length > 0 && modelToUse === "gpt-image-1") {
          // GPT-1 with direct image input - focus on character creation
          enhancedFrontCoverPrompt = `${generatedPrompts.frontCover}\n\nCRITICAL CHARACTER REFERENCE INSTRUCTIONS: I have provided ${referenceImageUrls.length > 1 ? 'multiple reference photos' : 'a reference photo'} as input image${referenceImageUrls.length > 1 ? 's' : ''}. You MUST create cartoon/illustrated characters that accurately represent ONLY the people who are actually visible in ${referenceImageUrls.length > 1 ? 'these reference photos' : 'this reference photo'} with high fidelity to their appearance.

MANDATORY CHARACTER MATCHING REQUIREMENTS - ONLY INCLUDE WHAT IS ACTUALLY VISIBLE:
- REPRESENT ONLY PEOPLE ACTUALLY IN THE PHOTOS: Create cartoon versions of ONLY the people who are actually shown in the reference photos. Do NOT add, create, or imagine any additional people not present in the reference images.
- EXACT hair color, hair style, and hair length from the reference photo - only what is actually visible
- PRECISE facial features: eye color, eye shape, nose shape, face structure, skin tone - exactly as shown in the reference
- ACCURATE clothing: replicate ONLY the EXACT clothing items, colors, patterns, and styles actually worn in the reference photo - do not add or change any clothing items
- ACCESSORIES ONLY IF VISIBLE: Include accessories (glasses, jewelry, hats, watches, bags, etc.) ONLY if they are actually visible on each person in the reference photo. DO NOT add glasses if they are not wearing glasses in the photo. DO NOT add jewelry if they are not wearing jewelry in the photo. DO NOT add any accessories that are not clearly visible in the reference image.
- CORRECT body proportions and posture as shown in the reference
- FAITHFUL age representation and gender presentation - exactly as they appear
- AUTHENTIC facial expressions and poses from the reference image, lean towards making the people look happier unless the user specifically asks for a different expression.
- GROUP COMPOSITION: If multiple people are actually shown in the photos, arrange them naturally together in a pleasing composition that fits the card's theme

CRITICAL RESTRICTION: Do not add, remove, or modify any visual elements beyond what is actually visible in the reference photos. Only include people, clothing, and accessories that are clearly shown in the reference images.

${imageTransformation || 'Study every detail of the people actually in the reference image and recreate them as stylized cartoon characters while maintaining 100% accuracy to their distinctive visual features. The characters must be immediately recognizable as the same people from the reference photo. Pay special attention to clothing details and accessories that are actually visible, and unique personal style elements that make each person distinctive. Do not add or imagine any elements not present in the reference.'}

The cartoon style should be charming and artistic while preserving complete visual accuracy to the reference photo. Only represent people, clothing, and accessories that are actually visible in the reference images.`;
        }
        
        const cardPayloads = [
          {
            tool_name: "generate_images_with_prompts",
            arguments: {
                              user_number: "+17145986105",
                prompts: [enhancedFrontCoverPrompt],
                model_version: modelToUse,
                aspect_ratio: paperConfig.aspectRatio,
                quality: isDraftMode ? "low" : "high", // GPT-1 forced to low quality for speed
                output_format: "jpeg",
                output_compression: 100,
                moderation: "low",
                ...(frontCoverInputImages.length > 0 && { input_images: frontCoverInputImages }),
                // Debug logging
                ...(() => {
                  if (frontCoverInputImages.length > 0) {
                    console.log("🔍 DEBUG: Sending input_images to MCP:", frontCoverInputImages);
                  }
                  return {};
                })()
            },
            user_id_context: "+17145986105",
            cardIndex,
            sectionIndex: 0,
            sectionName: "Front Cover"
          },
          {
            tool_name: "generate_images_with_prompts",
            arguments: {
              user_number: "+17145986105",
              prompts: [generatedPrompts.backCover],
              model_version: modelToUse,
              aspect_ratio: paperConfig.aspectRatio,
              quality: isDraftMode ? "low" : "high", // GPT-1 forced to low quality for speed
              output_format: "jpeg",
              output_compression: 100,
              moderation: "low",
              ...(backCoverInputImages.length > 0 && { input_images: backCoverInputImages })
            },
            user_id_context: "+17145986105",
            cardIndex,
            sectionIndex: 1,
            sectionName: "Back Cover"
          }
        ];

        // Add interior images if not front/back only
        if (!isFrontBackOnly && generatedPrompts.leftInterior && generatedPrompts.rightInterior) {
          cardPayloads.push(
            {
              tool_name: "generate_images_with_prompts",
              arguments: {
                user_number: "+17145986105",
                prompts: [generatedPrompts.leftInterior],
                model_version: modelToUse,
                aspect_ratio: paperConfig.aspectRatio,
                quality: isDraftMode ? "low" : "high", // GPT-1 forced to low quality for speed
                output_format: "jpeg",
                output_compression: 100,
                moderation: "low",
                ...(leftInteriorInputImages.length > 0 && { input_images: leftInteriorInputImages })
              },
              user_id_context: "+17145986105",
              cardIndex,
              sectionIndex: 2,
              sectionName: "Left Interior"
            },
            {
              tool_name: "generate_images_with_prompts",
              arguments: {
                user_number: "+17145986105",
                prompts: [generatedPrompts.rightInterior],
                model_version: modelToUse,
                aspect_ratio: paperConfig.aspectRatio,
                quality: isDraftMode ? "low" : "high", // GPT-1 forced to low quality for speed
                output_format: "jpeg",
                output_compression: 100,
                moderation: "low",
                ...(rightInteriorInputImages.length > 0 && { input_images: rightInteriorInputImages })
              },
              user_id_context: "+17145986105",
              cardIndex,
              sectionIndex: 3,
              sectionName: "Right Interior"
            }
          );
        }
        
        allCardPayloads.push(...cardPayloads);
      });

      // Track image completion per card
      const completedImages = new Map<string, string>();
      let completedCount = 0;
      const completedCards: GeneratedCard[] = [];
      
      // Clear any existing cards during generation
      setGeneratedCards([]);
      setGeneratedCard(null);
      setSelectedCardIndex(0);
      setGenerationProgress(`🎨 Artists at work! Creating ${allCardPayloads.length} stunning images for your ${numberOfCards} card${numberOfCards > 1 ? 's' : ''}...`);
      
      // Start 2:30 countdown now that we're actually generating images
      setCountdown(150);
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setCountdownInterval(interval);

      // Helper function to regenerate prompt if blocked by safety system
      const regeneratePromptIfNeeded = async (originalPrompt: string, sectionName: string) => {
        try {
          const regenerationQuery = `The following image prompt was blocked by the safety system. Please rewrite it to be more appropriate while keeping the same artistic intent and style:

BLOCKED PROMPT: "${originalPrompt}"

Requirements:
- Keep the same artistic style and visual goals
- Remove any content that might trigger safety filters
- Maintain the full-bleed design requirements
- IMPORTANT: Keep text, faces, and key elements at least 10% away from top/bottom edges (small amount may be cropped in printing)
- Focus on safe, family-friendly imagery
- Keep the same color palette and mood
- Ensure it's appropriate for a greeting card

Return only the rewritten prompt, no explanations.`;

          const newPrompt = await chatWithAI(regenerationQuery, {
            model: "gemini-2.5-pro",
            includeThoughts: false  // Don't include thinking content for prompt regeneration
          });
          
          return newPrompt?.trim() || originalPrompt;
        } catch (error) {
          console.error('Failed to regenerate prompt:', error);
          return originalPrompt;
        }
      };


      // Helper function to process a single image with retry logic
      const processSingleImage = async (payload: any, index: number, sectionName: string, cardIndex: number = 0) => {
        let currentPayload = payload;
        let retryCount = 0;
        const maxRetries = 2;
        let hasTriedTextFallback = false;
        
        while (retryCount <= maxRetries) {
          try {
            const response = await fetch(`${BACKEND_API_BASE_URL}/internal/call_mcp_tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(currentPayload),
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            
            // Check for safety system error
            if (result.result && typeof result.result === 'string') {
              const parsedResult = JSON.parse(result.result);
              if (parsedResult.status === 'error' && parsedResult.results?.[0]?.error?.includes('moderation_blocked')) {
                if (retryCount < maxRetries) {
                  // Regenerate prompt and retry
                  const originalPrompt = currentPayload.arguments.prompts[0];
                  const newPrompt = await regeneratePromptIfNeeded(originalPrompt, sectionName);
                  
                  currentPayload = {
                    ...currentPayload,
                    arguments: {
                      ...currentPayload.arguments,
                      prompts: [newPrompt]
                    }
                  };
                  
                  retryCount++;
                  continue;
                } else {
                  throw new Error(`Safety system blocked ${sectionName} after ${maxRetries} attempts`);
                }
              }
              
              // Reference image analysis is now done upfront, so no fallback needed
            }
            
            if (result.error && result.error !== "None" && result.error !== null) {
              throw new Error(result.error);
            }

            // Parse and extract image URL
            const data = JSON.parse(result.result);
            if (data.status !== "success") {
              throw new Error(`${sectionName} generation failed`);
            }
            
            const imageUrl = Array.isArray(data.results[0]) ? data.results[0][0] : data.results[0];
            
            // Track completed images per card
            const imageKey = `${cardIndex}-${index}`;
            completedImages.set(imageKey, imageUrl);
            
            completedCount++;
            const totalImages = allCardPayloads.length;
            setGenerationProgress(`🎨 ${completedCount}/${totalImages} masterpieces complete! Just finished Card ${cardIndex + 1} ${sectionName}...`);
            
            // Update section loading states and progress
            const progressPercentage = 30 + Math.floor((completedCount / totalImages) * 50); // 30-80% for image generation
            
            // Update individual section states
            setSectionLoadingStates(prev => {
              const newState = { ...prev };
              if (sectionName === "Front Cover") {
                newState.frontCover = 'completed';
              } else if (sectionName === "Back Cover") {
                newState.backCover = 'completed';
              } else if (sectionName === "Left Interior") {
                newState.leftInterior = 'completed';
              } else if (sectionName === "Right Interior") {
                newState.rightInterior = 'completed';
              }
              return newState;
            });
            
            // Section completion logged
            
            // Check if this card is now complete
            const sectionsPerCard = isFrontBackOnly ? 2 : 4;
            const cardStartIndex = cardIndex * sectionsPerCard;
            const cardEndIndex = cardStartIndex + sectionsPerCard - 1;
            
            let isCardComplete = true;
            for (let i = cardStartIndex; i <= cardEndIndex; i++) {
              const checkKey = `${cardIndex}-${i - cardStartIndex}`;
              if (!completedImages.has(checkKey)) {
                isCardComplete = false;
                break;
              }
            }
            
            // If card is complete, update the cards state
            if (isCardComplete) {
              setGeneratedCards(prevCards => {
                const updatedCards = [...prevCards];
                
                // Create new card object if it doesn't exist
                if (!updatedCards[cardIndex]) {
                  updatedCards[cardIndex] = {
                    id: `card-${cardIndex}-${Date.now()}`,
                    prompt: prompt,
                    frontCover: "",
                    backCover: "",
                    leftPage: "",
                    rightPage: "",
                    createdAt: new Date()
                  };
                }
                
                                const updatedCard: GeneratedCard = { ...updatedCards[cardIndex] };
                
                // Set all images for this completed card
                updatedCard.frontCover = completedImages.get(`${cardIndex}-0`) || "";
                updatedCard.backCover = completedImages.get(`${cardIndex}-1`) || "";
                
                if (!isFrontBackOnly) {
                  updatedCard.leftPage = completedImages.get(`${cardIndex}-2`) || "";
                  updatedCard.rightPage = completedImages.get(`${cardIndex}-3`) || "";
                } else {
                  // Set fallbacks for front/back only mode
                  updatedCard.leftPage = updatedCard.backCover;
                  updatedCard.rightPage = updatedCard.frontCover;
                }

                // Update prompt to use effective prompt
                updatedCard.prompt = effectivePrompt;

                // Store the generated prompts for factory use
                updatedCard.generatedPrompts = {
                  frontCover: allGeneratedPrompts[cardIndex].frontCover,
                  backCover: allGeneratedPrompts[cardIndex].backCover,
                  leftInterior: !isFrontBackOnly ? allGeneratedPrompts[cardIndex].leftInterior : undefined,
                  rightInterior: !isFrontBackOnly ? allGeneratedPrompts[cardIndex].rightInterior : undefined,
                };

                updatedCards[cardIndex] = updatedCard;
                
                // Store completed card locally for email use
                completedCards[cardIndex] = updatedCard;
                
                // If this is the first completed card or the selected card, set it as main display
                if (!generatedCard || cardIndex === selectedCardIndex) {
                  setGeneratedCard(updatedCard);
                }
                
                return updatedCards;
              });
              
              toast.success(`🎉 Card ${cardIndex + 1} is complete and ready!`);
            }
            
            return imageUrl;
            
          } catch (error) {
            if (retryCount === maxRetries) {
              throw new Error(`Failed to generate ${sectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            retryCount++;
          }
        }
      };

      // Start all image generations in parallel (all cards, all sections) with unique prompts
      const imagePromises = allCardPayloads.map((payload) => 
        processSingleImage(payload, payload.sectionIndex, payload.sectionName, payload.cardIndex)
      );

      // Wait for all to complete
      await Promise.all(imagePromises);

      // Finalizing images

      // Build final cards from completed images for email use
      const finalCards: GeneratedCard[] = [];
      for (let cardIndex = 0; cardIndex < numberOfCards; cardIndex++) {
        const card: GeneratedCard = {
          id: `card-${cardIndex}-${Date.now()}`,
          prompt: effectivePrompt,
          frontCover: completedImages.get(`${cardIndex}-0`) || "",
          backCover: completedImages.get(`${cardIndex}-1`) || "",
          leftPage: isFrontBackOnly ? (completedImages.get(`${cardIndex}-1`) || "") : (completedImages.get(`${cardIndex}-2`) || ""),
          rightPage: isFrontBackOnly ? (completedImages.get(`${cardIndex}-0`) || "") : (completedImages.get(`${cardIndex}-3`) || ""),
          createdAt: new Date(),
          // Include the generated prompts for factory use
          generatedPrompts: {
            frontCover: allGeneratedPrompts[cardIndex].frontCover,
            backCover: allGeneratedPrompts[cardIndex].backCover,
            leftInterior: !isFrontBackOnly ? allGeneratedPrompts[cardIndex].leftInterior : undefined,
            rightInterior: !isFrontBackOnly ? allGeneratedPrompts[cardIndex].rightInterior : undefined,
          }
        };
        finalCards.push(card);
      }

      // Apply QR codes to all cards' back covers
      setGenerationProgress("✨ Adding interactive QR codes to your cards...");
      console.log('🔄 Starting QR overlay process for', finalCards.length, 'cards');
      console.log('🔗 Card URL:', cardUrl);
      
      for (let i = 0; i < finalCards.length; i++) {
        console.log(`🎯 Processing card ${i + 1}:`, {
          hasBackCover: !!finalCards[i].backCover,
          hasCardUrl: !!cardUrl,
          backCoverLength: finalCards[i].backCover?.length
        });
        
        // QR code will be applied after successful API storage
      }

      // Display cards will be updated after successful API storage and QR code application

      setGenerationProgress("✅ Card completed, preview down below!");
      setIsCardCompleted(true);
      
      // Generation complete
      setProgressPercentage(100);
      setGenerationProgress("Generation complete!");

      // Complete and remove job from localStorage and server
      if (currentJobId) {
        // Store completion result on server
        try {
          await fetch('/api/store-job-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: currentJobId,
              status: 'completed',
              cardData: generatedCards[0] || generatedCard
            })
          });
        } catch (error) {
          console.error('Failed to store job result on server:', error);
        }
        
        removeJobFromStorage(currentJobId);
        setCurrentJobId(null);
      }
      
      if (numberOfCards === 1) {
        toast.success("🎉 Your complete card with QR code is ready!");
      } else {
        toast.success(`🎉 All ${numberOfCards} cards with QR codes are ready! Choose your favorite below.`);
      }
      
      // Clear the completion message after 3 seconds but keep isCardCompleted true
      setTimeout(() => {
        setGenerationProgress("");
      }, 3000);
      
      // Send thank you email if user provided email
      if (userEmail.trim()) {
        const cardTypeForEmail = selectedType === "custom" ? customCardType : selectedType;
        
        try {
          // Use the first final card (which now has QR code)
          const cardToStore = finalCards[0];
          
          if (!cardToStore || !cardToStore.frontCover) {
            console.log('No card data available for sharing');
            sendThankYouEmail(userEmail, cardTypeForEmail, 'https://vibecarding.com');
            return;
          }
          
          // Store card data with pre-generated card ID
          const cardData = {
            id: cardId, // Use pre-generated card ID
            prompt: effectivePrompt,
            frontCover: cardToStore.frontCover || '',
            backCover: cardToStore.backCover || '',
            leftPage: cardToStore.leftPage || '',
            rightPage: cardToStore.rightPage || ''
          };
          
          console.log('Storing card data:', cardData);
          
          const cardStoreResponse = await fetch('/api/cards/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cardData)
          });
          
          if (cardStoreResponse.ok) {
            const cardStoreData = await cardStoreResponse.json();
            console.log('Card stored successfully, API response:', cardStoreData);
            
            // Use the share_url from the API response (contains friendly name)
            const actualShareUrl = cardStoreData.share_url || cardUrl;
            console.log('Using actual share URL for QR code:', actualShareUrl);
            
            // Now apply QR codes to all cards after successful API storage
            for (let i = 0; i < finalCards.length; i++) {
              if (finalCards[i].backCover && actualShareUrl) {
                try {
                  const originalBackCover = finalCards[i].backCover;
                  console.log(`🔄 Applying QR overlay to card ${i + 1} after API storage...`);
                  finalCards[i].backCover = await overlayQRCodeOnImage(originalBackCover, actualShareUrl);
                  console.log(`✅ QR overlay complete for card ${i + 1}`);
                } catch (error) {
                  console.error(`❌ Failed to overlay QR code on card ${i + 1}:`, error);
                  // Card keeps original back cover if QR overlay fails
                }
              } else {
                console.log(`⚠️ Skipping QR overlay for card ${i + 1} - missing back cover or URL`);
              }
            }
            
            // Update the displayed cards state with QR-enhanced versions
            console.log('🔄 Updating displayed cards with QR codes after API storage...');
            setGeneratedCards([...finalCards]);
            
            // Also update the main displayed card if needed
            if (finalCards.length > 0) {
              setGeneratedCard(finalCards[0]);
            }
            
            // Store the actual share URL in the first card for later use by Share button
            if (finalCards[0]) {
              finalCards[0].shareUrl = actualShareUrl;
              // Also update the React state with the share URL
              setGeneratedCards(prevCards => {
                const updated = [...prevCards];
                if (updated[0]) {
                  updated[0].shareUrl = actualShareUrl;
                }
                return updated;
              });
            }
            
            sendThankYouEmail(userEmail, cardTypeForEmail, actualShareUrl);
          } else {
            console.error('Failed to store card:', cardStoreResponse.status, await cardStoreResponse.text());
            // Fallback to generic URL if store fails
            sendThankYouEmail(userEmail, cardTypeForEmail, 'https://vibecarding.com');
          }
        } catch (error) {
          console.error('Error storing card for email:', error);
          // Fallback to generic URL if store fails
          sendThankYouEmail(userEmail, cardTypeForEmail, 'https://vibecarding.com');
        }
      }
      
      // Clear countdown timer on successful completion
      if (countdownInterval) {
        clearInterval(countdownInterval);
        setCountdownInterval(null);
      }
      setCountdown(0);

    } catch (error) {
      setGenerationProgress("");
      toast.error("Failed to generate card. Please try again.");
      console.error("Card generation error:", error);
      
      // Remove failed job from localStorage and update server
      if (currentJobId) {
        // Store failure result on server
        try {
          await fetch('/api/store-job-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: currentJobId,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          });
        } catch (serverError) {
          console.error('Failed to store job failure on server:', serverError);
        }
        
        removeJobFromStorage(currentJobId);
        setCurrentJobId(null);
      }
    } finally {
      setIsGenerating(false);
      // Clear countdown timer
      if (countdownInterval) {
        clearInterval(countdownInterval);
        setCountdownInterval(null);
      }
      setCountdown(0);
    }
  };


  // Show print confirmation dialog
  const handlePrintClick = () => {
    if (!generatedCard) return;
    
    // Check if user email is provided
    if (!userEmail.trim()) {
      toast.error("Please enter your email address before printing");
      return;
    }
    
    setPrintOption('physical'); // Reset to default
    setShowPrintConfirmation(true);
  };

  // Handle template selection for preview
  const handleTemplateSelect = async (template: GeneratedCard) => {
    try {
      // Show loading state
      setIsGenerating(true);
      setGenerationProgress("🔍 Loading complete template data...");
      
      // Close template gallery first
      setShowTemplateGallery(false);
      
      // Check if template has all required images
      const hasAllImages = template.frontCover && template.backCover && 
        (isFrontBackOnly || (template.leftPage && template.rightPage));
      
      if (hasAllImages) {
        // Template is complete, load directly
        setGeneratedCard(template);
        setGeneratedCards([template]);
        setSelectedCardIndex(0);
        setIsCardCompleted(true);
        setIsGenerating(false);
        setGenerationProgress("");
        
        // Scroll to card preview
        scrollToCardPreview();
        
        toast.success(`✨ Template loaded! You can now print or email this card from the preview below.`);
      } else {
        // Template is incomplete, try to fetch complete data from API
        setGenerationProgress("📡 Fetching complete card images...");
        
        try {
          // Try to fetch the complete card data from the server
          const response = await fetch(`/api/cards/list?limit=1&search=${encodeURIComponent(template.id)}`);
          
          if (response.ok) {
            const data = await response.json();
            const foundCard = data.cards.find((card: any) => card.id === template.id);
            
            if (foundCard && foundCard.frontCover && foundCard.backCover && 
                (isFrontBackOnly || (foundCard.leftPage && foundCard.rightPage))) {
              // Found complete card data
              const completeCard: GeneratedCard = {
                id: foundCard.id,
                prompt: foundCard.prompt || template.prompt,
                frontCover: foundCard.frontCover,
                backCover: foundCard.backCover,
                leftPage: foundCard.leftPage || foundCard.frontCover,
                rightPage: foundCard.rightPage || foundCard.frontCover,
                createdAt: new Date(foundCard.createdAt * 1000),
                shareUrl: foundCard.shareUrl || template.shareUrl,
                generatedPrompts: foundCard.generatedPrompts || template.generatedPrompts
              };
              
              setGeneratedCard(completeCard);
              setGeneratedCards([completeCard]);
              setSelectedCardIndex(0);
              setIsCardCompleted(true);
              setIsGenerating(false);
              setGenerationProgress("");
              
              // Scroll to card preview
              scrollToCardPreview();
              
              toast.success(`✅ Complete template loaded with all images!`);
            } else {
              throw new Error("Complete card data not found");
            }
          } else {
            throw new Error("Failed to fetch card data");
          }
        } catch (fetchError) {
          console.log("Could not fetch complete card data, using fallback approach:", fetchError);
          
          // Fallback: Use front cover for missing images
          const fallbackCard: GeneratedCard = {
            ...template,
            backCover: template.backCover || template.frontCover,
            leftPage: template.leftPage || template.frontCover,
            rightPage: template.rightPage || template.frontCover
          };
          
          setGeneratedCard(fallbackCard);
          setGeneratedCards([fallbackCard]);
          setSelectedCardIndex(0);
          setIsCardCompleted(true);
          setIsGenerating(false);
          setGenerationProgress("");
          
          // Scroll to card preview
          scrollToCardPreview();
          
          toast.info(`📋 Template loaded! Some images may be repeated from the front cover.`);
        }
      }
    } catch (error) {
      console.error("Error loading template:", error);
      setIsGenerating(false);
      setGenerationProgress("");
      toast.error("Failed to load template. Please try again.");
    }
  };

  // Actual print function after confirmation
  // Extracted AI Analysis Logic for Reuse
  const performAIAnalysis = async (cardsToAnalyze: any[], searchQuery: string) => {
    const adaptiveBatchSize = Math.min(
      Math.max(10, Math.floor(cardsToAnalyze.length / 8)), // 8 batches max
      searchQuery.split(' ').length > 3 ? 15 : 25 // Smaller batches for complex queries
    );
    
    const batches = [];
    for (let i = 0; i < cardsToAnalyze.length; i += adaptiveBatchSize) {
      batches.push(cardsToAnalyze.slice(i, i + adaptiveBatchSize));
    }
    
    const analysisPrompt = `User is searching for: "${searchQuery}"

Analyze each greeting card image and rate how well it matches the user's search query on a scale of 1-100.

Consider:
- Visual style matching (watercolor, cartoon, realistic, etc.)
- Colors and themes
- Subject matter (people, animals, objects, nature, etc.)
- Mood and atmosphere
- Occasion appropriateness
- Overall relevance to the search query

Rate each card from 1-100 where:
- 90-100: Perfect match for the search query
- 70-89: Very good match with most elements matching
- 50-69: Good match with some relevant elements
- 30-49: Partial match with few relevant elements  
- 1-29: Poor match, not relevant to search

Return only the numeric score (1-100) for each image.`;

    // Process ALL batches in parallel for maximum speed
    const batchPromises = batches.map(async (batch: any[], batchIndex: number) => {
      const validCards = batch.filter(card => card.frontCover);
      const urls = validCards.map(card => card.frontCover);
      
      const batchResults: Array<{
        id: string;
        card: any;
        score: number;
        analysis: string;
      }> = [];
      
      if (urls.length === 0) {
        batch.forEach(card => {
          const textScore = card.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ? 60 : 20;
          batchResults.push({
            id: card.id,
            card: card,
            score: textScore,
            analysis: "No image available"
          });
        });
        return batchResults;
      }

      try {
        const response = await fetch('/internal/call_mcp_tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: 'analyze_images',
            arguments: {
              urls: urls,
              analysis_prompt: analysisPrompt
            }
          })
        });

        if (response.ok) {
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
          
          if (result.status === 'success' && result.results) {
            result.results.forEach((analysisResult: any, index: number) => {
              if (index < validCards.length) {
                const card = validCards[index];
                
                if (analysisResult.status === 'success' && analysisResult.analysis) {
                  const scoreMatch = analysisResult.analysis.match(/\b(\d{1,3})\b/);
                  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
                  
                  batchResults.push({
                    id: card.id,
                    card: card,
                    score: Math.min(Math.max(score, 0), 100),
                    analysis: analysisResult.analysis
                  });
                } else {
                  const textScore = card.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ? 60 : 20;
                  batchResults.push({
                    id: card.id,
                    card: card,
                    score: textScore,
                    analysis: "Analysis failed, using text fallback"
                  });
                }
              }
            });
          } else {
            throw new Error('Invalid result structure');
          }
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`Failed to analyze batch ${batchIndex + 1}:`, error);
        
        batch.forEach(card => {
          const textScore = card.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ? 60 : 20;
          batchResults.push({
            id: card.id,
            card: card,
            score: textScore,
            analysis: "Batch analysis failed, using text fallback"
          });
        });
      }
      
      return batchResults;
    });

    const allBatchResults = await Promise.all(batchPromises);
    return allBatchResults.flat();
  };

  // Enhanced Text-based Template Search Function (Instant)
  const handleTextTemplateSearch = () => {
    if (!templateSearchQuery.trim()) {
      toast.error("Please enter a search query!");
      return;
    }

    // Get all available cards first
    const allCards = getCachedCards(1, Math.max(totalCards, 1000));
    
    if (allCards.length === 0) {
      toast.error("No templates available to search");
      return;
    }

    const searchTerms = templateSearchQuery.toLowerCase().split(' ').filter(term => term.length > 1);
    
    // Score cards based on text relevance (now including generated prompts)
    const scoredCards = allCards.map(card => {
      const originalPrompt = (card.prompt || '').toLowerCase();
      let score = 0;
      let matchSources: string[] = [];
      
      // Build searchable text from multiple sources
      const searchableTexts = [
        { text: originalPrompt, weight: 10, source: 'original' }
      ];
      
      // Add generated prompts if available (these are AI-analyzed descriptions of actual images)
      if (card.generatedPrompts) {
        if (card.generatedPrompts.frontCover) {
          searchableTexts.push({ 
            text: card.generatedPrompts.frontCover.toLowerCase(), 
            weight: 8, 
            source: 'front-cover-analysis' 
          });
        }
        if (card.generatedPrompts.backCover) {
          searchableTexts.push({ 
            text: card.generatedPrompts.backCover.toLowerCase(), 
            weight: 6, 
            source: 'back-cover-analysis' 
          });
        }
        if (card.generatedPrompts.leftInterior) {
          searchableTexts.push({ 
            text: card.generatedPrompts.leftInterior.toLowerCase(), 
            weight: 7, 
            source: 'left-interior-analysis' 
          });
        }
        if (card.generatedPrompts.rightInterior) {
          searchableTexts.push({ 
            text: card.generatedPrompts.rightInterior.toLowerCase(), 
            weight: 7, 
            source: 'right-interior-analysis' 
          });
        }
      }
      
      // Search through all text sources
      searchTerms.forEach(term => {
        searchableTexts.forEach(({ text, weight, source }) => {
          // Exact word match
          if (text.includes(term)) {
            const termScore = (term.length > 3 ? 10 : 5) * (weight / 10);
            score += termScore;
            if (!matchSources.includes(source)) {
              matchSources.push(source);
            }
          }
          // Partial match
          else if (text.includes(term.substring(0, Math.max(3, term.length - 1)))) {
            const partialScore = 3 * (weight / 10);
            score += partialScore;
            if (!matchSources.includes(source)) {
              matchSources.push(source);
            }
          }
        });
      });
      
      // Boost for cards that match multiple terms
      const matchedTerms = searchTerms.filter(term => 
        searchableTexts.some(({ text }) => text.includes(term))
      ).length;
      if (matchedTerms > 1) {
        score += matchedTerms * 5;
      }
      
      // Boost for cards with AI-generated prompts (they have richer descriptions)
      if (card.generatedPrompts && matchSources.some(source => source.includes('analysis'))) {
        score += 5; // Bonus for AI-analyzed visual content matches
      }
      
      return {
        ...card,
        textScore: score,
        matchSources: matchSources
      };
    });

    // Filter and sort by relevance
    const filteredCards = scoredCards
      .filter(card => card.textScore > 0)
      .sort((a, b) => b.textScore - a.textScore)
      .slice(0, 20); // Top 20 text matches

    setTextFilteredCards(filteredCards);
    
    if (filteredCards.length > 0) {
      const avgScore = Math.round(filteredCards.reduce((sum, card) => sum + card.textScore, 0) / filteredCards.length);
      const aiAnalyzedMatches = filteredCards.filter(card => 
        card.matchSources?.some(source => source.includes('analysis'))
      ).length;
      
      let successMessage = `📝 Found ${filteredCards.length} text matches for "${templateSearchQuery}"! Average relevance: ${avgScore}`;
      if (aiAnalyzedMatches > 0) {
        successMessage += ` (${aiAnalyzedMatches} matches found in AI visual analysis!)`;
      }
      
      toast.success(successMessage);
    } else {
      toast.info("🤔 No templates found matching your text search. Try different keywords!");
    }
  };

  // AI Template Search Function with Parallel Image Analysis
  const handleAITemplateSearch = async () => {
    if (!templateSearchQuery.trim()) {
      toast.error("Please enter a search query!");
      return;
    }

    setIsSearchingTemplates(true);
    
    try {
      // Get all available cards first
      const allCards = getCachedCards(1, Math.max(totalCards, 1000));
      
      if (allCards.length === 0) {
        toast.error("No templates available to search");
        return;
      }

      // Smart pre-filtering: First filter by text relevance to reduce AI analysis load
      const textFilteredCards = allCards.filter(card => {
        const searchTerms = templateSearchQuery.toLowerCase().split(' ');
        const cardText = (card.prompt || '').toLowerCase();
        
        // Include cards that match any search term or have high general relevance
        return searchTerms.some(term => 
          cardText.includes(term) || 
          term.length <= 3 || // Include short terms (colors, etc.)
          ['card', 'birthday', 'funny', 'cute', 'love'].some(common => cardText.includes(common))
        );
      });
      
      // If pre-filtering removes too many cards, fall back to analyzing all
      const cardsToAnalyze = textFilteredCards.length >= Math.min(50, allCards.length * 0.3) 
        ? textFilteredCards 
        : allCards;
      
      const filterMessage = textFilteredCards.length < allCards.length 
        ? ` (pre-filtered from ${allCards.length} based on text relevance)`
        : '';
      
      toast.info(`🔍 AI analyzing ${cardsToAnalyze.length} card images for "${templateSearchQuery}"${filterMessage}...`);

      // Adaptive batch sizing based on query complexity and number of cards
      const queryComplexity = templateSearchQuery.split(' ').length;
      const adaptiveBatchSize = Math.min(
        Math.max(10, Math.floor(cardsToAnalyze.length / 8)), // 8 batches max
        queryComplexity > 3 ? 15 : 25 // Smaller batches for complex queries
      );
      
      console.log(`🧠 Using adaptive batch size: ${adaptiveBatchSize} (query complexity: ${queryComplexity} terms)`);
      
      const batches = [];
      
      for (let i = 0; i < cardsToAnalyze.length; i += adaptiveBatchSize) {
        batches.push(cardsToAnalyze.slice(i, i + adaptiveBatchSize));
      }
      
      console.log(`🚀 Processing ${cardsToAnalyze.length} images in ${batches.length} batches (adaptive size: ${adaptiveBatchSize})`);
      
      // Use the extracted AI analysis function
      console.log(`🚀 Processing ALL ${batches.length} batches in parallel!`);
      toast.info(`🚀 Processing ${batches.length} batches in parallel (${cardsToAnalyze.length} images total)...`);
      
      const analysisResults = await performAIAnalysis(cardsToAnalyze, templateSearchQuery);
      
      // Sort by score (highest first) and filter out low scores
      const rankedResults = analysisResults
        .filter(result => result.score >= 30) // Only show cards with score 30+
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Top 10 results

      if (rankedResults.length > 0) {
        const filteredCards = rankedResults.map(result => ({
          ...result.card,
          aiScore: result.score,
          aiAnalysis: result.analysis
        }));
        
        setAiFilteredCards(filteredCards);
        
        const avgScore = Math.round(rankedResults.reduce((sum, r) => sum + r.score, 0) / rankedResults.length);
        toast.success(`🎯 Found ${filteredCards.length} matches for "${templateSearchQuery}"! Average relevance: ${avgScore}%`);
      } else {
        toast.info("🤔 No templates found matching your search. Try a different query!");
        setAiFilteredCards([]);
      }
      
    } catch (error) {
      console.error('AI template search failed:', error);
      toast.error("AI search failed. Please try again.");
      setAiFilteredCards([]);
    } finally {
      setIsSearchingTemplates(false);
    }
  };

  // Hybrid Search Function (Text + AI Enhancement)
  const handleHybridTemplateSearch = async () => {
    if (!templateSearchQuery.trim()) {
      toast.error("Please enter a search query!");
      return;
    }

    setIsSearchingTemplates(true);
    
    try {
      // Phase 1: Fast text search for immediate results
      toast.info(`🚀 Phase 1: Fast text search...`);
      handleTextTemplateSearch();
      
      // Phase 2: AI enhancement on text results
      const allCards = getCachedCards(1, Math.max(totalCards, 1000));
      const searchTerms = templateSearchQuery.toLowerCase().split(' ').filter(term => term.length > 1);
      
      // Get text-filtered cards for AI analysis
      const textCandidates = allCards.filter(card => {
        const cardText = (card.prompt || '').toLowerCase();
        return searchTerms.some(term => cardText.includes(term)) || searchTerms.length === 0;
      });
      
      // If text filtering gives us a reasonable subset, use it; otherwise use all cards
      const cardsToAnalyze = textCandidates.length > 0 && textCandidates.length < allCards.length * 0.8 
        ? textCandidates 
        : allCards;
      
      toast.info(`🎨 Phase 2: AI visual analysis on ${cardsToAnalyze.length} candidates...`);
      
             // Run AI analysis on the candidates
       const analysisResults = await performAIAnalysis(cardsToAnalyze, templateSearchQuery);
      
             // Combine text and AI scores for final ranking
       const hybridResults = analysisResults.map((result: any) => ({
         ...result,
         hybridScore: (result.score * 0.7) + ((result.card.textScore || 0) * 0.3) // 70% AI, 30% text
       })).sort((a: any, b: any) => b.hybridScore - a.hybridScore);
       
       const finalResults = hybridResults.slice(0, 10).map((result: any) => ({
         ...result.card,
         aiScore: Math.round(result.hybridScore),
         aiAnalysis: `Hybrid: ${result.analysis}`
       }));
       
       setAiFilteredCards(finalResults);
       
       if (finalResults.length > 0) {
         const avgScore = Math.round(hybridResults.reduce((sum: number, r: any) => sum + r.hybridScore, 0) / hybridResults.length);
         toast.success(`🎯 Hybrid search complete! Found ${finalResults.length} matches for "${templateSearchQuery}"! Average relevance: ${avgScore}%`);
       } else {
         toast.info("🤔 No templates found matching your search. Try a different query!");
       }
      
    } catch (error) {
      console.error('Hybrid template search failed:', error);
      toast.error("Hybrid search failed. Please try again.");
    } finally {
      setIsSearchingTemplates(false);
    }
  };

  // Main search handler that routes to appropriate search method
  const handleTemplateSearch = () => {
    switch (searchMode) {
      case 'text':
        handleTextTemplateSearch();
        break;
      case 'ai':
        handleAITemplateSearch();
        break;
      case 'hybrid':
        handleHybridTemplateSearch();
        break;
    }
  };

  const clearTemplateSearch = () => {
    setTemplateSearchQuery("");
    setAiFilteredCards([]);
    setTextFilteredCards([]);
  };

  const handleConfirmPrint = async () => {
    // Always use the card from the preview area
    const cardToPrint = generatedCard;
    if (!cardToPrint) {
      toast.error("No card available to print");
      return;
    }
    
    // Validate email before proceeding
    if (!userEmail.trim()) {
      toast.error("Please enter your email address before printing");
      setShowPrintConfirmation(false);
      return;
    }
    
    setShowPrintConfirmation(false);
    
    // Note: We no longer use selectedTemplate for direct printing
    
    try {
      // Validate card data
      if (!cardToPrint.frontCover) {
        toast.error("Card is missing front cover image. Please regenerate the card.");
        return;
      }
      
      if (!cardToPrint.backCover) {
        toast.error("Card is missing back cover image. Please regenerate the card.");
        return;
      }
      
      if (!isFrontBackOnly && (!cardToPrint.leftPage || !cardToPrint.rightPage)) {
        toast.error("Card is missing interior pages. Please regenerate the card or use front-back only mode.");
        return;
      }
      
      // Prepare card data for both printing and PDF email
      const cardData = {
        front_cover: cardToPrint.frontCover,
        back_cover: cardToPrint.backCover,
        left_page: cardToPrint.leftPage,
        right_page: cardToPrint.rightPage,
        card_name: (cardToPrint.prompt || 'Custom Card').substring(0, 50) + ((cardToPrint.prompt || '').length > 50 ? '...' : ''),
        paper_size: selectedPaperSize,
        is_front_back_only: isFrontBackOnly,
        copies: 1,
        color_mode: 'color',
        quality: 'high'
      };

      console.log('Print data:', { printOption, userEmail, cardData });

      if (printOption === 'email') {
        // Send PDF to email
        const emailData = {
          ...cardData,
          user_email: userEmail.trim(),
          send_pdf: true
        };

        console.log('Sending email data:', emailData);

        const response = await fetch('/api/send-pdf-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailData),
        });

        console.log('Email response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Email response error:', errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('Email response result:', result);
        
        if (result.status === 'success') {
          toast.success(`📧 PDF sent to ${userEmail}! Check your inbox.`);
        } else {
          throw new Error(result.error || 'Failed to send PDF');
        }
      } else {
        // Physical printing
        const response = await fetch('/api/print-queue', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cardData),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        
        if (result.status === 'queued') {
          const cardType = isFrontBackOnly ? 'Front/Back card' : 'Full duplex card';
          const duplexInfo = result.duplex ? ' (duplex enabled)' : ' (single-sided)';
          toast.success(`🖨️ Your card is now printing! You can pick it up shortly.`);
          
          // Poll for job status
          let pollCount = 0;
          const maxPolls = 6; // Poll for up to 60 seconds
          
          const pollStatus = async () => {
            try {
              const statusResponse = await fetch(`/api/print-status/${result.job_id}`);
              if (statusResponse.ok) {
                const statusResult = await statusResponse.json();
                if (statusResult.status === 'found') {
                  if (statusResult.job.status === 'completed') {
                    toast.success("✅ Your card has been added to the print queue and should be available for pickup shortly.");
                    return;
                  } else if (statusResult.job.status === 'failed') {
                    toast.error("❌ There was an issue with printing. Please try again or contact us for help.");
                    return;
                  } else if (statusResult.job.status === 'pending' && pollCount < maxPolls) {
                    // Still pending, poll again
                    pollCount++;
                    setTimeout(pollStatus, 10000);
                  }
                }
              }
            } catch (error) {
              console.log("Could not check print status:", error);
            }
          };
          
          // Start polling after 10 seconds
          setTimeout(pollStatus, 10000);
          
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      }
    } catch (error) {
      console.error('Print/Email error:', error);
      toast.error(printOption === 'email' ? "Failed to send PDF email" : "Failed to queue print job");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-slate-800 dark:to-gray-800">
      <CriticalResourcePreloader />
      <EarlyCardPreloader />
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
                    VibeCarding
                  </h1>
                </div>
              </div>
              <Link href="/gallery">
                <Button variant="ghost" size="sm" className="gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Infinite Gallery</span>
                </Button>
              </Link>
            </div>
            {/* Settings Menu */}
            <Popover open={showSettings} onOpenChange={setShowSettings}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                  <Settings2 className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">Settings</h4>
                    <p className="text-sm text-muted-foreground">
                      Configure your card creation preferences
                    </p>
                  </div>
                  
                  {/* Theme Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Theme</div>
                      <div className="text-xs text-muted-foreground">Switch between light and dark mode</div>
                    </div>
                    <ModeToggle />
                  </div>
                  
                  <Separator />
                  
                  {/* Advanced Options Toggle */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">Advanced Options</div>
                        <div className="text-xs text-muted-foreground">Show additional card settings</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="h-8"
                      >
                        {showAdvanced ? "Hide" : "Show"}
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Main Form */}
        <Card className="shadow-lg mb-6">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-t-lg">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent whitespace-nowrap">
                          Create Your Card
                        </CardTitle>
                      </div>
                    </div>
                    {(prompt || toField || fromField || generatedCards.length > 0) && (
                      <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span className="hidden sm:inline">Auto-saved</span>
                        <span className="sm:hidden">Saved</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowTemplateGallery(true);
                    }}
                    className="w-full sm:w-auto gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Browse Templates</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
            {/* Card Type */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-8 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full" />
                    <label className="text-base font-semibold text-gray-800 dark:text-gray-200">
                      Card Type
                    </label>
                  </div>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="h-12 border-2 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                      <SelectValue>
                        {(() => {
                          const selected = cardTypes.find((type) => type.id === selectedType);
                          if (!selected) return <span className="text-gray-400">Choose card type</span>;
                          const IconComponent = selected.icon;
                          return (
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900 dark:to-cyan-900 rounded-lg flex items-center justify-center">
                                <IconComponent className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              </div>
                              <span className="font-medium text-gray-900 dark:text-gray-100">{selected.label}</span>
                            </div>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[400px]">
                      {cardTypes.map((type) => {
                        const IconComponent = type.icon;
                        return (
                          <SelectItem key={type.id} value={type.id} className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                            <div className="flex items-center gap-3 py-1">
                              <div className="w-8 h-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg flex items-center justify-center">
                                <IconComponent className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                              </div>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 dark:text-gray-100">{type.label}</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">{type.description}</div>
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  
                  {/* Custom Card Type Input */}
                  {selectedType === "custom" && (
                    <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 animate-in slide-in-from-top-2 duration-300">
                      <label className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-3 block flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        Describe Your Custom Card Type
                      </label>
                      <Input
                        placeholder="✨ E.g., 'Promotion at work', 'Moving away', 'First day of school'"
                        value={customCardType}
                        onChange={(e) => setCustomCardType(e.target.value)}
                        className="h-12 border-2 border-purple-300 dark:border-purple-700 focus:border-purple-500 dark:focus:border-purple-500"
                        style={{ fontSize: '16px' }}
                      />
                      <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
                        What type of card is this? This helps personalize the message and style.
                      </p>
                    </div>
                  )}
                </div>

            {/* Card Tone */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Card Tone & Style
              </label>
              <Select value={selectedTone} onValueChange={setSelectedTone}>
                <SelectTrigger>
                  <SelectValue>
                    {(() => {
                      const selected = cardTones.find((tone) => tone.id === selectedTone);
                      if (!selected) return <span className="text-gray-400">Choose card tone</span>;
                      return (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{selected.label}</span>
                        </div>
                      );
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {cardTones.map((tone) => (
                    <SelectItem key={tone.id} value={tone.id}>
                      <div>
                        <div className="font-medium">{tone.label}</div>
                        <div className="text-xs text-muted-foreground">{tone.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Artistic Style Selection */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Artistic Style
              </label>
              <Select value={selectedArtisticStyle} onValueChange={setSelectedArtisticStyle}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose artistic style" />
                </SelectTrigger>
                <SelectContent>
                  {artisticStyles.map((style) => (
                    <SelectItem key={style.id} value={style.id}>
                      <div className="text-left w-full">
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

            {/* To/From Fields */}
            <div className="grid grid-cols-2 gap-3">
                  <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  To
                    </label>
                    <Input
                  placeholder="🎯 To"
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
                  placeholder="📝 From"
                      value={fromField}
                      onChange={(e) => setFromField(e.target.value)}
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>

            {/* User Email Field */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Your Email (Required)
              </label>
              <Input
                type="email"
                placeholder="📧 your.email@example.com (we'll send you the card!)"
                required
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                style={{ fontSize: '16px' }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Required to generate your card. We'll send you a thank you note when it's ready!
              </p>
            </div>

            {/* Main Description */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Describe Your Card (Optional)
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsTextareaExpanded(!isTextareaExpanded)}
                      className="gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      {isTextareaExpanded ? (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3 rotate-180" />
                          Expand
                        </>
                      )}
                    </Button>
                  </div>
              <Textarea
                placeholder="💡 Optional: Be specific! E.g., 'Birthday card with cute cats and rainbow colors for my sister who loves anime' (or leave blank for a beautiful default design)"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={isTextareaExpanded ? 8 : 5}
                className={isTextareaExpanded ? "resize-y" : "resize-none"}
                style={{ fontSize: '16px' }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                💡 <strong>Tip:</strong> Add details like colors, style, recipient's interests, and specific themes for personalized results, or leave blank for a beautiful default card!
              </p>
                </div>

            {/* Message Section */}
                <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Card Message
                  </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsMessageExpanded(!isMessageExpanded)}
                    className="gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    {isMessageExpanded ? (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3 rotate-180" />
                        Expand
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGetMessageHelp}
                    disabled={isGeneratingMessage || isHandwrittenMessage}
                    className="gap-1 text-xs"
                  >
                    <MessageSquarePlus className="w-3 h-3" />
                    {isGeneratingMessage ? "Writing..." : "Help me write"}
                  </Button>
                </div>
                          </div>
                  <Textarea
                placeholder={isHandwrittenMessage ? "✍️ Leave blank - you'll handwrite your message" : "💝 Your personal message here... (or click 'Help me write' for AI assistance)"}
                value={finalCardMessage}
                onChange={(e) => setFinalCardMessage(e.target.value)}
                    rows={isMessageExpanded ? 8 : 5}
                    className={isMessageExpanded ? "resize-y" : "resize-none"}
                    style={{ fontSize: '16px' }}
                disabled={isHandwrittenMessage}
                  />
                  
                  {/* Message Version Control and Refinement */}
                  {finalCardMessage.trim() && (
                    <div className="mt-3 space-y-3">
                      {/* Version Control Buttons */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={undoMessage}
                            disabled={currentMessageIndex <= 0}
                            className="gap-1 text-xs flex-shrink-0"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Undo</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={redoMessage}
                            disabled={currentMessageIndex >= messageHistory.length - 1}
                            className="gap-1 text-xs flex-shrink-0"
                          >
                            <Redo2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Redo</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowRefinementBox(!showRefinementBox)}
                            className="gap-1 text-xs flex-shrink-0"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span className="hidden sm:inline">Refine</span>
                            <span className="sm:hidden">Edit</span>
                          </Button>
                        </div>
                        {messageHistory.length > 0 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 text-center sm:text-left truncate">
                            <span className="hidden sm:inline">Version {currentMessageIndex + 1} of {messageHistory.length}</span>
                            <span className="sm:hidden">{currentMessageIndex + 1}/{messageHistory.length}</span>
                          </div>
                        )}
                      </div>

                      {/* Refinement Box */}
                      {showRefinementBox && (
                        <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            How would you like to refine this message?
                          </label>
                          <div className="space-y-2">
                            <Input
                              placeholder="🔧 E.g., 'Make it funnier', 'Add mention of their hobby', 'More formal tone'"
                              value={refinementPrompt}
                              onChange={(e) => setRefinementPrompt(e.target.value)}
                              style={{ fontSize: '16px' }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleRefineMessage();
                                }
                              }}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              📱 <strong>Quick tips:</strong> "Shorter", "Add emoji", "More personal", "Different tone" work great!
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={handleRefineMessage}
                                disabled={isRefiningMessage || !refinementPrompt.trim()}
                                className="gap-1"
                              >
                                <RefreshCw className={`w-3 h-3 ${isRefiningMessage ? 'animate-spin' : ''}`} />
                                {isRefiningMessage ? "Refining..." : "Apply Changes"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowRefinementBox(false);
                                  setRefinementPrompt("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Handwritten Message Option */}
                  <div className="flex items-center space-x-2 mt-2">
                    <input
                      type="checkbox"
                      id="handwritten-message"
                      checked={isHandwrittenMessage}
                      onChange={(e) => {
                        setIsHandwrittenMessage(e.target.checked);
                        if (e.target.checked) {
                          setFinalCardMessage("");
                        }
                      }}
                      className="rounded"
                    />
                    <label htmlFor="handwritten-message" className="text-sm text-gray-600 dark:text-gray-400">
                      Leave blank space for handwritten message
                    </label>
                  </div>
                </div>

            {/* Reference Photo - Only available for GPT-1 model, but show if photos exist */}
            {(selectedImageModel === "gpt-image-1" || referenceImageUrls.length > 0) && (
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Reference Photos (Optional)
                </label>
                
                {/* Always show existing reference photos if they exist */}
                {referenceImageUrls.length > 0 && (
                  <div className="mb-3">
                    {selectedImageModel !== "gpt-image-1" ? (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-3">
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-white text-xs">!</span>
                          </div>
                          <div className="text-sm text-amber-800 dark:text-amber-200">
                            <p className="font-medium mb-1">Reference photos detected but not supported</p>
                            <p className="text-xs">You have {referenceImageUrls.length} reference photo{referenceImageUrls.length > 1 ? 's' : ''} from a previous session, but your current model ({imageModels.find(m => m.id === selectedImageModel)?.label}) doesn't support reference photos. Switch to GPT Image 1 to use them, or remove them below.</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-white text-xs">✓</span>
                          </div>
                          <div className="text-sm text-green-800 dark:text-green-200">
                            <p className="font-medium mb-1">Reference photos ready</p>
                            <p className="text-xs">{referenceImageUrls.length} reference photo{referenceImageUrls.length > 1 ? 's' : ''} will be used to create cartoon characters that look like the people in your photos.</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Display existing reference photos prominently */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          📸 Your Reference Photos ({referenceImageUrls.length})
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReferenceImages([]);
                            setReferenceImageUrls([]);
                            toast.success("All reference photos removed!");
                          }}
                          className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <X className="w-3 h-3" />
                          Remove All
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                        {referenceImageUrls.map((url, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={url}
                              alt={`Reference photo ${index + 1}`}
                              className="w-full aspect-square object-cover rounded border"
                            />
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRemoveReferenceImage(index)}
                              className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                            <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
                              Photo {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {selectedImageModel === "gpt-image-1" && (
                  <>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Upload photos to create cartoon characters that look like the people in your photos! Perfect for including multiple people - upload one photo of yourself and another of a friend to create cards featuring both of you. (Only available with GPT Image 1 model)
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                      ✨ For your privacy, photos are turned into cartoon/illustrated characters - not realistic depictions
                    </p>
                  </>
                )}
              <div className="space-y-3">
                {/* Upload Area - Only show if model supports it */}
                {selectedImageModel === "gpt-image-1" && (
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
                        {isUploading ? "Uploading..." : `Upload ${referenceImages.length > 0 ? 'another' : 'a'} photo to create characters`}
                      </div>
                    </label>
                  </div>
                )}

                {/* Display uploaded images */}
                {referenceImages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {referenceImages.length} photo{referenceImages.length > 1 ? 's' : ''} uploaded:
                      </div>
                      {selectedImageModel !== "gpt-image-1" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReferenceImages([]);
                            setReferenceImageUrls([]);
                            toast.success("All reference photos removed!");
                          }}
                          className="h-6 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <X className="w-3 h-3" />
                          Clear All
                        </Button>
                      )}
                    </div>
                    {referenceImages.map((image, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Wand2 className="w-4 h-4 text-purple-600" />
                          <span className="text-sm text-purple-800 dark:text-purple-200">{image.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveReferenceImage(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Character style instructions - Only show if model supports it */}
                {referenceImages.length > 0 && selectedImageModel === "gpt-image-1" && (
                  <div>
                    <Textarea
                      placeholder="Character style instructions (optional): e.g., 'Make us look like anime characters', 'Keep our exact outfits and accessories but in watercolor style', or 'Show both people together in the same scene'"
                      value={imageTransformation}
                      onChange={(e) => setImageTransformation(e.target.value)}
                      rows={3}
                      className="resize-none"
                      style={{ fontSize: '16px' }}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      💡 <strong>Tip:</strong> Leave blank to keep exact clothing & accessories, or specify style changes like "anime style" or "vintage cartoon look"
                    </p>
                  </div>
                )}
              </div>
              </div>
            )}

            {/* Advanced Options - Controlled by Settings Menu */}
            {showAdvanced && (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="w-4 h-4" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Advanced Options</span>
                </div>

                {/* Image Model Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Image Generation Model
                  </label>
                  <Select value={selectedImageModel} onValueChange={setSelectedImageModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose image model" />
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

                                 {/* Draft Mode Model Selection */}
                 <div>
                   <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                     Draft Mode Model
                   </label>
                   <Select value={selectedDraftModel} onValueChange={setSelectedDraftModel}>
                     <SelectTrigger>
                       <SelectValue placeholder="Choose draft model" />
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
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                     Model used for draft variations. Consider faster models like FLUX 1.1 Pro for quicker previews.
                   </p>
                 </div>

                {/* Paper Size Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Paper Size
                  </label>
                  <Select value={selectedPaperSize} onValueChange={setSelectedPaperSize}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose paper size" />
                    </SelectTrigger>
                    <SelectContent>
                      {paperSizes.map((size) => (
                        <SelectItem key={size.id} value={size.id}>
                          <div>
                            <div className="font-medium">{size.label}</div>
                            <div className="text-xs text-muted-foreground">{size.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Number of Cards */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Number of Cards to Generate
                  </label>
                  <Select value={numberOfCards.toString()} onValueChange={(value) => setNumberOfCards(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose number of cards" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} Card{num > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Generate multiple card variations to choose from
                  </p>
                </div>

                {/* Print Options */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="front-back-only"
                      checked={isFrontBackOnly}
                      onChange={(e) => setIsFrontBackOnly(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="front-back-only" className="text-sm text-gray-700 dark:text-gray-300">
                      Front and back only (no interior pages)
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Perfect for postcards or simple greeting cards
                  </p>
                </div>

                {/* Clear Saved Data Section */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Data Management
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSavedData}
                    className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X className="w-4 h-4" />
                    Clear Saved Data
                  </Button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Remove all saved form data and generated cards from your browser
                  </p>
                </div>
              </div>
            )}

                {/* Privacy & Terms Section */}
                <Collapsible className="space-y-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between text-xs text-gray-500 dark:text-gray-400 h-8">
                      <span>Privacy & Terms</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3">
                    <div className="text-xs text-gray-600 dark:text-gray-300 space-y-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      
                      <div>
                        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Privacy Policy</h4>
                        <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                          <li>• We collect your email address and card content to provide our service</li>
                          <li>• Images and messages are processed using third-party AI services</li>
                          <li>• Cards are stored temporarily for delivery and may be cached for performance</li>
                          <li>• We do not sell, share, or use your personal data for marketing purposes</li>
                          <li>• Your email is only used for card delivery and service communications</li>
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Terms of Service</h4>
                        <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                          <li>• You must be 13+ years old to use this service</li>
                          <li>• You are responsible for the content you submit</li>
                          <li>• Service is provided "as-is" without warranties</li>
                          <li>• We reserve the right to refuse service for policy violations</li>
                          <li>• These terms may be updated with notice on our website</li>
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Content Policy</h4>
                        <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                          <li>• All content must be family-friendly and appropriate for all audiences</li>
                          <li>• No copyrighted characters, logos, or trademarked content</li>
                          <li>• No hate speech, harassment, or discriminatory content</li>
                          <li>• No illegal, harmful, or explicit material</li>
                          <li>• Content may be filtered to ensure compliance with these guidelines</li>
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Intellectual Property</h4>
                        <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                          <li>• You retain rights to your original content and ideas</li>
                          <li>• Generated images are created using AI and may not be copyrightable</li>
                          <li>• You grant us license to process and deliver your cards</li>
                          <li>• Respect third-party intellectual property rights</li>
                        </ul>
                      </div>

                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-center text-gray-500 dark:text-gray-400">
                          By creating a card, you agree to these terms and policies. 
                          <br />Last updated: {new Date().toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Clean Progress Indicator - Show for all generation types */}
                {(isGenerating || isGeneratingMessage || isGeneratingFinalCard) && !(isDraftMode && draftCards.length > 0 && !isGeneratingFinalCard) && (
                  <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="space-y-3">
                      {/* Progress Message */}
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          {generationProgress || "Generating your card..."}
                        </span>
                      </div>

                      {/* Clean Progress Bar */}
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                        />
                      </div>

                      {/* Progress Text and Time Display */}
                      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">
                          {Math.round(progressPercentage)}% Complete
                        </span>
                        <div className="flex items-center gap-3">
                          {currentElapsedTime > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              ⏱️ {formatGenerationTime(currentElapsedTime)}
                            </span>
                          )}
                          <span className="text-gray-500">
                            {isGeneratingFinalCard ? '~1:30-2:00 min expected' : isDraftMode && !isGeneratingFinalCard ? '~30-60 sec expected' : '~1:30-2:00 min expected'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generate Buttons */}
                {!isDraftMode && draftCards.length === 0 && !isGeneratingFinalCard && !isGenerating ? (
                  <div className="space-y-3">
                    {/* Draft Mode Description */}
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                      <div className="flex items-start gap-2">
                        <Palette className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-purple-900 dark:text-purple-100">
                            🎨 Draft Mode (Recommended)
                          </p>
                                                  <p className="text-purple-700 dark:text-purple-300 text-xs mt-1">
                          Generate 5 different front cover designs quickly with low quality, then pick your favorite for complete high-quality card generation. 
                          {selectedArtisticStyle === "ai-smart-style" && (
                            <span className="font-medium"> With Smart Style, you'll see your card in 5 of our curated artistic styles!</span>
                          )}
                        </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Draft Mode Button */}
                    <Button
                      onClick={handleGenerateDraftCards}
                      disabled={isGenerating || isGeneratingMessage || !userEmail.trim()}
                      className="w-full h-12 transition-all duration-300 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                      size="lg"
                    >
                      {isGenerating || isGeneratingMessage ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          {isGeneratingMessage ? (
                            <span>Writing your message...</span>
                          ) : (
                            <span>Creating 10 design options...</span>
                          )}
                        </>
                      ) : (
                                              <>
                        <Palette className="w-5 h-5 mr-2" />
                        <span>Create 5 Front Cover Options</span>
                      </>
                      )}
                    </Button>
                    
                    <div className="text-center text-xs text-gray-500 dark:text-gray-400">
                      or
                    </div>
                    
                    {/* Direct Generation Button */}
                    <Button
                      onClick={handleGenerateCardAsync}
                      disabled={isGenerating || isGeneratingMessage || !userEmail.trim()}
                      variant="outline"
                      className="w-full h-10 transition-all duration-300 border-blue-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      size="lg"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      <span>Direct Generation</span>
                    </Button>
                  </div>
                ) : isGeneratingFinalCard ? (
                  <div className="space-y-4">
                    <Button
                      disabled={true}
                      className="w-full h-12 transition-all duration-300 bg-gradient-to-r from-blue-500 to-cyan-600"
                      size="lg"
                    >
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      <span>Creating high-quality version...</span>
                    </Button>
                  </div>
                ) : (
                <Button
                  onClick={handleGenerateCardAsync}
                  disabled={isGenerating || isGeneratingMessage || !userEmail.trim()}
                  className={`w-full h-12 transition-all duration-300 ${
                    isCardCompleted 
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700' 
                      : 'bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700'
                  }`}
                  size="lg"
                >
                  {isGenerating || isGeneratingMessage ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      {isGeneratingMessage ? (
                        <span>Writing your message...</span>
                      ) : (
                        <span>Creating your card...</span>
                      )}
                    </>
                  ) : isCardCompleted ? (
                    <div className="flex items-center justify-center w-full">
                      <div className="w-5 h-5 mr-2 text-white">✅</div>
                      <span>Card Completed!</span>
                    </div>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      {numberOfCards > 1 ? `Create ${numberOfCards} Cards` : 'Create Card'}
                    </>
                  )}
                </Button>
                )}
                
                {/* Action buttons when card is completed */}
                {isCardCompleted && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleRegenerateCard}
                      variant="outline"
                      className="flex items-center gap-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-900/20"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate Same
                    </Button>
                    <Button
                      onClick={handleCreateNewCard}
                      variant="outline"
                      className="flex items-center gap-2 border-green-200 hover:border-green-300 hover:bg-green-50 dark:border-green-800 dark:hover:border-green-700 dark:hover:bg-green-900/20"
                    >
                      <Sparkles className="w-4 h-4" />
                      Create New Card
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

        {/* Draft Cards Selection */}
        {isDraftMode && draftCards.length > 0 && !isGeneratingFinalCard && !generatedCard && (
          <Card className="shadow-lg" data-card-preview>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-600" />
                Choose Your Favorite Design
              </CardTitle>
              <CardDescription>
                5 front cover variations created with low quality for fast preview. Select your favorite to generate the complete high-quality card!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Unified horizontal scrolling view for all screen sizes */}
              <div className="w-full">
                <div className="flex overflow-x-auto gap-3 pb-4 -mx-4 px-4 snap-x snap-mandatory">
                  {Array.from({ length: 5 }, (_, displayIndex) => {
                    const card = draftCards[displayIndex];
                    const originalIndex = draftIndexMapping[displayIndex];
                    const isLoading = displayIndex >= draftCards.length;
                    
                    return (
                                              <div
                          key={displayIndex}
                          className={`flex-shrink-0 w-48 sm:w-56 snap-center rounded-lg border-2 p-2 sm:p-3 transition-all ${
                          selectedDraftIndex === displayIndex
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg'
                            : card
                            ? 'border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10'
                            : 'border-dashed border-gray-300 dark:border-gray-600'
                        }`}
                        onClick={() => card && setSelectedDraftIndex(displayIndex)}
                      >
                        {card ? (
                                                  <>
                            {/* Single front cover preview */}
                            <div className="aspect-[2/3] relative overflow-hidden rounded border mb-2 sm:mb-3">
                            <img
                              src={card.frontCover}
                              alt={`Design ${originalIndex + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {selectedDraftIndex === displayIndex && (
                              <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center">
                                <div className="bg-white rounded-full p-2">
                                    <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
                                </div>
                              </div>
                            )}
                          </div>
                          
                            {/* Card info */}
                            <div className="text-center space-y-1 sm:space-y-2">
                            <h4 className="font-medium text-sm">Design {originalIndex + 1}</h4>
                            {selectedArtisticStyle === "ai-smart-style" && card.styleInfo && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                {card.styleInfo.styleLabel}
                              </p>
                              )}
                              <div className="space-y-1">
                                {selectedDraftIndex === displayIndex && (
                                  <Badge className="bg-purple-600 text-white text-xs px-2 py-1 mb-1">
                                    ✓ Selected
                                  </Badge>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewingDraftIndex(displayIndex);
                              }}
                                  className="w-full text-xs h-7 sm:h-8"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Preview Design</span>
                                  <span className="sm:hidden">Preview</span>
                            </Button>
                              </div>
                          </div>
                        </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 sm:py-8">
                            <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2 sm:mb-3" />
                            <h4 className="font-medium text-sm mb-1">Creating...</h4>
                            <p className="text-xs text-gray-500">Generating front cover...</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Selection indicator */}
                {selectedDraftIndex !== -1 && draftIndexMapping[selectedDraftIndex] !== undefined && (
                  <div className="text-center bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      ✓ Design {draftIndexMapping[selectedDraftIndex] + 1} selected
                    </p>
                  </div>
                )}
              </div>
              
              {/* Generate button - show as soon as user selects a card */}
              {draftCards.length > 0 && (
                <div className="mt-6 text-center space-y-3">
                  <Button
                    onClick={() => handleGenerateFinalFromDraft(selectedDraftIndex)}
                    disabled={selectedDraftIndex === -1}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white w-full md:w-auto"
                    size="lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Generate Complete High-Quality Card
                  </Button>
                  
                  {selectedDraftIndex === -1 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Please select a design variation above to proceed
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                        ✓ Design {draftIndexMapping[selectedDraftIndex] + 1} selected - ready to generate!
                      </p>
                      {draftCards.length < 10 && isGenerating && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Remaining variations will be cancelled to focus on your selected design
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Card Preview - Hide when in draft mode or when generating final from draft */}
        {(() => {
          console.log('🔍 Card Preview Render Check:', {
            hasGeneratedCard: !!generatedCard,
            cardId: generatedCard?.id,
            isCardCompleted,
            generatedCardsLength: generatedCards.length,
            selectedCardIndex,
            frontCover: generatedCard?.frontCover ? 'present' : 'missing',
            isDraftMode,
            isGeneratingFinalCard,
            draftCardsLength: draftCards.length
          });
          return null;
        })()}
        {generatedCard && !isGeneratingFinalCard && (
                  <Card className="shadow-lg" data-card-preview>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {isCardCompleted && (
                              <div 
                                className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center" 
                                title={generationDuration ? `Generated in ${formatGenerationTime(generationDuration)}` : 'Card completed'}
                              >
                                <span className="text-white text-sm">✓</span>
                              </div>
                            )}
                            {numberOfCards > 1 ? `Your Cards (${generatedCards.length} Generated)` : 'Your Card'}
                          </CardTitle>
                          <CardDescription>
                            {isCardCompleted ? (
                              <div className="space-y-2">
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                🎉 Card generation complete! Your card is ready for printing or sharing.
                                    </span>
                                {generationDuration && (
                                  <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium">
                                    <span className="text-blue-500">⚡</span>
                                    Generated in {formatGenerationTime(generationDuration)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                Created {new Date(generatedCard.createdAt).toLocaleDateString()}
                                {numberOfCards > 1 && ` • Viewing Card ${selectedCardIndex + 1} of ${generatedCards.length}`}
                              </>
                            )}
                          </CardDescription>
                        </div>

                      </div>
                      
                      {/* Card Selector for Multiple Cards */}
                      {numberOfCards > 1 && generatedCards.length > 1 && (
                        <div className="mt-4">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                            Choose Your Favorite Card
                          </label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {generatedCards.map((card, index) => (
                              <div
                                key={card.id}
                                className={`relative cursor-pointer rounded-lg border-2 p-2 transition-all ${
                                  selectedCardIndex === index
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                }`}
                                onClick={() => {
                                  setSelectedCardIndex(index);
                                  setGeneratedCard(card);
                                }}
                              >
                                <div className="aspect-[2/3] relative overflow-hidden rounded">
                                  {card.frontCover ? (
                                    <img
                                      src={card.frontCover}
                                      alt={`Card ${index + 1} Preview`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  )}
                                </div>
                                <div className="text-center mt-1">
                                  <span className="text-xs font-medium">Card {index + 1}</span>
                                  {selectedCardIndex === index && (
                                    <div className="text-xs text-blue-600 dark:text-blue-400">Selected</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <CardPreview 
                        card={generatedCard} 
                        onCardUpdate={(updatedCard) => {
                          setGeneratedCard(updatedCard);
                          // Also update the card in the cards array
                          setGeneratedCards(prev => {
                            const updated = [...prev];
                            updated[selectedCardIndex] = updatedCard;
                            return updated;
                          });
                        }}
                        isFrontBackOnly={isFrontBackOnly}
                        onPrint={handlePrintClick}
                        paperConfig={paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0]}
                        sectionLoadingStates={sectionLoadingStates}
                        // Pass paper size control props
                        selectedPaperSize={selectedPaperSize}
                        onPaperSizeChange={setSelectedPaperSize}
                        paperSizes={paperSizes}
                        isCardCompleted={isCardCompleted}
                        // Fast preview functionality
                        fastPreviewMode={fastPreviewMode && !isCardCompleted}
                        onViewFullCard={() => setFastPreviewMode(false)}
                      />
                    </CardContent>
                  </Card>
        )}

        {/* Empty State - Only show when no cards and not in draft mode */}
        {!generatedCard && !isDraftMode && draftCards.length === 0 && (
              <Card className="shadow-lg">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Ready to Create?
                  </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm max-w-sm">
                Describe your perfect card above and we'll bring it to life with creative magic!
                  </p>
                </CardContent>
              </Card>
            )}

        {/* Recent Cards Preview - Only show when no card is generated and not in draft mode */}
        {!generatedCard && !isDraftMode && draftCards.length === 0 && (
          <div className="mt-8">
            <RecentCardsPreview 
              maxCards={6}
              onCardSelect={(card) => {
                // When a card is selected from the preview, open the card viewer web app
                let cardId = card.id;
                
                // If shareUrl contains a card ID, extract it
                if (card.shareUrl && card.shareUrl.includes('/card/')) {
                  const urlParts = card.shareUrl.split('/card/');
                  if (urlParts.length > 1) {
                    cardId = urlParts[1].split('?')[0]; // Remove any query parameters
                  }
                }
                
                // Navigate to the card viewer web app
                window.open(`/card/${cardId}`, '_blank');
              }}
            />
          </div>
        )}

        {/* Template Customization Dialog */}
        <Dialog open={showTemplateCustomization} onOpenChange={setShowTemplateCustomization}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-purple-600" />
                Customize Template
              </DialogTitle>
              <DialogDescription>
                Personalize this template with your own changes, message, and reference images before generating.
              </DialogDescription>
            </DialogHeader>
            
            {selectedTemplate && (
              <div className="space-y-6 py-4">
                {/* Template Preview */}
                <div className="space-y-3">
                  <h4 className="font-medium">Selected Template</h4>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-start gap-4">
                      {selectedTemplate.frontCover && (
                        <img
                          src={selectedTemplate.frontCover}
                          alt="Template preview"
                          className="w-24 h-36 object-cover rounded-lg shadow-md"
                        />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Template Details:
                        </p>
                        <div className="space-y-3">
                          <div className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700 p-3 rounded border">
                            <p className="font-medium mb-2">Original Input:</p>
                            <p>{selectedTemplate.prompt}</p>
                          </div>
                          {selectedTemplate.generatedPrompts && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                              <p className="font-medium mb-2 text-blue-900 dark:text-blue-100">Generated Image Prompts:</p>
                              <div className="space-y-2 max-h-32 overflow-y-auto">
                                {selectedTemplate.generatedPrompts.frontCover && (
                                  <div>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">Front Cover:</span>
                                    <p className="text-xs mt-1">{selectedTemplate.generatedPrompts.frontCover.substring(0, 150)}...</p>
                                  </div>
                                )}
                                {selectedTemplate.generatedPrompts.backCover && (
                                  <div>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">Back Cover:</span>
                                    <p className="text-xs mt-1">{selectedTemplate.generatedPrompts.backCover.substring(0, 150)}...</p>
                                  </div>
                                )}
                                {selectedTemplate.generatedPrompts.leftInterior && (
                                  <div>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">Left Interior:</span>
                                    <p className="text-xs mt-1">{selectedTemplate.generatedPrompts.leftInterior.substring(0, 150)}...</p>
                                  </div>
                                )}
                                {selectedTemplate.generatedPrompts.rightInterior && (
                                  <div>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">Right Interior:</span>
                                    <p className="text-xs mt-1">{selectedTemplate.generatedPrompts.rightInterior.substring(0, 150)}...</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Prompt Customizations */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Additional Changes to Design (Optional)
                  </label>
                  <Textarea
                    placeholder="e.g., 'Change the message to say from Jordan', 'Make it more romantic', 'Add more flowers', 'Change colors to blue and gold'..."
                    value={templateCustomizations.promptChanges}
                    onChange={(e) => setTemplateCustomizations(prev => ({
                      ...prev,
                      promptChanges: e.target.value
                    }))}
                    rows={3}
                    className="resize-none"
                    style={{ fontSize: '16px' }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Describe any changes you want to make to the template design, style, or content.
                  </p>
                </div>

                {/* Message Customization */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Custom Message (Optional)
                  </label>
                  <Textarea
                    placeholder="Leave empty to auto-generate a message, or write your own custom message here..."
                    value={templateCustomizations.messageChanges}
                    onChange={(e) => setTemplateCustomizations(prev => ({
                      ...prev,
                      messageChanges: e.target.value
                    }))}
                    rows={4}
                    className="resize-none"
                    style={{ fontSize: '16px' }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This will replace the card's interior message. Leave blank to auto-generate.
                  </p>
                </div>

                {/* Reference Image Option */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="use-reference-image"
                      checked={templateCustomizations.useReferenceImage}
                      onChange={(e) => setTemplateCustomizations(prev => ({
                        ...prev,
                        useReferenceImage: e.target.checked,
                        referenceImageFile: null,
                        referenceImageUrls: [],
                        referenceImageTransformation: ""
                      }))}
                      className="rounded"
                    />
                    <label htmlFor="use-reference-image" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Add reference photo to personalize the card
                    </label>
                  </div>
                  
                  {templateCustomizations.useReferenceImage && (
                    <div className="space-y-4 pl-6 border-l-2 border-purple-200 dark:border-purple-800">
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        Upload a photo to create cartoon characters that look like the people in your photo!
                      </p>
                      
                      {/* File Upload */}
                      {!templateCustomizations.referenceImageFile ? (
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setTemplateCustomizations(prev => ({
                                  ...prev,
                                  referenceImageFile: file
                                }));
                              }
                            }}
                            className="hidden"
                            id="template-reference-upload"
                          />
                          <label htmlFor="template-reference-upload" className="cursor-pointer">
                            <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Upload reference photo
                            </div>
                          </label>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <div className="flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-purple-600" />
                              <span className="text-sm text-purple-800 dark:text-purple-200">
                                {templateCustomizations.referenceImageFile.name}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTemplateCustomizations(prev => ({
                                ...prev,
                                referenceImageFile: null
                              }))}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          {/* Transformation Instructions */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              How to use the reference photo
                            </label>
                            <Textarea
                              placeholder="e.g., 'Use this photo to create cartoon versions of me and my girlfriend on the front cover', 'Replace the people in the template with us', 'Make us look like the characters in the template style'..."
                              value={templateCustomizations.referenceImageTransformation}
                              onChange={(e) => setTemplateCustomizations(prev => ({
                                ...prev,
                                referenceImageTransformation: e.target.value
                              }))}
                              rows={3}
                              className="resize-none"
                              style={{ fontSize: '16px' }}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Describe how you want your photo to be incorporated into the template design.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowTemplateCustomization(false);
                      setSelectedTemplate(null);
                      setShowTemplateGallery(true); // Go back to template gallery
                    }}
                    className="flex-1"
                  >
                    Back to Templates
                  </Button>
                  <Button
                    onClick={handleApplyTemplateWithCustomizations}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Apply & Generate Card
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Template Gallery Dialog */}
        <Dialog open={showTemplateGallery} onOpenChange={setShowTemplateGallery}>
          <DialogContent className="w-[95vw] max-w-7xl h-[85vh] sm:max-h-[95vh] overflow-hidden p-0 flex flex-col">
            <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20 p-3 sm:p-6 flex-shrink-0">
              <DialogHeader>
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Eye className="w-4 h-4 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        Template Gallery
                      </DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        Find the perfect starting point for your card
                      </DialogDescription>
                    </div>
                  </div>
                  
                  {/* Show Prompts Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPrompts(!showPrompts)}
                    className="gap-1 sm:gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm h-8 sm:h-9 text-xs sm:text-sm"
                  >
                    <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">{showPrompts ? 'Hide' : 'Show'} Prompts</span>
                    <span className="sm:hidden">{showPrompts ? 'Hide' : 'Show'}</span>
                  </Button>
                </div>
              </DialogHeader>
            
              {/* Template Search Section - Compact Mobile Version */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-2 sm:p-6 shadow-sm space-y-2 sm:space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-3 h-3 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Search</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 hidden sm:block">Find templates by keywords or visual style</p>
                    </div>
                  </div>
                  
                  {/* Search Mode Toggle - Compact on mobile */}
                  <Select value={searchMode} onValueChange={(value: 'text' | 'ai' | 'hybrid') => setSearchMode(value)}>
                    <SelectTrigger className="w-20 sm:w-36 h-7 sm:h-10 border text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📝</span>
                          <span className="font-medium">Text Search</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="ai" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🎨</span>
                          <span className="font-medium">AI Vision</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="hybrid" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="text-base">⚡</span>
                          <span className="font-medium">Hybrid</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              
                {/* Search Mode Description - Hidden on mobile */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-1 sm:p-3 hidden sm:block">
                  <div className="text-xs sm:text-sm font-medium text-purple-900 dark:text-purple-100 mb-1">
                    {searchMode === 'text' && "📝 Text Search Mode"}
                    {searchMode === 'ai' && "🎨 AI Vision Mode"}
                    {searchMode === 'hybrid' && "⚡ Hybrid Search Mode"}
                  </div>
                  <div className="text-xs text-purple-700 dark:text-purple-300">
                    {searchMode === 'text' && "Fast keyword search through card descriptions + AI-generated visual prompts (instant results)"}
                    {searchMode === 'ai' && "AI analyzes card images for visual style, colors, and themes (10-15 seconds)"}
                    {searchMode === 'hybrid' && "Combines fast text search with AI visual analysis for best results"}
                  </div>
                </div>
                
                <div className="flex gap-1 sm:gap-3">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Search templates..."
                      value={templateSearchQuery}
                      onChange={(e) => setTemplateSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleTemplateSearch();
                        }
                      }}
                      disabled={isSearchingTemplates}
                      className="h-8 sm:h-12 pl-8 sm:pl-12 pr-3 border text-sm sm:text-base"
                      style={{ fontSize: '16px' }}
                    />
                    <div className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 sm:w-6 sm:h-6 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-800 dark:to-pink-800 rounded-full flex items-center justify-center">
                        <span className="text-xs">🔍</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={handleTemplateSearch}
                    disabled={isSearchingTemplates || !templateSearchQuery.trim()}
                    className={`h-8 sm:h-12 px-3 sm:px-6 gap-1 font-medium text-xs sm:text-base ${
                      searchMode === 'text' 
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700' 
                        : searchMode === 'ai'
                        ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'
                        : 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600'
                    } text-white shadow-md hover:shadow-lg transition-all`}
                  >
                    {isSearchingTemplates ? (
                      <>
                        <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span className="hidden sm:inline">{searchMode === 'hybrid' ? 'Analyzing...' : 'Searching...'}</span>
                      </>
                    ) : (
                      <>
                        {searchMode === 'text' && <span className="text-xs sm:text-lg">📝</span>}
                        {searchMode === 'ai' && <span className="text-xs sm:text-lg">🎨</span>}
                        {searchMode === 'hybrid' && <span className="text-xs sm:text-lg">⚡</span>}
                        <span className="hidden sm:inline">Search</span>
                      </>
                    )}
                  </Button>
                  {(templateSearchQuery || aiFilteredCards.length > 0 || textFilteredCards.length > 0) && (
                    <Button
                      variant="outline"
                      onClick={clearTemplateSearch}
                      className="h-8 sm:h-12 px-2 sm:px-4 gap-1 border"
                    >
                      <X className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Clear</span>
                    </Button>
                  )}
                </div>
              
                {/* Results Summary - Compact on mobile */}
                {aiFilteredCards.length > 0 && (searchMode === 'ai' || searchMode === 'hybrid') && (
                  <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-purple-600 dark:text-purple-400">
                    <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>
                      {searchMode === 'hybrid' ? 'Hybrid' : 'AI'} found {aiFilteredCards.length} matches
                      <span className="hidden sm:inline"> for "{templateSearchQuery}"</span>
                    </span>
                  </div>
                )}
                
                {textFilteredCards.length > 0 && searchMode === 'text' && (
                  <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-blue-600 dark:text-blue-400">
                    <span>📝</span>
                    <span>Found {textFilteredCards.length} matches<span className="hidden sm:inline"> for "{templateSearchQuery}"</span></span>
                  </div>
                )}
              </div>
            
            <div className="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-900 rounded-xl p-2 sm:p-4">
              {(aiFilteredCards.length > 0 && (searchMode === 'ai' || searchMode === 'hybrid')) || (textFilteredCards.length > 0 && searchMode === 'text') ? (
                // Show filtered results
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 rounded-lg flex items-center justify-center">
                      <span className="text-sm sm:text-base">
                        {searchMode === 'text' && '📝'}
                        {searchMode === 'ai' && '🎯'}
                        {searchMode === 'hybrid' && '⚡'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                        {searchMode === 'text' && 'Text Search Results'}
                        {searchMode === 'ai' && 'AI Vision Results'}
                        {searchMode === 'hybrid' && 'Hybrid Search Results'}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {searchMode === 'text' && 'Ranked by keyword relevance'}
                        {searchMode === 'ai' && 'Ranked by visual relevance'}
                        {searchMode === 'hybrid' && 'Ranked by combined relevance'}
                      </p>
                    </div>
                  </div>
                  <div 
                    className="flex overflow-x-scroll gap-3 sm:gap-4 pb-3 -mx-2 px-2 min-w-full"
                    style={{
                      scrollBehavior: 'smooth',
                      WebkitOverflowScrolling: 'touch',
                      scrollbarWidth: 'thin',
                      scrollSnapType: 'x mandatory',
                      touchAction: 'pan-x',
                      overflowX: 'scroll',
                      overflowY: 'hidden'
                    }}
                  >
                    {(searchMode === 'text' ? textFilteredCards : aiFilteredCards).map((card, index) => {
                      const frontImage = card.frontCover || card.backCover || card.leftPage || card.rightPage;
                      
                      return (
                        <div
                          key={card.id}
                          className="flex-shrink-0 w-48 sm:w-64 touch-pan-x"
                          style={{ scrollSnapAlign: 'start' }}
                        >
                          <div className={`${
                            searchMode === 'text' 
                              ? 'bg-gradient-to-br from-blue-900 to-indigo-900 border-blue-400' 
                              : searchMode === 'ai'
                              ? 'bg-gradient-to-br from-purple-900 to-blue-900 border-purple-400'
                              : 'bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 border-gradient-to-r border-blue-400'
                          } rounded-xl p-2 shadow-inner space-y-2 h-full border-2 relative flex flex-col`}>
                            {/* Score badge - positioned to not cover full image */}
                            <div className="absolute top-2 left-2 z-10 flex gap-1">
                              <Badge className={`${
                                searchMode === 'text' ? 'bg-blue-600' : 'bg-purple-600'
                              } text-white text-xs rounded-full shadow-md`}>
                                #{index + 1}
                              </Badge>
                              {(card.aiScore || card.textScore) && (
                                <Badge className="bg-green-600 text-white text-xs rounded-full shadow-md">
                                  {searchMode === 'text' ? card.textScore : card.aiScore}
                                  {searchMode === 'ai' || searchMode === 'hybrid' ? '%' : ''}
                                </Badge>
                              )}
                            </div>
                            
                            {frontImage ? (
                              <img
                                src={frontImage}
                                alt={`Template: ${card.prompt || 'Untitled'}`}
                                className="rounded-lg shadow-lg w-full h-auto object-cover select-none pointer-events-none"
                                loading="lazy"
                                style={{
                                  userSelect: 'none'
                                }}
                              />
                            ) : (
                              <div className="w-full h-32 sm:h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
                                <div className="text-center text-gray-500">
                                  <ImageIcon className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2" />
                                  <p className="text-xs sm:text-sm">No preview</p>
                                </div>
                              </div>
                            )}
                            
                            <div className={`text-xs ${
                              searchMode === 'text' ? 'text-blue-100 bg-blue-800/50' : 'text-purple-100 bg-purple-800/50'
                            } px-2 py-1 rounded space-y-1 flex-1 flex flex-col`}>
                              <div className="line-clamp-2">
                                {card.prompt?.substring(0, 50) || 'Untitled'}
                                {card.prompt && card.prompt.length > 50 && '...'}
                              </div>
                              
                              {/* Show Generated Prompts if enabled - Only on larger screens */}
                              {showPrompts && card.generatedPrompts && (
                                <div className="text-xs opacity-80 border-t border-white/20 pt-1 space-y-1 hidden sm:block">
                                  {card.generatedPrompts.frontCover && (
                                    <div>
                                      <span className="font-semibold">Front:</span> {card.generatedPrompts.frontCover.substring(0, 60)}
                                      {card.generatedPrompts.frontCover.length > 60 && '...'}
                                    </div>
                                  )}
                                  {card.generatedPrompts.backCover && (
                                    <div>
                                      <span className="font-semibold">Back:</span> {card.generatedPrompts.backCover.substring(0, 60)}
                                      {card.generatedPrompts.backCover.length > 60 && '...'}
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Action Buttons */}
                              <div className="flex flex-col gap-1 pt-2 mt-auto">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full h-6 sm:h-7 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Convert GalleryCard to GeneratedCard format for applyTemplate
                                    const template: GeneratedCard = {
                                      id: card.id,
                                      prompt: card.prompt || '',
                                      frontCover: card.frontCover || '',
                                      backCover: card.backCover || '',
                                      leftPage: card.leftPage || '',
                                      rightPage: card.rightPage || '',
                                      createdAt: new Date(card.createdAt * 1000),
                                      shareUrl: card.shareUrl,
                                      generatedPrompts: card.generatedPrompts
                                    };
                                    applyTemplate(template);
                                  }}
                                >
                                  <Wand2 className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                                  <span className="hidden sm:inline">Customize</span>
                                  <span className="sm:hidden">Custom</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full h-6 sm:h-7 text-xs bg-blue-600/80 border-blue-500/50 text-white hover:bg-blue-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Convert GalleryCard to GeneratedCard format for preview
                                    const template: GeneratedCard = {
                                      id: card.id,
                                      prompt: card.prompt || '',
                                      frontCover: card.frontCover || '',
                                      backCover: card.backCover || '',
                                      leftPage: card.leftPage || '',
                                      rightPage: card.rightPage || '',
                                      createdAt: new Date(card.createdAt * 1000),
                                      shareUrl: card.shareUrl,
                                      generatedPrompts: card.generatedPrompts
                                    };
                                    handleTemplateSelect(template);
                                  }}
                                >
                                  <Eye className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                                  Select
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Show all templates
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900 dark:to-cyan-900 rounded-lg flex items-center justify-center">
                      <span className="text-sm sm:text-base">📚</span>
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">All Templates</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Browse our entire collection</p>
                    </div>
                  </div>
                    <div 
                      className="flex overflow-x-scroll gap-3 sm:gap-4 pb-3 -mx-2 px-2 min-w-full"
                      style={{
                        scrollBehavior: 'smooth',
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'thin',
                        scrollSnapType: 'x mandatory',
                        touchAction: 'pan-x',
                        overflowX: 'scroll',
                        overflowY: 'hidden'
                      }}
                    >
                      {(() => {
                        const { getCachedCards, hasCache, totalCards } = useCardCache();
                        const allCards = hasCache ? getCachedCards(1, Math.max(totalCards, 1000)) : [];
                        
                        return allCards.map((card) => {
                          const frontImage = card.frontCover || card.backCover || card.leftPage || card.rightPage;
                          
                          return (
                            <div
                              key={card.id}
                              className="flex-shrink-0 w-48 sm:w-64 touch-pan-x"
                              style={{ scrollSnapAlign: 'start' }}
                            >
                              <div className="bg-gray-900 rounded-xl p-2 shadow-inner space-y-2 h-full flex flex-col">
                                {frontImage ? (
                                  <img
                                    src={frontImage}
                                    alt={`Template: ${card.prompt || 'Untitled'}`}
                                    className="rounded-lg shadow-lg w-full h-auto object-cover select-none pointer-events-none"
                                    loading="lazy"
                                    style={{
                                      userSelect: 'none'
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-32 sm:h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
                                    <div className="text-center text-gray-500">
                                      <ImageIcon className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2" />
                                      <p className="text-xs sm:text-sm">No preview</p>
                                    </div>
                                  </div>
                                )}

                                <div className="text-xs text-gray-100 bg-gray-800/50 px-2 py-1 rounded space-y-1 flex-1 flex flex-col">
                                  <div className="line-clamp-2">
                                    {card.prompt?.substring(0, 50) || 'Untitled'}
                                    {card.prompt && card.prompt.length > 50 && '...'}
                                  </div>
                                  
                                  {/* Show Generated Prompts if enabled - Only on larger screens */}
                                  {showPrompts && card.generatedPrompts && (
                                    <div className="text-xs opacity-80 border-t border-white/20 pt-1 space-y-1 hidden sm:block">
                                      {card.generatedPrompts.frontCover && (
                                        <div>
                                          <span className="font-semibold">Front:</span> {card.generatedPrompts.frontCover.substring(0, 60)}
                                          {card.generatedPrompts.frontCover.length > 60 && '...'}
                                        </div>
                                      )}
                                      {card.generatedPrompts.backCover && (
                                        <div>
                                          <span className="font-semibold">Back:</span> {card.generatedPrompts.backCover.substring(0, 60)}
                                          {card.generatedPrompts.backCover.length > 60 && '...'}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Action Buttons */}
                                  <div className="flex flex-col gap-1 pt-2 mt-auto">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full h-6 sm:h-7 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Convert GalleryCard to GeneratedCard format for applyTemplate
                                        const template: GeneratedCard = {
                                          id: card.id,
                                          prompt: card.prompt || '',
                                          frontCover: card.frontCover || '',
                                          backCover: card.backCover || '',
                                          leftPage: card.leftPage || '',
                                          rightPage: card.rightPage || '',
                                          createdAt: new Date(card.createdAt * 1000),
                                          shareUrl: card.shareUrl,
                                          generatedPrompts: card.generatedPrompts
                                        };
                                        applyTemplate(template);
                                      }}
                                    >
                                      <Wand2 className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                                      <span className="hidden sm:inline">Customize</span>
                                      <span className="sm:hidden">Custom</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full h-6 sm:h-7 text-xs bg-blue-600/80 border-blue-500/50 text-white hover:bg-blue-600"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Convert GalleryCard to GeneratedCard format for preview
                                        const template: GeneratedCard = {
                                          id: card.id,
                                          prompt: card.prompt || '',
                                          frontCover: card.frontCover || '',
                                          backCover: card.backCover || '',
                                          leftPage: card.leftPage || '',
                                          rightPage: card.rightPage || '',
                                          createdAt: new Date(card.createdAt * 1000),
                                          shareUrl: card.shareUrl,
                                          generatedPrompts: card.generatedPrompts
                                        };
                                        handleTemplateSelect(template);
                                      }}
                                    >
                                      <Eye className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                                      Select
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-gray-100 dark:bg-gray-800 p-3 sm:p-4 rounded-b-xl -m-3 sm:-m-6 mt-4 flex-shrink-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 rounded-full flex items-center justify-center">
                    <span className="text-xs">💡</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {aiFilteredCards.length > 0 
                      ? "AI has ranked these templates by relevance to your search"
                      : "Use 'Customize' to personalize templates or 'Select' to use as-is"
                    }
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowTemplateGallery(false);
                    clearTemplateSearch();
                  }}
                  className="gap-1 sm:gap-2 border-2 h-8 sm:h-9 text-xs sm:text-sm w-full sm:w-auto"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                  Close
                </Button>
              </div>
            </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Draft Card Preview Dialog */}
        <Dialog open={previewingDraftIndex !== -1} onOpenChange={(open) => !open && setPreviewingDraftIndex(-1)}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-purple-600" />
                Front Cover Design {previewingDraftIndex !== -1 ? (draftIndexMapping[previewingDraftIndex] + 1) : 1} - Preview
              </DialogTitle>
              <DialogDescription>
                Low quality preview of the front cover design. Select this design to generate the complete high-quality card.
              </DialogDescription>
            </DialogHeader>
            
            {previewingDraftIndex !== -1 && draftCards[previewingDraftIndex] && (
              <div className="space-y-6">
                {/* Full Card Preview */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <CardPreview 
                    card={draftCards[previewingDraftIndex]} 
                    onCardUpdate={() => {}} // Draft cards are read-only
                    isFrontBackOnly={true}
                    onPrint={() => {}} // No print functionality for draft previews
                    paperConfig={paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0]}
                    sectionLoadingStates={{
                      frontCover: 'completed',
                      backCover: 'idle',
                      leftInterior: 'idle',
                      rightInterior: 'idle'
                    }}
                    selectedPaperSize={selectedPaperSize}
                    onPaperSizeChange={() => {}} // No paper size change for draft previews
                    paperSizes={paperSizes}
                    isCardCompleted={false}
                    fastPreviewMode={false}
                    onViewFullCard={() => {}} // No full card view for draft previews
                  />
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-3 justify-center pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setPreviewingDraftIndex(-1)}
                  >
                    Close Preview
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedDraftIndex(previewingDraftIndex);
                      setPreviewingDraftIndex(-1);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Select This Design
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Print Confirmation Dialog */}
        <Dialog open={showPrintConfirmation} onOpenChange={setShowPrintConfirmation}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Get Your Card
              </DialogTitle>
              <DialogDescription>
                How would you like to receive your greeting card?
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Print Option Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Choose delivery method:
                </label>
                
                {/* Physical Print Option */}
                <div 
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    printOption === 'physical' 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setPrintOption('physical')}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        checked={printOption === 'physical'}
                        onChange={() => setPrintOption('physical')}
                        className="w-4 h-4 text-blue-600"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Printer className="w-5 h-5 text-blue-600" />
                        <h4 className="font-medium text-blue-900 dark:text-blue-100">
                          Physical Print & Pickup
                        </h4>
                      </div>
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        Print your card at our location. Ready for pickup in just a few minutes.
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span>High quality color printing</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span>
                            {isFrontBackOnly ? 'Front and back only' : 'Full greeting card with interior pages'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span>Ready for pickup shortly</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email PDF Option */}
                <div 
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    printOption === 'email' 
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setPrintOption('email')}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        checked={printOption === 'email'}
                        onChange={() => setPrintOption('email')}
                        className="w-4 h-4 text-green-600"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageCircle className="w-5 h-5 text-green-600" />
                        <h4 className="font-medium text-green-900 dark:text-green-100">
                          Email PDF
                        </h4>
                      </div>
                      <p className="text-sm text-green-800 dark:text-green-200">
                        Receive a high-quality PDF of your card at {userEmail}. Print at home or any print shop.
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span>Instant delivery to your inbox</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span>Print anywhere, anytime</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                          <span>High-resolution PDF optimized for printing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {printOption === 'physical' && (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Please confirm:</strong> You are ready to pick up your printed card from our location.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowPrintConfirmation(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmPrint}
                className={`flex-1 ${
                  printOption === 'email' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {printOption === 'email' ? (
                  <>
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Send PDF to Email
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Card
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 