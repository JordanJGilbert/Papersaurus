"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Wrench, Cake, ThumbsUp, Heart, Trophy, TreePine, Stethoscope, 
  CloudRain, GraduationCap, Baby, Church, Gift, Home, MessageCircle, Eye,
  Upload, X, Wand2, Sparkles, Send, LoaderCircle, Clock, Users, Printer, Mail, Trash2
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { useCardStudio } from "@/hooks/useCardStudio";
import { useCardForm } from "@/hooks/useCardForm";
import { PhotoReference, artisticStyles } from "@/hooks/cardStudio/constants";
import { chatWithAI } from "@/hooks/cardStudio/utils";
import CardPreview from "@/components/CardPreview";
import { DebugPanel } from "@/components/DebugPanel";
// Stripe payment removed - free PDF print only
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useSession } from "next-auth/react";
import PAPERSAURUS_CONFIG from "@/lib/papersaurus-integration";

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://papersaurus.com';

// Card types with icons
const cardTypes = [
  { id: "custom", label: "Custom", description: "Create your own", icon: Wrench, emoji: "✨", color: "from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800" },
  { id: "birthday", label: "Birthday", description: "Celebrate another year of life", icon: Cake, emoji: "🎂", color: "from-pink-100 to-pink-200 dark:from-pink-900 dark:to-pink-800" },
  { id: "thank-you", label: "Thank You", description: "Express gratitude", icon: ThumbsUp, emoji: "🙏", color: "from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800" },
  { id: "anniversary", label: "Anniversary", description: "Commemorate special milestones", icon: Heart, emoji: "💑", color: "from-red-100 to-red-200 dark:from-red-900 dark:to-red-800" },
  { id: "congratulations", label: "Congratulations", description: "Celebrate achievements", icon: Trophy, emoji: "🎉", color: "from-yellow-100 to-yellow-200 dark:from-yellow-900 dark:to-yellow-800" },
  { id: "holiday", label: "Holiday", description: "Seasonal and holiday greetings", icon: TreePine, emoji: "🎄", color: "from-green-100 to-green-200 dark:from-green-900 dark:to-green-800" },
  { id: "get-well", label: "Get Well Soon", description: "Send healing wishes", icon: Stethoscope, emoji: "💐", color: "from-teal-100 to-teal-200 dark:from-teal-900 dark:to-teal-800" },
  { id: "sympathy", label: "Sympathy", description: "Offer comfort", icon: CloudRain, emoji: "🕊️", color: "from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700" },
  { id: "love", label: "Love & Romance", description: "Express romantic feelings", icon: Heart, emoji: "💕", color: "from-rose-100 to-rose-200 dark:from-rose-900 dark:to-rose-800" },
  { id: "graduation", label: "Graduation", description: "Academic achievements", icon: GraduationCap, emoji: "🎓", color: "from-indigo-100 to-indigo-200 dark:from-indigo-900 dark:to-indigo-800" },
  { id: "new-baby", label: "New Baby", description: "Welcome new arrivals", icon: Baby, emoji: "👶", color: "from-cyan-100 to-cyan-200 dark:from-cyan-900 dark:to-cyan-800" },
  { id: "wedding", label: "Wedding", description: "Celebrate unions and marriages", icon: Church, emoji: "💒", color: "from-violet-100 to-violet-200 dark:from-violet-900 dark:to-violet-800" },
];

// Card tone/style options
const cardTones = [
  { id: "funny", label: "😄 Funny", description: "Humorous and lighthearted", color: "from-yellow-100 to-orange-100 dark:from-yellow-900 dark:to-orange-900" },
  { id: "romantic", label: "💕 Romantic", description: "Sweet and loving", color: "from-pink-100 to-rose-100 dark:from-pink-900 dark:to-rose-900" },
  { id: "professional", label: "👔 Professional", description: "Formal and business-ready", color: "from-slate-100 to-gray-100 dark:from-slate-900 dark:to-gray-900" },
  { id: "heartfelt", label: "❤️ Heartfelt", description: "Sincere and emotional", color: "from-red-100 to-pink-100 dark:from-red-900 dark:to-pink-900" },
  { id: "playful", label: "🎉 Playful", description: "Fun and energetic", color: "from-cyan-100 to-blue-100 dark:from-cyan-900 dark:to-blue-900" },
  { id: "elegant", label: "✨ Elegant", description: "Sophisticated and refined", color: "from-violet-100 to-indigo-100 dark:from-violet-900 dark:to-indigo-900" },
  { id: "casual", label: "😊 Casual", description: "Relaxed and friendly", color: "from-green-100 to-teal-100 dark:from-green-900 dark:to-teal-900" },
];

