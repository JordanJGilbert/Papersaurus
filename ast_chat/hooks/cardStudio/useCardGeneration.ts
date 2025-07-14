"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { PromptGenerator, CardConfig } from '@/lib/promptGenerator';
import { GeneratedCard, cardTones, artisticStyles, paperSizes, PhotoReference } from './constants';
import { chatWithAI, sendThankYouEmail, scrollToCardPreview } from './utils';

interface CardGenerationProps {
  // Form data
  selectedType: string;
  customCardType: string;
  selectedTone: string;
  selectedArtisticStyle: string;
  customStyleDescription: string;
  selectedImageModel: string;
  selectedPaperSize: string;
  prompt: string;
  personalTraits?: string;
  toField: string;
  fromField: string;
  relationshipField: string;
  userEmail: string;
  finalCardMessage: string;
  isHandwrittenMessage: boolean;
  isFrontBackOnly: boolean;
  referenceImageUrls: string[];
  photoReferences?: PhotoReference[];
  numberOfCards: number;
  
  // Job management
  saveJobToStorage: (jobId: string, jobData: any) => void;
  removeJobFromStorage: (jobId: string) => void;
  subscribeToJob: (jobId: string) => void;
  startElapsedTimeTracking: (jobType?: 'draft' | 'final') => void;
  stopElapsedTimeTracking: () => void;
  setCurrentJobId: (id: string | null) => void;
  
  // Draft state setters
  setIsDraftMode: (value: boolean) => void;
  setDraftCards: (value: any) => void;
  setSelectedDraftIndex: (value: number) => void;
  setIsGeneratingFinalCard: (value: boolean) => void;
  setPreviewingDraftIndex: (value: number) => void;
  setDraftCompletionShown: (value: boolean) => void;
  setDraftCompletionCount: (value: number) => void;
}

