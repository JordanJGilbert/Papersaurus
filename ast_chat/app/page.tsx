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
import { ArrowLeft, Sparkles, Printer, Heart, Gift, GraduationCap, Calendar, Wand2, MessageSquarePlus, ChevronDown, Settings, Zap, Palette, Edit3, Upload, X, Cake, ThumbsUp, PartyPopper, Trophy, TreePine, Stethoscope, CloudRain, Baby, Church, Home, MessageCircle, Eye, Wrench, Clock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import CardPreview from "@/components/CardPreview";
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { ModeToggle } from "@/components/mode-toggle";

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
    id: "pop-art", 
    label: "🎭 Pop Art", 
    description: "Bold, colorful comic book style",
    promptModifier: "in pop art style like Andy Warhol and Roy Lichtenstein, with bold colors, comic book elements, halftone dots, and graphic design aesthetics"
  },
  {
    id: "impressionist", 
    label: "🖼️ Impressionist", 
    description: "Soft brushstrokes like Monet",
    promptModifier: "in impressionist painting style like Monet and Renoir, with soft brush strokes, light and shadow play, and dreamy atmospheric effects"
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
    description: "Latest high-quality image model",
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

// Email Helper Function
async function sendThankYouEmail(toEmail: string, cardType: string, cardUrl: string) {
  if (!toEmail.trim()) return;
  
  try {
    // Send to user
    const userResponse = await fetch('https://16504442930.work/send_email_with_attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toEmail,
        from: 'vibecarding@ast.engineer',
        subject: `Your ${cardType} card is ready! 🎉`,
        body: `Hi there!

Thank you for using VibeCarding to create your beautiful ${cardType} card! 

We hope you love how it turned out. Your card has been generated and is ready for printing or sharing.

View your card: ${cardUrl}

If you have any questions or feedback, feel free to reach out to us.

Happy card making! ✨

Best regards,
The VibeCarding Team
vibecarding@ast.engineer`,
        url: cardUrl
      })
    });

    // Send copy to jordan@ast.engineer
    const adminResponse = await fetch('https://16504442930.work/send_email_with_attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'jordan@ast.engineer',
        from: 'vibecarding@ast.engineer',
        subject: `Card Created - ${cardType} for ${toEmail}`,
        body: `New card created on VibeCarding:

User: ${toEmail}
Card Type: ${cardType}
Card URL: ${cardUrl}

This is an automated notification of card creation activity.`,
        url: cardUrl
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
} = {}) {
  const {
    systemPrompt = null,
    model = 'gemini-2.5-pro',
    includeThoughts = false,  // Default to false to avoid thinking content in responses
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
  const [selectedArtisticStyle, setSelectedArtisticStyle] = useState<string>("ai-smart-style");
  const [customStyleDescription, setCustomStyleDescription] = useState<string>("");
  const [selectedImageModel, setSelectedImageModel] = useState<string>("gpt-image-1");

  // Progress tracking state
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);

  // Helper function to format countdown as MM:SS
  const formatCountdown = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Function to overlay QR code on back cover image
  const overlayQRCodeOnImage = async (imageUrl: string, cardUrl: string): Promise<string> => {
    console.log('🔧 Starting QR overlay for:', cardUrl);
    try {
      // Generate QR code as data URL
      console.log('📱 Generating QR code...');
      const qrCodeDataUrl = await QRCode.toDataURL(cardUrl, {
        width: 120, // Size in pixels (roughly 1 inch at 120 DPI)
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      console.log('✅ QR code generated successfully');

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
            const qrSize = 120; // Size of QR code
            const padding = 40; // Padding from edges
            const x = canvas.width - qrSize - padding;
            const y = canvas.height - qrSize - padding - 30; // Extra space for text
            
            console.log('📍 QR position:', x, y, 'on canvas:', canvas.width, 'x', canvas.height);
            
            // Cut out a clean section for the QR code with rounded corners
            const cutoutPadding = 15;
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
            
            // Add "View & Share Online" text
            ctx.fillStyle = '#666666';
            ctx.font = '10px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            const textX = x + qrSize / 2;
            const textY = y + qrSize + 15;
            ctx.fillText('View & Share Online', textX, textY);
            
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
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
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

  // Cleanup countdown interval on unmount
  useEffect(() => {
    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, [countdownInterval]);

  // Writing Assistant
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
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      
      const messagePrompt = `Create a ${toneDescription} message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${prompt}"
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

      const generatedMessage = await chatWithAI(messagePrompt, {
        model: "gemini-2.5-pro",
        includeThoughts: false  // Don't include thinking content in message generation
      });

      if (generatedMessage?.trim()) {
        // Extract message content between <MESSAGE> tags using regex
        const messageMatch = generatedMessage.match(/<MESSAGE>([\s\S]*?)<\/MESSAGE>/);
        const extractedMessage = messageMatch ? messageMatch[1].trim() : generatedMessage.trim();
        
        setFinalCardMessage(extractedMessage);
        toast.success("✨ Personalized message created!");
      }
    } catch (error) {
      toast.error("Failed to generate message. Please try again.");
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  // Helper function to analyze reference image and get text description
  const analyzeReferenceImage = async (imageUrl: string) => {
    try {
      const analysisPrompt = `Analyze this reference photo and provide a detailed description of the people and visual elements that can be used to recreate them as stylized cartoon/illustrated characters in a greeting card.

Focus on:
- Number of people and their approximate ages/relationships
- Hair colors, styles, and lengths
- Eye colors and facial features (in general terms)
- Clothing colors and styles
- Body language and poses
- Background elements or setting
- Overall mood and atmosphere

Provide a detailed but concise description that would help an artist recreate these people as charming, stylized cartoon characters while maintaining their key identifying features. Avoid realistic depictions - focus on cartoon/illustration style descriptions.

Format as a single paragraph description suitable for an image generation prompt.`;

      const response = await fetch('/internal/call_mcp_tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'analyze_images',
          arguments: {
            urls: [imageUrl],
            analysis_prompt: analysisPrompt
          }
        })
      });

      if (!response.ok) throw new Error(`Analysis failed: ${response.status}`);
      
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
      
      // Extract analysis from the analyze_images response structure
      if (result.status === 'success' && result.results && result.results.length > 0) {
        const firstResult = result.results[0];
        if (firstResult.status === 'success' && firstResult.analysis) {
          return firstResult.analysis;
        } else {
          throw new Error(firstResult.message || 'Image analysis failed');
        }
      }
      
      throw new Error('No analysis results returned');
      
    } catch (error) {
      console.error('Image analysis failed:', error);
      return null;
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

    // Use custom card type if selected, otherwise use the standard type
    const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
    const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
    const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";

    let messageContent = finalCardMessage;
    
    // Handle handwritten message case
    if (isHandwrittenMessage) {
      messageContent = "[Blank space for handwritten message]";
    } else if (!messageContent.trim() && !isFrontBackOnly) {
      // Auto-generate message if empty (but not for front/back only cards)
      setGenerationProgress("✍️ Penning the perfect words just for you...");
      setIsGeneratingMessage(true); // Show "Crafting the perfect message..." in button
      try {
        const autoMessagePrompt = `Create a ${toneDescription} message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${prompt}"
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
          const extractedMessage = messageMatch ? messageMatch[1].trim() : generatedMessage.trim();
          
          messageContent = extractedMessage;
          setFinalCardMessage(messageContent);
          setGenerationProgress("✅ Perfect message crafted! Now for the magic visuals...");
          toast.success("✨ Generated a personalized message for your card!");
        } else {
          messageContent = prompt;
        }
        setIsGeneratingMessage(false); // Reset message generation state
      } catch {
        messageContent = prompt;
        setIsGeneratingMessage(false); // Reset message generation state on error
      }
    }

    setIsGenerating(true);
    setGenerationProgress("🎨 Gathering artistic inspiration...");
    
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
        setGenerationProgress("✨ Our style experts are choosing the perfect look to wow your recipient...");
        try {
          const styleSelectionPrompt = `You are an expert art director specializing in beautiful, heartfelt greeting cards. Your job is to choose the perfect artistic style that will create a warm, emotional, and memorable card.

Card Details:
- Type: ${cardTypeForPrompt}
- Theme/Description: "${prompt}"
${toField ? `- Recipient: ${toField}` : ""}
${fromField ? `- Sender: ${fromField}` : ""}
${referenceImageUrl ? `- Has reference photo for transformation` : ""}
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
      setGenerationProgress(`🎯 Crafting ${numberOfCards} unique masterpiece design${numberOfCards > 1 ? 's' : ''}...`);
      
      // Create the base prompt generation query that will be used for each card variant
      const basePromptGenerationQuery = `Create ${isFrontBackOnly ? '2' : '4'} prompts for a cohesive, chronologically flowing ${cardTypeForPrompt} greeting card that tells a visual story (${paperConfig.aspectRatio} ratio):

🎨 CREATIVITY MANDATE: Be genuinely creative, unique, and innovative! Avoid generic or cliché designs. Think outside the box, surprise with unexpected elements, use bold artistic choices, and create something truly memorable and special. Push creative boundaries while staying appropriate for the card type and tone.

Theme: "${prompt}"
Style: ${selectedStyle?.label || "Default"}
Tone: ${selectedToneObj ? selectedToneObj.label : "Heartfelt"} - ${toneDescription}
${toField ? `To: ${toField}` : ""}
${fromField ? `From: ${fromField}` : ""}
${!isFrontBackOnly ? `Message: "${messageContent}"` : ""}
${isHandwrittenMessage ? "Note: Include space for handwritten message" : ""}
${referenceImageUrl ? `Reference: "${imageTransformation || 'artistic transformation'}"` : ""}

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
${referenceImageUrl ? `- Create cartoon/illustrated characters inspired by reference image - DO NOT make realistic depictions` : ''}

Create prompts that flow chronologically:

1. Front Cover (Opening Scene): BE GENUINELY CREATIVE AND UNIQUE! Include "${cardTypeForPrompt}" greeting text positioned safely in the center area (avoid top/bottom 10% of image). ${referenceImageUrl ? `I have included my own reference image. Create a stylized cartoon/illustrated character inspired by the reference image - DO NOT make realistic depictions of real people, instead create charming cartoon-style characters with simplified, friendly features.` : 'Create charming cartoon-style or stylized illustrated figures if people are needed for the theme.'} This is the story opening - introduce key visual elements (colors, motifs, artistic style) that will continue throughout the other sections. Think of something unexpected, innovative, and memorable that will surprise and delight the recipient. Avoid generic designs! Style: ${styleModifier}

2. ${!isFrontBackOnly ? `Left Interior (Story Development): UNLEASH YOUR CREATIVITY! You have complete creative freedom to design whatever you want for this left interior page! This is your artistic playground - create something genuinely innovative and unexpected that feels right for a ${cardTypeForPrompt} card with ${toneDescription} tone. You can include: scenes, landscapes, objects, patterns, quotes, text, illustrations, realistic art, abstract art, or anything else that inspires you - but NO PEOPLE or characters unless the user specifically mentioned wanting people in their card description. Position any text safely in center area (avoid top/bottom 10%). Think of something no one has done before! Surprise us with bold, imaginative, and memorable artistic choices while maintaining visual harmony with the overall card style and tone. Style: ${styleModifier}

3. Right Interior (Story Climax): BE CREATIVE WITH MESSAGE DESIGN! ${isHandwrittenMessage ? `Design with elegant writing space that complements the visual story from left interior. Position decorative elements safely away from top/bottom edges. Create innovative and artistic decorative elements, borders, or flourishes that are unique and memorable - NO PEOPLE or characters.` : `Include message text: "${messageContent}" positioned safely in center area (avoid top/bottom 10% of image) integrated into beautiful, innovative decorative artwork. Think beyond typical florals and patterns - create something unexpected and artistic that perfectly frames the message - NO PEOPLE or characters.`} This should feel like the emotional peak of the card experience, harmonizing with the left interior as a cohesive spread. Avoid cliché designs and create something genuinely special!${handwritingSampleUrl ? ' Match handwriting style.' : ''} Style: ${styleModifier}

4. ` : ''}Back Cover (Story Resolution): BE SUBTLY CREATIVE! Create a simple yet innovative decorative design that brings peaceful closure to the visual story. Reference subtle elements from the front cover but keep it minimal and serene - NO PEOPLE, just beautiful, unexpected artistic elements that go beyond typical patterns or florals. Think of something quietly beautiful and memorable that complements the overall design while being genuinely unique. This should feel like a peaceful, artistic ending that surprises with its subtle creativity. Style: ${styleModifier}

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
}

IMPORTANT: Create a completely unique and different interpretation for this specific card variant. Use different creative approaches, color schemes, compositions, and artistic elements while maintaining the same core theme and requirements.`;

      // Generate multiple unique prompt sets in parallel
      const promptGenerationPromises = Array.from({ length: numberOfCards }, (_, cardIndex) => {
        const uniquePromptQuery = basePromptGenerationQuery + `

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
          includeThoughts: false  // Don't include thinking content for prompt generation
        });
      });

      // Wait for all prompt generations to complete
      const allGeneratedPrompts = await Promise.all(promptGenerationPromises);
      
      setGenerationProgress(`✅ ${numberOfCards} brilliant design${numberOfCards > 1 ? 's' : ''} ready! Now painting them into reality...`);

      // // Debug: Send all prompts to debug endpoint
      // const debugSendPrompts = async () => {
      //   try {
      //     const allPrompts = allGeneratedPrompts.map((prompts, cardIndex) => [
      //       `CARD ${cardIndex + 1}:`,
      //       `FRONT COVER: ${prompts.frontCover}`,
      //       `BACK COVER: ${prompts.backCover}`,
      //       ...(isFrontBackOnly ? [] : [
      //         `LEFT INTERIOR: ${prompts.leftInterior}`,
      //         `RIGHT INTERIOR: ${prompts.rightInterior}`
      //       ])
      //     ].join('\n')).join('\n\n---\n\n');
          
      //     await fetch('https://16504442930.work/send_email_with_attachments', {
      //       method: 'POST',
      //       headers: { 'Content-Type': 'application/json' },
      //       body: JSON.stringify({ 
      //         body: allPrompts,
      //         to: 'cards1@ast.engineer'
      //       })
      //     });
      //   } catch (error) {
      //     // Silent fail - don't impact UI
      //   }
      // };
      

      // Generate all images in parallel
      setGenerationProgress(`🖼️ Generating your ${numberOfCards} card${numberOfCards > 1 ? 's' : ''} with ${isFrontBackOnly ? '2' : '4'} images each...`);
      
      // Analyze reference image first if provided
      let referenceImageDescription = null;
      if (referenceImageUrl) {
        setGenerationProgress(`🔍 Analyzing your reference photo to capture perfect details...`);
        toast.info("Analyzing reference photo...");
        
        referenceImageDescription = await analyzeReferenceImage(referenceImageUrl);
        
        if (referenceImageDescription) {
          setGenerationProgress(`✨ Reference photo analyzed! Creating your personalized card designs...`);
          toast.success("📝 Reference photo analyzed successfully!");
        } else {
          toast.info("Using reference photo as-is (analysis not available)");
        }
      }
      
      // Prepare input images for each section (now only for handwriting, not reference)
      const frontCoverInputImages: string[] = [];
      const backCoverInputImages: string[] = [];
      const leftInteriorInputImages: string[] = [];
      const rightInteriorInputImages: string[] = [];
      
      if (selectedImageModel === "gpt-image-1") {
        // Add handwriting sample to right interior for message styling
        if (handwritingSampleUrl && !isFrontBackOnly) {
          rightInteriorInputImages.push(handwritingSampleUrl);
        }
      }
        
        // Create payloads for all cards with their unique prompts
      const allCardPayloads: any[] = [];
      
      // Create payloads for each card with its unique prompts
      allGeneratedPrompts.forEach((generatedPrompts, cardIndex) => {
        // Enhance front cover prompt with reference image description if available
        let enhancedFrontCoverPrompt = generatedPrompts.frontCover;
        if (referenceImageDescription) {
          enhancedFrontCoverPrompt = `${generatedPrompts.frontCover}\n\nIMPORTANT: Based on this detailed description of people from the reference photo, create stylized cartoon/illustrated characters with these specific features: "${referenceImageDescription}". Transform these real people into charming, friendly cartoon-style characters while maintaining their key identifying characteristics (hair color, clothing, poses, etc.).`;
        }
        
        const cardPayloads = [
          {
            tool_name: "generate_images_with_prompts",
            arguments: {
              user_number: "+17145986105",
              prompts: [enhancedFrontCoverPrompt],
              model_version: selectedImageModel,
              aspect_ratio: paperConfig.aspectRatio,
              quality: "high",
              output_format: "jpeg",
              output_compression: 100,
              moderation: "auto"
              // Never pass reference image directly - always use text description
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
              model_version: selectedImageModel,
              aspect_ratio: paperConfig.aspectRatio,
              quality: "high",
              output_format: "jpeg",
              output_compression: 100,
              moderation: "auto",
              ...(backCoverInputImages.length > 0 && { input_images: [backCoverInputImages] })
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
                model_version: selectedImageModel,
                aspect_ratio: paperConfig.aspectRatio,
                quality: "high",
                output_format: "jpeg",
                output_compression: 100,
                moderation: "auto",
                ...(leftInteriorInputImages.length > 0 && { input_images: [leftInteriorInputImages] })
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
                model_version: selectedImageModel,
                aspect_ratio: paperConfig.aspectRatio,
                quality: "high",
                output_format: "jpeg",
                output_compression: 100,
                moderation: "auto",
                ...(rightInteriorInputImages.length > 0 && { input_images: [rightInteriorInputImages] })
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

      // Build final cards from completed images for email use
      const finalCards: GeneratedCard[] = [];
      for (let cardIndex = 0; cardIndex < numberOfCards; cardIndex++) {
        const card: GeneratedCard = {
          id: `card-${cardIndex}-${Date.now()}`,
          prompt: basePromptGenerationQuery,
          frontCover: completedImages.get(`${cardIndex}-0`) || "",
          backCover: completedImages.get(`${cardIndex}-1`) || "",
          leftPage: isFrontBackOnly ? (completedImages.get(`${cardIndex}-1`) || "") : (completedImages.get(`${cardIndex}-2`) || ""),
          rightPage: isFrontBackOnly ? (completedImages.get(`${cardIndex}-0`) || "") : (completedImages.get(`${cardIndex}-3`) || ""),
          createdAt: new Date()
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
        
        if (finalCards[i].backCover && cardUrl) {
          try {
            const originalBackCover = finalCards[i].backCover;
            console.log(`🔄 Applying QR overlay to card ${i + 1}...`);
            finalCards[i].backCover = await overlayQRCodeOnImage(originalBackCover, cardUrl);
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
      console.log('🔄 Updating displayed cards with QR codes...');
      setGeneratedCards(finalCards);
      
      // Also update the main displayed card if needed
      if (finalCards.length > 0) {
        setGeneratedCard(finalCards[0]);
      }
      
      console.log('✅ Displayed cards updated with QR codes');

      setGenerationProgress("");
      if (numberOfCards === 1) {
        toast.success("🎉 Your complete card with QR code is ready!");
      } else {
        toast.success(`🎉 All ${numberOfCards} cards with QR codes are ready! Choose your favorite below.`);
      }
      
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
            prompt: basePromptGenerationQuery,
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
            console.log('Card stored successfully, using pre-generated URL:', cardUrl);
            
            // Store the URL in the first card for later use by Share button
            if (finalCards[0]) {
              finalCards[0].shareUrl = cardUrl;
              // Also update the React state with the share URL
              setGeneratedCards(prevCards => {
                const updated = [...prevCards];
                if (updated[0]) {
                  updated[0].shareUrl = cardUrl;
                }
                return updated;
              });
            }
            
            sendThankYouEmail(userEmail, cardTypeForEmail, cardUrl);
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

  const handlePrint = () => {
    if (!generatedCard) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    // Get paper size configuration
    const paperConfig = paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0];
    const pageWidth = paperConfig.printWidth;
    const pageHeight = paperConfig.printHeight;

    const frontBackOnlyPrint = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Greeting Card - Front/Back Layout (${paperConfig.label})</title>
          <style>
            @page { size: ${pageWidth} ${pageHeight} landscape; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; background: white; }
            .card-layout { 
              width: 100%; 
              height: 100vh; 
              display: flex; 
            }
            .card-container { 
              display: flex; 
              width: 100vw; 
              height: 100vh; 
            }
            .card-half { 
              width: 50%; 
              height: 100%; 
              overflow: hidden;
            }
            .card-image { 
              width: 100%; 
              height: 100%; 
              object-fit: contain;
              object-position: center;
            }
            .instructions { 
              position: absolute; 
              top: 10px; 
              left: 10px; 
              background: rgba(255,255,255,0.95); 
              padding: 8px; 
              border-radius: 4px; 
              font-size: 11px; 
              max-width: 200px;
              border: 1px solid #ddd;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .instructions { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="instructions">
            <strong>📄 ${paperConfig.label} Layout</strong><br/>
            Print size: ${pageWidth} × ${pageHeight}<br/>
            Fold along center line → Final card: ${pageWidth === '10in' ? '5×7 inches' : '4.13×5.83 inches'}
          </div>
          <div class="card-layout">
            <div class="card-container">
              <div class="card-half">
                <img src="${generatedCard.backCover}" alt="Back Cover" class="card-image" />
              </div>
              <div class="card-half">
                <img src="${generatedCard.frontCover}" alt="Front Cover" class="card-image" />
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const fullCardPrint = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Greeting Card - Complete Layout (${paperConfig.label})</title>
          <style>
            @page { size: ${pageWidth} ${pageHeight} landscape; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; background: white; }
            
            /* Page layouts */
            .card-layout { 
              width: 100%; 
              height: 100vh; 
              display: flex; 
              page-break-after: always;
            }
            .card-layout:last-child { page-break-after: auto; }
            
            .card-container { 
              display: flex; 
              width: 100vw; 
              height: 100vh; 
            }
            
            .card-half { 
              width: 50%; 
              height: 100%; 
              overflow: hidden;
            }
            .card-image { 
              width: 100%; 
              height: 100%; 
              object-fit: contain;
              object-position: center;
            }
            .section-label {
              position: absolute;
              top: 10px;
              left: 10px;
              background: rgba(255,255,255,0.9);
              padding: 4px 8px;
              font-size: 12px;
              border-radius: 4px;
              color: #666;
              border: 1px solid #ddd;
            }
            .instructions { 
              position: absolute; 
              top: 10px; 
              right: 10px; 
              background: rgba(255,255,255,0.95); 
              padding: 8px; 
              border-radius: 4px; 
              font-size: 11px; 
              max-width: 250px;
              border: 1px solid #ddd;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .instructions { display: none; }
              .section-label { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="instructions">
            <strong>📄 ${paperConfig.label} Duplex Layout</strong><br/>
            Print size: ${pageWidth} × ${pageHeight} (2 pages)<br/>
            Final card: ${pageWidth === '10in' ? '5×7 inches' : '4.13×5.83 inches'}<br/>
            Print duplex → "flip on short edge" → fold center line
          </div>
          
          <!-- Page 1: Outside of card (Back + Front) -->
          <div class="card-layout">
            <div class="card-container">
              <div class="card-half" style="position: relative;">
                <div class="section-label">Back Cover</div>
                <img src="${generatedCard.backCover}" alt="Back Cover" class="card-image" />
              </div>
              <div class="card-half" style="position: relative;">
                <div class="section-label">Front Cover</div>
                <img src="${generatedCard.frontCover}" alt="Front Cover" class="card-image" />
              </div>
            </div>
          </div>
          
          <!-- Page 2: Inside of card (Left + Right Interior) - Rotated 180° for duplex printing -->
          <div class="card-layout" style="transform: rotate(180deg);">
            <div class="card-container">
              <div class="card-half" style="position: relative;">
                <div class="section-label">Left Interior</div>
                <img src="${generatedCard.leftPage}" alt="Left Interior" class="card-image" />
              </div>
              <div class="card-half" style="position: relative;">
                <div class="section-label">Right Interior</div>
                <img src="${generatedCard.rightPage}" alt="Right Interior" class="card-image" />
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const printHTML = isFrontBackOnly ? frontBackOnlyPrint : fullCardPrint;

    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      }, 1000);
    };

    const finalCardSize = pageWidth === '10in' ? '5×7 inches' : '4.13×5.83 inches';
    const cardType = isFrontBackOnly ? 'Front/Back only' : 'Full card';
    toast.success(`${cardType} ready to print! Final card: ${finalCardSize}`);
  };

  const handleRemotePrint = async () => {
    if (!generatedCard) return;
    
    try {
      // Send complete card data for PDF creation and printing
      const cardData = {
        front_cover: generatedCard.frontCover,
        back_cover: generatedCard.backCover,
        left_page: generatedCard.leftPage,
        right_page: generatedCard.rightPage,
        card_name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
        paper_size: selectedPaperSize,
        is_front_back_only: isFrontBackOnly,
        copies: 1,
        color_mode: 'color',
        quality: 'high'
      };

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
        toast.success(`🖨️ ${cardType} queued for printing${duplexInfo}! Job ID: ${result.job_id.substring(0, 8)}...`);
        
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
                  toast.success("✅ Card printed successfully!");
                  return;
                } else if (statusResult.job.status === 'failed') {
                  toast.error(`❌ Print job failed: ${statusResult.job.error_message || 'Unknown error'}`);
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
    } catch (error) {
      console.error('Remote print error:', error);
      toast.error("Failed to queue remote print job");
    }
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
                    VibeCarding
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
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Card Type
                  </label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger>
                      <SelectValue>
                        {(() => {
                          const selected = cardTypes.find((type) => type.id === selectedType);
                          if (!selected) return <span className="text-gray-400">Choose card type</span>;
                          const IconComponent = selected.icon;
                          return (
                            <div className="flex items-center gap-2">
                              <IconComponent className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">{selected.label}</span>
                            </div>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {cardTypes.map((type) => {
                        const IconComponent = type.icon;
                        return (
                          <SelectItem key={type.id} value={type.id}>
                            <div className="flex items-center gap-2">
                              <IconComponent className="w-4 h-4 text-gray-500" />
                              <div>
                                <div className="font-medium">{type.label}</div>
                                <div className="text-xs text-muted-foreground">{type.description}</div>
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  
                  {/* Custom Card Type Input */}
                  {selectedType === "custom" && (
                    <div className="mt-3">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        Describe Your Card Type
                      </label>
                      <Input
                        placeholder="e.g., Promotion, Moving Away, First Day of School..."
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

            {/* User Email Field */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Your Email (Required)
              </label>
              <Input
                type="email"
                placeholder="your.email@example.com"
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
                  disabled={isGeneratingMessage || !prompt.trim() || isHandwrittenMessage}
                  className="gap-1 text-xs"
                >
                  <MessageSquarePlus className="w-3 h-3" />
                  {isGeneratingMessage ? "Writing..." : "Help me write"}
                </Button>
                          </div>
                  <Textarea
                placeholder={isHandwrittenMessage ? "Leave blank - you'll handwrite your message" : "Write your message here, or click 'Help me write' for inspiration..."}
                value={finalCardMessage}
                onChange={(e) => setFinalCardMessage(e.target.value)}
                    rows={3}
                    className="resize-none"
                    style={{ fontSize: '16px' }}
                disabled={isHandwrittenMessage}
                  />
                  
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

            {/* Reference Photo */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Reference Photo (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Upload a photo to transform into stylized card artwork!
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                ✨ For your privacy, photos are transformed into cartoon or illustrated style - not exact replicas
              </p>
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
                      <SelectItem value="1">
                        <div>
                          <div className="font-medium">1 Card</div>
                          <div className="text-xs text-muted-foreground">Single card generation</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="2">
                        <div>
                          <div className="font-medium">2 Cards</div>
                          <div className="text-xs text-muted-foreground">Generate 2 variations to choose from</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="3">
                        <div>
                          <div className="font-medium">3 Cards</div>
                          <div className="text-xs text-muted-foreground">Generate 3 variations to choose from</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="4">
                        <div>
                          <div className="font-medium">4 Cards</div>
                          <div className="text-xs text-muted-foreground">Generate 4 variations to choose from</div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {numberOfCards > 1 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                      ✨ Multiple cards will be generated in parallel with the same prompt for creative variety
                    </p>
                  )}
                </div>

                {/* Print Options */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                    Print Options
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="front-back-only"
                        checked={isFrontBackOnly}
                        onChange={(e) => setIsFrontBackOnly(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="front-back-only" className="text-sm text-gray-600 dark:text-gray-400">
                        Front/Back only (for single-sided printers)
                      </label>
                    </div>
                    {isFrontBackOnly && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 ml-6">
                        💡 Perfect for single-sided printers - you can write your message inside the folded card
                      </p>
                    )}
                  </div>
                </div>

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
              </CollapsibleContent>
            </Collapsible>

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

                {/* Generate Button */}
                <Button
                  onClick={handleGenerateCard}
                  disabled={isGenerating || isGeneratingMessage || !prompt.trim() || !userEmail.trim()}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 h-12"
                  size="lg"
                >
                  {isGenerating || isGeneratingMessage ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      {isGeneratingMessage ? (
                        <span>✨ Crafting the perfect message...</span>
                      ) : countdown > 0 ? (
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-2" />
                          <span className={countdown <= 10 ? 'text-yellow-200 animate-pulse' : ''}>
                            ✨ {formatCountdown(countdown)} of magic remaining
                          </span>
                        </div>
                      ) : generationProgress ? (
                        <span>{generationProgress}</span>
                      ) : (
                        <span>✨ Crafting magic...</span>
                      )}
                    </>
                  ) : (
                    <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  {numberOfCards > 1 ? `Create ${numberOfCards} Cards` : 'Create Card'}
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
                          <CardTitle>
                            {numberOfCards > 1 ? `Your Cards (${generatedCards.length} Generated)` : 'Your Card'}
                          </CardTitle>
                          <CardDescription>
                            Created {generatedCard.createdAt.toLocaleDateString()}
                            {numberOfCards > 1 && ` • Viewing Card ${selectedCardIndex + 1} of ${generatedCards.length}`}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={handlePrint}>
                            <Printer className="w-4 h-4 mr-1" />
                            Print
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleRemotePrint}>
                            <Printer className="w-4 h-4 mr-1" />
                            Remote Print
                          </Button>
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
                        onPrint={handlePrint}
                        paperConfig={paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0]}
                        sectionLoadingStates={sectionLoadingStates}
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
                Describe your perfect card above and we'll bring it to life with creative magic!
                  </p>
                </CardContent>
              </Card>
            )}
      </div>
    </div>
  );
} 