export default function SinglePageCardCreator() {
  const { data: session } = useSession();
  const cardStudio = useCardStudio();
  const cardForm = useCardForm();
  const { formData, updateFormData } = cardForm;
  
  // Check if embedded in Papersaurus
  const isEmbedded = PAPERSAURUS_CONFIG.isEmbedded();
  const embeddedStyles = PAPERSAURUS_CONFIG.getEmbeddedStyles();
  
  // Timer state for generation time tracking
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime] = useState(150); // 2:30 for generating 2 cards (4 images)
  
  // Use cardStudio's elapsed time if available (for restoration)
  // Make sure to round to whole seconds to avoid decimal display
  const displayElapsedTime = Math.floor(cardStudio.currentElapsedTime || elapsedTime);
  
  // Mobile optimization states
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [showPhotoIdentification, setShowPhotoIdentification] = useState(false);
  const [photoDescription, setPhotoDescription] = useState("");
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  
  // Print dialog states
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printOption, setPrintOption] = useState<'physical' | 'email' | 'epson' | 'frontOnly' | 'exterior' | 'interior'>('physical');
  const [cardToPrint, setCardToPrint] = useState<any>(null);
  
  // Payment states removed - free PDF only now
  
  // Message generation state
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  
  // Auto-populate email from Google account when signed in
  useEffect(() => {
    if (session?.user?.email && !formData.userEmail) {
      updateFormData({ userEmail: session.user.email });
    }
  }, [session, formData.userEmail, updateFormData]);

  // Sync cardStudio state with form data
  useEffect(() => {
    cardStudio.setSelectedType(formData.selectedType);
    cardStudio.setCustomCardType(formData.customCardType); // Add this line to sync custom card type
    cardStudio.setSelectedTone(formData.selectedTone);
    cardStudio.setToField(formData.toField);
    cardStudio.setFromField(formData.fromField);
    cardStudio.setRelationshipField(formData.relationshipField);
    cardStudio.setPrompt(formData.prompt);
    cardStudio.setSelectedArtisticStyle(formData.selectedArtisticStyle || 'ai-smart-style');
    cardStudio.setCustomStyleDescription(formData.customStyleDescription || '');
    cardStudio.setUserEmail(formData.userEmail); // Sync email here too
    cardStudio.setPersonalTraits(formData.personalTraits || ''); // Sync personal traits
    cardStudio.setFinalCardMessage(formData.finalCardMessage || ''); // Sync message
    cardStudio.setIsHandwrittenMessage(formData.isHandwrittenMessage || false); // Sync handwritten flag
    
    // IMPORTANT: Set front/back only mode - now false for 4 panels
    cardStudio.setIsFrontBackOnly(false);
  }, [formData]);
  
  // Sync reference images from cardStudio to form for persistence
  useEffect(() => {
    if (cardStudio.referenceImageUrls.length > 0 || cardStudio.photoReferences.length > 0) {
      updateFormData({
        referenceImageUrls: cardStudio.referenceImageUrls,
        photoReferences: cardStudio.photoReferences
      });
    }
  }, [cardStudio.referenceImageUrls, cardStudio.photoReferences, updateFormData]);

  // Restore saved card designs on mount
  useEffect(() => {
    const savedDesigns = localStorage.getItem('vibe-card-designs');
    if (savedDesigns) {
      try {
        const parsed = JSON.parse(savedDesigns);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cardStudio.setCardDesigns(parsed);
        }
      } catch (e) {
        console.error('Failed to restore card designs:', e);
      }
    }
  }, []);

  // Save card designs to localStorage whenever they change
  useEffect(() => {
    if (cardStudio.cardDesigns.length > 0 && cardStudio.cardDesigns.some(d => d !== null)) {
      try {
        localStorage.setItem('vibe-card-designs', JSON.stringify(cardStudio.cardDesigns));
      } catch (e) {
        console.error('Failed to save card designs:', e);
      }
    }
  }, [cardStudio.cardDesigns]);

  // Compress image if needed
  const compressImage = async (file: File, maxSizeMB: number = 10): Promise<File> => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    if (file.size <= maxSizeBytes) {
      return file;
    }
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          let { width, height } = img;
          const maxDimension = 2048;
          
          if (width > height && width > maxDimension) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            0.85
          );
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Photo upload handler
  const handleFileUpload = async (file: File) => {
    // Validate file type - allow all image types including HEIC
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const hasValidType = validTypes.includes(file.type) || 
                        file.name.toLowerCase().endsWith('.heic') || 
                        file.name.toLowerCase().endsWith('.heif') ||
                        file.type.startsWith('image/');
    
    if (!hasValidType) {
      toast.error("Please upload a valid image file");
      return;
    }
    
    try {
      const maxSize = 10 * 1024 * 1024; // 10MB
      let fileToUpload = file;
      
      if (file.size > maxSize) {
        toast.info("Compressing large image...");
        fileToUpload = await compressImage(file, 10);
        toast.success(`Image compressed from ${(file.size / 1024 / 1024).toFixed(1)}MB to ${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB`);
      }
      
      await cardStudio.handleFileUpload(fileToUpload, 'reference');
      // Show photo identification prompt after successful upload
      // Since we only support one photo, always use index 0
      setCurrentPhotoIndex(0);
      setPhotoDescription("");
      setShowPhotoIdentification(true);
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file");
    }
  };

  // Handle remove image
  const handleRemoveImage = (index: number) => {
    cardStudio.handleRemoveReferenceImage(index);
    // Clear description if removing the only image
    if (cardStudio.referenceImageUrls.length === 1) {
      setPhotoDescription("");
    }
  };
  
  // Handle photo identification submission
  const handlePhotoIdentificationSubmit = () => {
    if (photoDescription.trim()) {
      // Update or add the photo reference for the current photo
      const currentReferences = cardStudio.photoReferences || [];
      const newReferences = [...currentReferences];
      
      // Find if this photo already has a reference
      const existingIndex = newReferences.findIndex(ref => ref.imageIndex === currentPhotoIndex);
      
      if (existingIndex >= 0) {
        // Update existing reference
        newReferences[existingIndex] = {
          imageUrl: cardStudio.referenceImageUrls[currentPhotoIndex],
          imageIndex: currentPhotoIndex,
          description: photoDescription.trim()
        };
      } else {
        // Add new reference
        newReferences.push({
          imageUrl: cardStudio.referenceImageUrls[currentPhotoIndex],
          imageIndex: currentPhotoIndex,
          description: photoDescription.trim()
        });
      }
      
      cardStudio.setPhotoReferences(newReferences);
      // Removed redundant toast - user knows they saved the photo context
    }
    setShowPhotoIdentification(false);
  };

  // Generate message using AI
  const handleGenerateMessage = async () => {
    if (!formData.selectedType || !formData.selectedTone) {
      toast.error("Please select a card type and tone first");
      return;
    }

    setIsGeneratingMessage(true);
    try {
      const cardTypeLabel = formData.selectedType === 'custom' ? formData.customCardType : formData.selectedType;
      const toneLabel = cardTones.find(t => t.id === formData.selectedTone)?.label || formData.selectedTone;
      
      // Build context for message generation
      let context = `Generate a heartfelt message for a ${cardTypeLabel} card with a ${toneLabel} tone.`;
      
      if (formData.toField) {
        context += ` The card is for ${formData.toField}.`;
      }
      if (formData.fromField) {
        context += ` The card is from ${formData.fromField}.`;
      }
      if (formData.relationshipField) {
        context += ` ${formData.toField || 'The recipient'} is ${formData.fromField || 'the sender'}'s ${formData.relationshipField}.`;
      }
      if (formData.personalTraits) {
        context += ` Personal context: ${formData.personalTraits}`;
      }

      const prompt = `${context}

Create a warm, personalized message that:
- Matches the ${toneLabel} tone perfectly
- Is appropriate for a ${cardTypeLabel} card
- Feels genuine and heartfelt
- Is 2-4 sentences long
- Avoids clichés and generic phrases
${formData.selectedTone === 'funny' ? '- Includes appropriate humor or wit' : ''}
${formData.selectedTone === 'romantic' ? '- Expresses deep love and affection' : ''}
${formData.selectedTone === 'professional' ? '- Maintains a respectful, formal tone' : ''}
${formData.toField ? `\nIMPORTANT: Start with an appropriate greeting for "${formData.toField}" based on the ${toneLabel} tone:
- Funny: "Hey ${formData.toField}," or "${formData.toField}!"
- Professional: "Dear ${formData.toField},"
- Romantic: "My Dearest ${formData.toField}," or "Beloved ${formData.toField},"
- Heartfelt: "Dear ${formData.toField}," or "Dearest ${formData.toField},"
- Playful: "Hey there ${formData.toField}!" or "Hiya ${formData.toField}!"` : ''}
${formData.fromField ? `\nIMPORTANT: End with an appropriate closing and signature from "${formData.fromField}" based on the ${toneLabel} tone:
- Romantic: "With all my love,\\n${formData.fromField}" or "Forever yours,\\n${formData.fromField}"
- Heartfelt/Family: "Love,\\n${formData.fromField}" or "With love,\\n${formData.fromField}"
- Funny: "Your favorite troublemaker,\\n${formData.fromField}" or "Stay awesome,\\n${formData.fromField}"
- Professional: "Best regards,\\n${formData.fromField}" or "Sincerely,\\n${formData.fromField}"
- Playful: "Hugs,\\n${formData.fromField}" or "XOXO,\\n${formData.fromField}"` : ''}

Return ONLY the message text, no quotes, no explanations.`;

      const response = await chatWithAI(prompt, {
        model: 'gemini-2.5-pro'
      });

      if (response && typeof response === 'string') {
        updateFormData({ finalCardMessage: response.trim() });
        toast.success("Message generated!");
      } else {
        throw new Error("Invalid response from AI");
      }
    } catch (error) {
      console.error("Error generating message:", error);
      toast.error("Failed to generate message. Please try again.");
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  // Generate card
  const handleGenerateCard = async () => {
    // Check if user is signed in
    if (!session) {
      toast.error("Please sign in with Google to generate cards");
      return;
    }
    
    // Validate required fields
    if (!formData.selectedType) {
      toast.error("Please select a card type");
      return;
    }
    if (!formData.selectedTone) {
      toast.error("Please select a card tone");
      return;
    }
    if (!formData.userEmail) {
      toast.error("Please enter an email address");
      return;
    }
    if (formData.selectedArtisticStyle === 'custom' && !formData.customStyleDescription?.trim()) {
      toast.error("Please describe your custom artistic style");
      return;
    }

    // Log current state
    console.log("Starting generation with email:", cardStudio.userEmail);
    
    // Reset timer state for regeneration
    setGenerationStartTime(null);
    setElapsedTime(0);
    
    // Start generation timer with fresh start time
    setGenerationStartTime(Date.now());

    // Auto-scroll immediately when generate button is clicked
    setTimeout(() => {
      const cardSection = document.getElementById('generated-cards-section');
      if (cardSection) {
        cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);

    // Start generation - this will create 2 front/back cards since we set isFrontBackOnly
    try {
      // The handleGenerateCardDesigns function handles everything including WebSocket setup
      await cardStudio.handleGenerateCardDesigns();
    } catch (error) {
      console.error("Error generating card:", error);
      toast.error("Failed to generate card");
      setGenerationStartTime(null);
    }
  };

  // Update elapsed time every second
  useEffect(() => {
    if (generationStartTime && cardStudio.isGenerating) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - generationStartTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
      
      return () => clearInterval(interval);
    } else if (!cardStudio.isGenerating && generationStartTime) {
      // Generation completed, clear the timer
      setGenerationStartTime(null);
    }
  }, [generationStartTime, cardStudio.isGenerating]);
  
  // Track if we've auto-scrolled
  const [hasAutoScrolled, setHasAutoScrolled] = useState(false);
  
  // Monitor when cards complete and auto-scroll
  useEffect(() => {
    if (cardStudio.cardDesigns.length > 0) {
      const completedCount = cardStudio.cardDesigns.filter(Boolean).length;
      
      // Auto-scroll when first card completes (only once)
      if (completedCount >= 1 && !hasAutoScrolled) {
        const cardSection = document.getElementById('generated-cards-section');
        if (cardSection) {
          cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setHasAutoScrolled(true);
        }
      }
      
      // Auto-select first completed card
      if (completedCount >= 1 && selectedCardIndex === 0 && !cardStudio.cardDesigns[0]) {
        const firstCompletedIndex = cardStudio.cardDesigns.findIndex(card => card !== null);
        if (firstCompletedIndex !== -1) {
          setSelectedCardIndex(firstCompletedIndex);
        }
      }
      
      // Check if all cards are done
      if (completedCount === 2 && cardStudio.isGenerating) {
        // All 2 cards are done but still showing as generating
        console.log('All 2 cards complete, stopping generation state');
        // The hook should handle this, but as a fallback we can clear the timer
        setGenerationStartTime(null);
      }
    }
  }, [cardStudio.cardDesigns, cardStudio.isGenerating, hasAutoScrolled, selectedCardIndex]);
  
  // Reset auto-scroll flag when starting new generation
  useEffect(() => {
    if (cardStudio.isGenerating && cardStudio.cardDesigns.every(d => d === null)) {
      setHasAutoScrolled(false);
    }
  }, [cardStudio.isGenerating, cardStudio.cardDesigns]);
  
  // Handle email PDF button click
  const handleEmailPDF = async () => {
    const selectedCard = cardStudio.cardDesigns[selectedCardIndex];
    if (!selectedCard) {
      toast.error("Please select a card to email");
      return;
    }
    
    // Send PDF via email
    await handleSendPdfEmail(selectedCard);
  };

  // Handle print button click - opens browser print dialog
  const handlePrintClick = () => {
    const selectedCard = cardStudio.cardDesigns[selectedCardIndex];
    if (!selectedCard) {
      toast.error("Please select a card to print");
      return;
    }
    
    // Create a print window with all card images
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow pop-ups to print the card");
      return;
    }
    
    // Create HTML for printing all card images
    const printHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Card - Papersaurus</title>
        <style>
          @media print {
            @page {
              size: landscape;
              margin: 0;
            }
            body { 
              margin: 0; 
              padding: 0;
            }
            .print-container {
              display: flex;
              flex-wrap: wrap;
              justify-content: center;
              align-items: center;
              width: 11in;
              height: 8.5in;
            }
            .card-pair {
              display: flex;
              width: 11in;
              height: 8.5in;
              page-break-inside: avoid;
              page-break-after: always;
              align-items: center;
              justify-content: center;
            }
            .card-pair:last-child {
              page-break-after: auto;
            }
            .card-panel {
              width: 50%;
              height: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              position: relative;
            }
            .card-panel img {
              width: auto;
              height: auto;
              max-width: 5.5in;
              max-height: 8.5in;
              object-fit: contain;
            }
            h2 {
              display: none;
            }
            .instructions {
              display: none;
            }
          }
          
          @media screen {
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: #f5f5f5;
            }
            .instructions {
              background: #fff;
              border: 2px solid #4CAF50;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 30px;
              max-width: 800px;
              margin-left: auto;
              margin-right: auto;
            }
            .instructions h3 {
              color: #4CAF50;
              margin-top: 0;
            }
            .instructions ul {
              margin: 10px 0;
              padding-left: 25px;
            }
            .instructions li {
              margin: 5px 0;
            }
            .print-container {
              display: flex;
              flex-wrap: wrap;
              gap: 20px;
              justify-content: center;
              max-width: 1200px;
              margin: 0 auto;
            }
            .card-pair {
              display: flex;
              gap: 20px;
              width: 100%;
              justify-content: center;
              margin-bottom: 20px;
            }
            .card-panel {
              background: white;
              border: 1px solid #ddd;
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              flex: 0 1 400px;
            }
            .card-panel img {
              width: 100%;
              height: auto;
              max-width: 400px;
              display: block;
            }
            h2 {
              text-align: center;
              margin: 0 0 15px 0;
              color: #333;
              font-size: 18px;
              font-weight: 600;
            }
            .print-button {
              position: fixed;
              bottom: 30px;
              right: 30px;
              background: #4CAF50;
              color: white;
              border: none;
              padding: 15px 30px;
              font-size: 18px;
              border-radius: 50px;
              cursor: pointer;
              box-shadow: 0 4px 6px rgba(0,0,0,0.2);
              z-index: 1000;
            }
            .print-button:hover {
              background: #45a049;
            }
          }
        </style>
      </head>
      <body>
        <div class="instructions">
          <h3>🖨️ Printing Instructions</h3>
          <ul>
            <li><strong>Paper Size:</strong> Use 8.5" x 11" (Letter) cardstock</li>
            <li><strong>Orientation:</strong> Set to <strong>LANDSCAPE</strong> mode</li>
            <li><strong>Margins:</strong> Set margins to <strong>NONE</strong> or <strong>MINIMUM</strong></li>
            <li><strong>Scale:</strong> Select "Actual Size" or "100%" (not "Fit to Page")</li>
            <li><strong>Layout:</strong> 2 cards per page - Back/Front on page 1, Interiors on page 2</li>
            <li><strong>Folding:</strong> Cut down the middle vertically, then fold each card in half</li>
          </ul>
          <p><strong>Tip:</strong> For a professional look, use 65-80 lb cardstock paper.</p>
        </div>
        
        <div class="print-container">
          <div class="card-pair">
            <div class="card-panel">
              <h2>Back Cover</h2>
              <img src="${selectedCard.backCover || selectedCard.images?.back || ''}" alt="Back Cover" />
            </div>
            <div class="card-panel">
              <h2>Front Cover</h2>
              <img src="${selectedCard.frontCover || selectedCard.images?.front || ''}" alt="Front Cover" />
            </div>
          </div>
          
          <div class="card-pair">
            <div class="card-panel">
              <h2>Interior (Left)</h2>
              <img src="${selectedCard.leftInterior || selectedCard.images?.leftInterior || ''}" alt="Left Interior" />
            </div>
            <div class="card-panel">
              <h2>Interior (Right)</h2>
              <img src="${selectedCard.rightInterior || selectedCard.images?.rightInterior || ''}" alt="Right Interior" />
            </div>
          </div>
        </div>
        
        <button class="print-button" onclick="window.print()">🖨️ Print Cards</button>
        <script>
          // Auto-trigger print dialog when images are loaded
          let loadedImages = 0;
          const totalImages = document.querySelectorAll('img').length;
          document.querySelectorAll('img').forEach(img => {
            if (img.complete) {
              loadedImages++;
              if (loadedImages === totalImages) {
                setTimeout(() => window.print(), 500);
              }
            } else {
              img.onload = () => {
                loadedImages++;
                if (loadedImages === totalImages) {
                  setTimeout(() => window.print(), 500);
                }
              };
            }
          });
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
  };

  // Handle print confirmation - now free PDF
  const handleConfirmPrint = async () => {
    if (!cardToPrint) {
      toast.error("No card to print. Please select a card first.");
      return;
    }
    
    // Close the print dialog and send PDF
    setShowPrintDialog(false);
    await handleSendPdfEmail(cardToPrint);
  };
  
  // Handle sending PDF via email (free)
  const handleSendPdfEmail = async (card: any) => {
    if (!card) return;
    
    if (!formData.userEmail) {
      toast.error("Please enter your email address to receive the PDF");
      return;
    }
    
    try {
      toast.info("Preparing your free PDF card...");
      
      // Prepare card data for PDF generation
      const cardData = {
        front_cover: card.frontCover || card.images?.front || '',
        back_cover: card.backCover || card.images?.back || '',
        left_page: card.leftInterior || card.images?.leftInterior || '',  // Backend expects left_page
        right_page: card.rightInterior || card.images?.rightInterior || '', // Backend expects right_page
        message: card.message || formData.message || '',
        recipient_name: formData.to || '',
        sender_name: formData.from || '',
        card_type: formData.selectedType || 'general',
        card_tone: formData.selectedTone || 'heartfelt',
        user_email: formData.userEmail,
        card_name: `Card_${new Date().toISOString()}`,
        paper_size: 'standard',
        is_front_back_only: false,
        zero_margins: true
      };
      
      // Send PDF via email endpoint
      const response = await fetch(`${BACKEND_API_BASE_URL}/api/send-pdf-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cardData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send PDF');
      }
      
      const result = await response.json();
      toast.success(`📧 PDF card sent to ${formData.userEmail}! Check your inbox.`);
      
      // Clear the print-related state
      setCardToPrint(null);
      
    } catch (error) {
      console.error('Error sending PDF:', error);
      toast.error('Failed to send PDF. Please try again.');
    }
  };

  // Removed old payment and print logic to simplify

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Calculate progress based on estimated time
  // Use cardStudio's progress if available (for restoration), otherwise calculate from elapsed time
  const progressPercentage = cardStudio.progressPercentage || (
    generationStartTime && cardStudio.isGenerating
      ? Math.min((displayElapsedTime / estimatedTime) * 100, 95) // Cap at 95% until actually done
      : 0
  );
  
  // Check if ready to generate
  const canGenerate = 
    formData.selectedType && 
    formData.selectedTone && 
    (formData.userEmail || session?.user?.email) &&
    (formData.selectedArtisticStyle !== 'custom' || formData.customStyleDescription?.trim()) &&
    !cardStudio.isGenerating;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Connection status components removed - using polling */}
      
      {/* Debug Panel - only show with debug query param */}
      {window.location.search.includes('debug=true') && (
        <DebugPanel />
      )}
      
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-6 max-w-3xl">
        
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/50 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
            {/* Card Type Selection - Mobile Optimized */}
            <div className="space-y-3">
              <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Card Type
              </label>
              <Select 
                value={formData.selectedType} 
                onValueChange={(value) => {
                  updateFormData({ selectedType: value });
                  setActiveSection('type');
                }}
              >
                <SelectTrigger className="w-full h-12 sm:h-14 text-sm sm:text-base border border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-600 focus:border-blue-500 dark:focus:border-blue-500 transition-colors bg-white dark:bg-slate-800">
                  <SelectValue placeholder="Select a card type...">
                    {formData.selectedType && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cardTypes.find(t => t.id === formData.selectedType)?.emoji}</span>
                        <span>{cardTypes.find(t => t.id === formData.selectedType)?.label}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[50vh] sm:max-h-[70vh] w-[calc(100vw-32px)] sm:w-auto">
                  {cardTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id} className="py-2 sm:py-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-lg sm:text-xl flex-shrink-0">{type.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm sm:text-base">{type.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{type.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {formData.selectedType === "custom" && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                  <Input
                    placeholder="Describe your custom card (e.g., Retirement, New Job...)"
                    value={formData.customCardType}
                    onChange={(e) => updateFormData({ customCardType: e.target.value })}
                    className="h-12 text-base"
                  />
                </div>
              )}
            </div>

            {/* Card Tone - Mobile Optimized */}
            <div className="space-y-3">
              <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Card Tone
              </label>
              <Select 
                value={formData.selectedTone} 
                onValueChange={(value) => {
                  updateFormData({ selectedTone: value });
                  setActiveSection('tone');
                }}
              >
                <SelectTrigger className="w-full h-12 sm:h-14 text-sm sm:text-base border border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-600 focus:border-blue-500 dark:focus:border-blue-500 transition-colors bg-white dark:bg-slate-800">
                  <SelectValue placeholder="Select a tone...">
                    {formData.selectedTone && (
                      <span>{cardTones.find(t => t.id === formData.selectedTone)?.label}</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[50vh] sm:max-h-[70vh] w-[calc(100vw-32px)] sm:w-auto">
                  {cardTones.map((tone) => (
                    <SelectItem key={tone.id} value={tone.id} className="py-2 sm:py-3">
                      <div className="flex-1">
                        <div className="font-medium text-sm sm:text-base">{tone.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">{tone.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* To/From/Relationship Fields - Mobile Optimized */}
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Recipient Details
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">Optional</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      To
                    </label>
                    <Input
                      placeholder="Recipient"
                      value={formData.toField}
                      onChange={(e) => updateFormData({ toField: e.target.value })}
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      From
                    </label>
                    <Input
                      placeholder="Your name"
                      value={formData.fromField}
                      onChange={(e) => updateFormData({ fromField: e.target.value })}
                      className="h-12 text-base"
                    />
                  </div>
                </div>
              </div>
              
              {/* Relationship Field */}
              {(formData.toField || formData.fromField) && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                    {formData.toField && formData.fromField 
                      ? `How ${formData.fromField} knows ${formData.toField}` 
                      : formData.toField 
                        ? `${formData.toField} is your...`
                        : `You are their...`}
                  </label>
                  <Input
                    placeholder="💝 e.g., daughter, best friend, colleague, grandfather..."
                    value={formData.relationshipField || ''}
                    onChange={(e) => updateFormData({ relationshipField: e.target.value })}
                    className="h-12"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    This helps create a more personal and meaningful card
                  </p>
                </div>
              )}
            </div>

            {/* Personalization - Interests/Hobbies */}
            <div className="space-y-3">
              <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Customize Your Card
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">Optional but recommended!</span>
              </label>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Make it special - add any details you want in the card
                </label>
                <Textarea
                  placeholder="✨ Share anything: hobbies, pets, inside jokes, favorite things, memories..."
                  value={formData.personalTraits || ''}
                  onChange={(e) => updateFormData({ personalTraits: e.target.value })}
                  rows={3}
                  className="resize-none text-base sm:min-h-[100px]"
                />
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-2 mt-2">
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">Example:</span> "Jasmine is turning 22, she loves skiing and sushi! she just got a new a puppy named Milo!"
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  We'll weave these details throughout the card's artwork and design
                </p>
              </div>
            </div>

            {/* Card Message */}
            <div className="space-y-3">
              <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Card Message
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">Optional - leave blank for handwritten</span>
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
                    Add a message to be printed inside your card
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateMessage}
                    disabled={isGeneratingMessage}
                    className="text-xs h-7 px-2"
                  >
                    {isGeneratingMessage ? (
                      <>
                        <LoaderCircle className="w-3 h-3 mr-1 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1" />
                        Generate Message
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  placeholder="💌 Enter your message here, or leave blank to write by hand..."
                  value={formData.finalCardMessage || ''}
                  onChange={(e) => updateFormData({ finalCardMessage: e.target.value })}
                  rows={4}
                  className="resize-none text-base sm:min-h-[120px]"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isHandwrittenMessage"
                    checked={formData.isHandwrittenMessage || false}
                    onChange={(e) => updateFormData({ isHandwrittenMessage: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isHandwrittenMessage" className="text-sm text-gray-700 dark:text-gray-300">
                    I'll write the message by hand
                  </label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formData.isHandwrittenMessage || !formData.finalCardMessage?.trim() 
                    ? "The card will have blank space for your handwritten message" 
                    : "Your message will be printed in elegant script on the right interior panel"}
                </p>
              </div>
            </div>

            {/* Artistic Style */}
            <div className="space-y-3">
              <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Artistic Style
              </label>
              <Select 
                value={formData.selectedArtisticStyle || 'ai-smart-style'} 
                onValueChange={(value) => updateFormData({ selectedArtisticStyle: value })}
              >
                <SelectTrigger className="w-full h-12 sm:h-14 text-sm sm:text-base border border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-600 focus:border-blue-500 dark:focus:border-blue-500 transition-colors bg-white dark:bg-slate-800">
                  <SelectValue placeholder="Choose artistic style 🎨">
                    {formData.selectedArtisticStyle && (
                      <span>{artisticStyles.find(s => s.id === formData.selectedArtisticStyle)?.label}</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[50vh] sm:max-h-[70vh] w-[calc(100vw-32px)] sm:w-auto">
                  {artisticStyles.map((style) => (
                    <SelectItem key={style.id} value={style.id} className="py-2 sm:py-3">
                      <div className="space-y-0.5">
                        <div className="font-medium text-sm sm:text-base">{style.label}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{style.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Custom Style Description */}
              {formData.selectedArtisticStyle === "custom" && (
                <div className="mt-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Describe Your Custom Style
                  </label>
                  <Textarea
                    placeholder="e.g., vintage 1920s art deco style with gold accents and geometric patterns, or Japanese woodblock print style with bold lines and flat colors..."
                    value={formData.customStyleDescription || ''}
                    onChange={(e) => updateFormData({ customStyleDescription: e.target.value })}
                    rows={4}
                    className="resize-none"
                    style={{ fontSize: '16px' }}
                  />
                  <div className="space-y-2 mt-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Be creative! Describe any artistic style you can imagine:
                    </p>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                      <li>• <strong>Art movements:</strong> "impressionist style" or "pop art style"</li>
                      <li>• <strong>Techniques:</strong> "oil painting with thick brushstrokes"</li>
                      <li>• <strong>Eras:</strong> "1950s retro advertising"</li>
                      <li>• <strong>Mix styles:</strong> "cyberpunk meets art nouveau"</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Reference Photo */}
            <div className="space-y-3">
              <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Reference Photo
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">Optional</span>
              </label>
              
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-lg sm:rounded-xl p-2 sm:p-4 border border-slate-200 dark:border-slate-700">
                <div className="space-y-3">
                    {cardStudio.referenceImageUrls.length > 0 && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 sm:p-3 bg-white dark:bg-slate-800 rounded-md sm:rounded-lg">
                        <div className="flex items-start gap-2 sm:gap-3">
                          <img
                            src={cardStudio.referenceImageUrls[0]}
                            alt="Reference photo"
                            className="w-14 h-14 sm:w-20 sm:h-20 object-cover rounded-md sm:rounded-lg flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Reference Photo</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 break-words mt-0.5">
                              {(() => {
                                const ref = cardStudio.photoReferences?.find(r => r.imageIndex === 0);
                                return ref?.description || "Add description for better results";
                              })()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 self-end sm:self-center ml-auto">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCurrentPhotoIndex(0);
                              // Find existing description for this photo
                              const existingRef = cardStudio.photoReferences?.find(ref => ref.imageIndex === 0);
                              setPhotoDescription(existingRef?.description || "");
                              setShowPhotoIdentification(true);
                            }}
                            className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                            title="Edit description"
                          >
                            <Users className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveImage(0)}
                            className="text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                            title="Remove photo"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {/* Upload area - only shows when no photo */}
                    {cardStudio.referenceImageUrls.length === 0 && (
                      <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-center hover:border-blue-400 dark:hover:border-blue-600 transition-all hover:bg-blue-50/30 dark:hover:bg-blue-900/10 p-6 sm:p-8 cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                          disabled={cardStudio.isUploading}
                          className="hidden"
                          id="reference-upload"
                          multiple={false}
                        />
                        <label htmlFor="reference-upload" className={`cursor-pointer ${cardStudio.isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <Upload className={`w-8 h-8 mb-3 mx-auto text-slate-400 dark:text-slate-500 ${cardStudio.isUploading ? 'animate-pulse' : ''}`} />
                          <div className="text-base font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {cardStudio.isUploading ? "Uploading..." : "Add Photo"}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            Upload a reference photo to personalize
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
              </div>
            </div>

            {/* Email / Google Sign In */}
            <div className="space-y-3">
              {!session ? (
                <div className="space-y-3">
                  <GoogleSignInButton />
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
                      ✨ Benefits of signing in:
                    </p>
                    <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                      <li>• Save your card history</li>
                      <li>• Faster checkout next time</li>
                      <li>• Track your orders</li>
                      <li>• Email delivery of your cards</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <>
                  <label className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Email Address
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex-shrink-0">
                      {session.user?.image && (
                        <img 
                          src={session.user.image} 
                          alt={session.user.name || 'User'} 
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {session.user?.email}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Signed in as {session.user?.name}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    We'll send your completed card to this address
                  </p>
                </>
              )}
            </div>

            {/* Generate/Action Buttons */}
            <div className="pt-4">
              {/* Show Generate button if no cards, or action buttons if cards exist */}
              {(cardStudio.cardDesigns.length === 0 || cardStudio.cardDesigns.every(d => d === null)) ? (
                <Button
                  onClick={handleGenerateCard}
                  disabled={!canGenerate || cardStudio.isGenerating}
                  className="w-full h-14 sm:h-12 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold text-base sm:text-sm shadow-lg hover:shadow-xl transition-all duration-200 touch-manipulation"
                >
                  {cardStudio.isGenerating ? (
                    <>
                      <LoaderCircle className="w-5 h-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Generate Card
                    </>
                  )}
                </Button>
              ) : (
                /* Show Regenerate and Create New buttons once cards are generated */
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleGenerateCard}
                    disabled={cardStudio.isGenerating}
                    className="flex-1 h-14 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Wand2 className="w-5 h-5 mr-2" />
                    Regenerate Designs
                  </Button>
                  
                  <Button
                    onClick={() => {
                      // Clear all localStorage
                      localStorage.removeItem('vibe-card-designs');
                      localStorage.removeItem('cardFormData');
                      localStorage.removeItem('vibe-final-card');
                      localStorage.removeItem('vibe-active-session'); // Clear session storage
                      
                      // Clear any job-related storage
                      const keysToRemove = [];
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.startsWith('cardJob_') || key === 'pendingCardJobs')) {
                          keysToRemove.push(key);
                        }
                      }
                      keysToRemove.forEach(key => localStorage.removeItem(key));
                      
                      // Reset form and studio state
                      cardForm.resetForm();
                      cardStudio.setCardDesigns([]);
                      setSelectedCardIndex(0);
                      setGenerationStartTime(null);
                      setElapsedTime(0);
                      
                      // Clear reference images and photo references from cardStudio
                      cardStudio.setReferenceImageUrls([]);
                      cardStudio.setPhotoReferences([]);
                      cardStudio.setReferenceImages([]);
                      
                      // Scroll to top
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      
                      toast.success("Ready to create a new card!");
                    }}
                    variant="outline"
                    className="flex-1 h-14 border-2 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-base"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Create New Card
                  </Button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Display Generated Cards - All 5 variations */}
        {(cardStudio.isGenerating || (cardStudio.cardDesigns.length > 0 && cardStudio.cardDesigns.some(d => d !== null))) && (
          <div id="generated-cards-section" className="mt-6 bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-2xl shadow-slate-200/50 dark:shadow-black/50 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className={`p-4 ${cardStudio.isGenerating ? 'bg-gradient-to-r from-blue-600 to-cyan-600' : 'bg-gradient-to-r from-emerald-600 to-teal-600'}`}>
              <h2 className="text-xl font-semibold text-center text-white flex items-center justify-center gap-2">
                {cardStudio.isGenerating ? (
                  <>
                    <LoaderCircle className="w-5 h-5 animate-spin" />
                    Generating Your Cards...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Your Cards are Ready!
                  </>
                )}
              </h2>
              <p className={`text-sm text-center mt-1 ${cardStudio.isGenerating ? 'text-blue-100' : 'text-emerald-100'}`}>
                {cardStudio.isGenerating 
                  ? 'Creating 2 unique designs for you'
                  : `${cardStudio.cardDesigns.filter(Boolean).length} of 2 designs generated`
                }
              </p>
              
              {/* Timer and Progress - Only show when generating */}
              {cardStudio.isGenerating && (
                <div className="mt-4 space-y-3">
                  {/* Timer and Percentage */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-white/90">
                      <Clock className="w-4 h-4" />
                      <span className="font-mono font-medium">{formatTime(displayElapsedTime)}</span>
                      <span className="text-white/70">/ ~{formatTime(estimatedTime)}</span>
                    </div>
                    <span className="text-white font-mono font-medium">
                      {Math.round(progressPercentage)}%
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="relative">
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-white/90 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Status Text */}
                  <p className="text-center text-sm text-white/90">
                    {cardStudio.generationProgress || "Generating all card images in parallel..."}
                  </p>
                </div>
              )}
            </div>
            
            {/* Card Selection Thumbnails */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {(cardStudio.cardDesigns.length > 0 ? cardStudio.cardDesigns : [...Array(2)]).map((card, index) => {
                  const isPlaceholder = !card || card === null || card === undefined || !card.frontCover;
                  return (
                    <button
                      key={index}
                      onClick={() => !isPlaceholder && setSelectedCardIndex(index)}
                      disabled={isPlaceholder}
                      className={`relative aspect-[5/7] rounded-lg overflow-hidden transition-all duration-200 ${
                        !isPlaceholder 
                          ? selectedCardIndex === index 
                            ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 scale-95' 
                            : 'hover:scale-95 cursor-pointer'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {!isPlaceholder ? (
                      <>
                        {card.frontCover ? (
                          <img 
                            src={card.frontCover} 
                            alt={`Design ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error(`Failed to load image for design ${index + 1}:`, card.frontCover);
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full bg-slate-900">
                            <p className="text-white text-xs">No image</p>
                          </div>
                        )}
                        <div className={`absolute inset-0 bg-black transition-opacity ${
                          selectedCardIndex === index ? 'opacity-0' : 'opacity-0 hover:opacity-10'
                        }`} />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-white text-xs font-medium">Design {index + 1}</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 opacity-50"></div>
                        <LoaderCircle className="w-6 h-6 text-slate-500 dark:text-slate-400 animate-spin relative z-10" />
                      </div>
                    )}
                  </button>
                  );
                })}
              </div>
            </div>
            
            {/* Selected Card Preview */}
            <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700">
              {cardStudio.cardDesigns[selectedCardIndex] ? (
                <CardPreview
                  card={cardStudio.cardDesigns[selectedCardIndex]}
                  isFrontBackOnly={false}
                  onCardUpdate={(updatedCard) => {
                    // Update the card in the designs array
                    const newDesigns = [...cardStudio.cardDesigns];
                    newDesigns[selectedCardIndex] = updatedCard;
                    cardStudio.setCardDesigns(newDesigns);
                  }}
                  onPrint={handlePrintClick}
                  onEmailPDF={handleEmailPDF}
                  referenceImageUrls={cardStudio.referenceImageUrls}
                  personalTraits={cardStudio.personalTraits}
                  relationshipField={cardStudio.relationshipField}
                  photoReferences={cardStudio.photoReferences}
                />
              ) : (
                <div className="flex items-center justify-center h-96 text-slate-500 dark:text-slate-400">
                  <p className="text-center">
                    {cardStudio.isGenerating ? 'Cards are being generated...' : 'Select a card thumbnail above to preview'}
                  </p>
                </div>
              )}
              
              {/* Email sent confirmation - TODO: Add emailSent state to cardStudio hook */}
              {/* {cardStudio.emailSent && (
                <div className="mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                  <p className="text-emerald-800 dark:text-emerald-200 font-medium text-center flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Card sent successfully to {formData.userEmail}!
                  </p>
                </div>
              )} */}
            </div>
          </div>
        )}
      </div>
      
      {/* Photo Identification Dialog */}
      <Dialog open={showPhotoIdentification} onOpenChange={setShowPhotoIdentification}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Who's in this photo?
            </DialogTitle>
            <DialogDescription>
              Tell us who's in the photo to personalize the card design.
            </DialogDescription>
          </DialogHeader>
          
          {cardStudio.referenceImageUrls.length > 0 && cardStudio.referenceImageUrls[currentPhotoIndex] && (
            <div className="my-4">
              <img 
                src={cardStudio.referenceImageUrls[currentPhotoIndex]} 
                alt="Reference photo" 
                className="w-full h-48 object-cover rounded-lg"
              />
            </div>
          )}
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Describe who's in the photo
              </label>
              <Textarea
                placeholder="e.g., 'Jasmine (birthday girl) on the left, Jordan on the right'"
                value={photoDescription}
                onChange={(e) => setPhotoDescription(e.target.value)}
                rows={3}
                className="resize-none"
                autoFocus
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Include names and who's the card for
              </p>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPhotoIdentification(false)}
            >
              Skip
            </Button>
            <Button
              onClick={handlePhotoIdentificationSubmit}
              disabled={!photoDescription.trim()}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Print Confirmation Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Print Your Card</DialogTitle>
            <DialogDescription>
              Your card will be printed and ready for pickup shortly
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Standard Print Option */}
            <div 
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                printOption === 'physical'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setPrintOption('physical')}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={printOption === 'physical'}
                  onChange={() => setPrintOption('physical')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium">Physical Print (All Pages)</div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Print all 4 panels at once. Pick up your card shortly.
                  </p>
                </div>
              </div>
            </div>

            {/* Manual Duplex Section - Only show if card has interior panels */}
            {((cardToPrint?.leftInterior && cardToPrint?.rightInterior) || 
              (cardToPrint?.images?.leftInterior && cardToPrint?.images?.rightInterior)) && (
              <>
                <div className="mt-4 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Manual Duplex Printing (2 steps):
                </div>

                {/* Print Exterior Option */}
                <div 
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    printOption === 'exterior'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setPrintOption('exterior')}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={printOption === 'exterior'}
                      onChange={() => setPrintOption('exterior')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Printer className="w-4 h-4 text-indigo-600" />
                        <span className="font-medium">Step 1: Print Exterior (Front & Back)</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Print the front and back covers first
                      </p>
                    </div>
                  </div>
                </div>

                {/* Print Interior Option */}
                <div 
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    printOption === 'interior'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setPrintOption('interior')}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={printOption === 'interior'}
                      onChange={() => setPrintOption('interior')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Printer className="w-4 h-4 text-indigo-600" />
                        <span className="font-medium">Step 2: Print Interior (Left & Right)</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Flip the paper and print the inside pages with your message
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowPrintDialog(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPrint}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            >
              <Printer className="w-4 h-4 mr-2" />
              {printOption === 'exterior' ? 'Print Exterior' : 
               printOption === 'interior' ? 'Print Interior' : 
               'Print Card'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Payment modal removed - free PDF only */}
    </div>
  );
}