export function useCardGeneration(props: CardGenerationProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number>(0);
  const [isCardCompleted, setIsCardCompleted] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [currentCardId, setCurrentCardId] = useState<string | null>(null);
  const [generationDuration, setGenerationDuration] = useState<number | null>(null);

  // Handle final card completion
  const handleFinalCardCompletion = useCallback(async (cardData: any) => {
    console.log('🎯 handleFinalCardCompletion called with cardData:', cardData);
    console.log('🎯 Current userEmail state:', props.userEmail);
    console.log('🎯 Current states:', {
      isGenerating,
      isCardCompleted,
      generatedCard: generatedCard ? 'Present' : 'None'
    });
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
    
    // Add message data for handwritten overlay
    if (props.isHandwrittenMessage) {
      cardWithQR.message = props.finalCardMessage;
      cardWithQR.isHandwrittenMessage = true;
    }
    
    console.log('🔄 Final card data prepared:', cardWithQR);
    
    // Note: QR code overlay is now handled automatically by the backend
    console.log('✅ Card completion processing finished - QR codes handled by backend');
    
    console.log('🎯 Setting final card state:', cardWithQR);
    
    // Set the card states
    setGeneratedCard(cardWithQR);
    setGeneratedCards([cardWithQR]);
    setSelectedCardIndex(0);
    setIsCardCompleted(true);
    setIsGenerating(false);
    props.setIsGeneratingFinalCard(false);
    props.setIsDraftMode(false);
    props.setDraftCompletionShown(false);
    props.setDraftCompletionCount(0);
    
    console.log('🎯 Card states updated - isCardCompleted:', true, 'generatedCard:', cardWithQR);
    // Don't clear the progress message here - it will be set by the WebSocket handler
    // setGenerationProgress("");
    
    // Scroll to card preview
    scrollToCardPreview();
    
    // Capture generation time from backend
    if (cardData.generationTimeSeconds) {
      setGenerationDuration(cardData.generationTimeSeconds);
    }
    
    // Stop elapsed time tracking
    props.stopElapsedTimeTracking();
    
    // Set final progress after all states are updated
    // Use a timeout to ensure React has processed all state updates
    setTimeout(() => {
      setGenerationProgress("Generation complete! (100%)");
    }, 100);
    
    toast.success("🎉 Your card is ready!");
    
    // Show email confirmation toast if email is provided
    if (props.userEmail.trim()) {
      toast.success(`✉️ Card sent to ${props.userEmail}`, {
        duration: 5000,
      });
    }
    
    // Email notifications are handled by the backend
    console.log('📧 Email sending disabled - backend handles email notifications');
    
    console.log('✅ Final card completion process finished successfully');
    console.log('✅ Final states:', {
      isCardCompleted: true,
      generatedCard: cardWithQR
    });
  }, [props, isGenerating, isCardCompleted, generatedCard]);

  // Main card generation function
  const handleGenerateCardAsync = useCallback(async () => {
    const {
      userEmail,
      selectedType,
      customCardType,
      selectedTone,
      selectedArtisticStyle,
      customStyleDescription,
      selectedImageModel,
      referenceImageUrls,
      prompt,
      toField,
      fromField,
      finalCardMessage,
      isHandwrittenMessage,
      isFrontBackOnly,
      selectedPaperSize,
      numberOfCards,
      saveJobToStorage,
      subscribeToJob,
      startElapsedTimeTracking,
      setCurrentJobId,
      setIsDraftMode,
      setDraftCards,
      setSelectedDraftIndex,
      setIsGeneratingFinalCard,
      setPreviewingDraftIndex,
      setDraftCompletionShown,
      setDraftCompletionCount
    } = props;

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
    setDraftCards([null, null, null, null, null]);
    setSelectedDraftIndex(-1);
    setIsGeneratingFinalCard(false);
    setPreviewingDraftIndex(-1);
    setDraftCompletionShown(false);
    setDraftCompletionCount(0);
    
    // Clear any existing card states
    setGeneratedCards([]);
    setGeneratedCard(null);
    setSelectedCardIndex(0);
    setCurrentCardId(null);
    setIsCardCompleted(false);

    // Stop any existing timers first
    props.stopElapsedTimeTracking();
    
    setIsGenerating(true);
    startElapsedTimeTracking('final');
    setGenerationProgress("Creating your personalized card...");

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

      // Use prompt if provided, otherwise create a simple default
      let effectivePrompt = prompt.trim();
      
      if (!effectivePrompt) {
        effectivePrompt = `A beautiful ${cardTypeForPrompt} card`;
      }

      // Use PromptGenerator for card prompts
      const cardConfig: CardConfig = {
        cardType: selectedType,
        customCardType: customCardType,
        tone: selectedTone,
        toneDescription: selectedToneObj?.description.toLowerCase() || "heartfelt and sincere",
        theme: effectivePrompt,
        toField: toField,
        fromField: fromField,
        relationshipField: props.relationshipField,
        personalTraits: props.personalTraits,
        message: messageContent,
        isHandwrittenMessage: isHandwrittenMessage,
        artisticStyle: selectedStyle,
        referenceImageUrls: referenceImageUrls,
        photoReferences: props.photoReferences,
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
            }),
            // Include message data for handwritten overlay
            ...(isHandwrittenMessage && {
              message: finalCardMessage,
              isHandwrittenMessage: true,
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
      
      if (currentCardId) {
        props.removeJobFromStorage(currentCardId);
        setCurrentCardId(null);
      }
      
      setIsGenerating(false);
      setGenerationProgress("");
      props.stopElapsedTimeTracking();
    }
  }, [props, currentCardId]);

  return {
    isGenerating,
    setIsGenerating,
    generatedCard,
    setGeneratedCard,
    generatedCards,
    setGeneratedCards,
    selectedCardIndex,
    setSelectedCardIndex,
    isCardCompleted,
    setIsCardCompleted,
    generationProgress,
    setGenerationProgress,
    currentCardId,
    setCurrentCardId,
    generationDuration,
    setGenerationDuration,
    handleGenerateCardAsync,
    handleFinalCardCompletion
  };
}