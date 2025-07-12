"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { PromptGenerator, DraftConfig, FinalFromDraftConfig } from '@/lib/promptGenerator';
import { GeneratedCard, artisticStyles, paperSizes, cardTones, PhotoReference } from './constants';
import { chatWithAI } from './utils';

interface DraftGenerationProps {
  // Form data
  selectedType: string;
  customCardType: string;
  selectedTone: string;
  selectedArtisticStyle: string;
  customStyleDescription: string;
  selectedDraftModel: string;
  selectedImageModel: string;
  selectedPaperSize: string;
  prompt: string;
  toField: string;
  fromField: string;
  userEmail: string;
  finalCardMessage: string;
  isHandwrittenMessage: boolean;
  isFrontBackOnly: boolean;
  referenceImageUrls: string[];
  photoReferences?: PhotoReference[];
  
  // Job management
  saveJobToStorage: (jobId: string, jobData: any) => void;
  subscribeToJob: (jobId: string) => void;
  unsubscribeFromAllJobs?: () => void;
  startElapsedTimeTracking: (jobType?: 'draft' | 'final') => void;
  stopElapsedTimeTracking: () => void;
}

export function useDraftGeneration(props: DraftGenerationProps) {
  // Draft mode state
  const [isDraftMode, setIsDraftMode] = useState<boolean>(false);
  const [draftCards, setDraftCards] = useState<(GeneratedCard | null)[]>([]);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState<number>(-1);
  const [isGeneratingFinalCard, setIsGeneratingFinalCard] = useState<boolean>(false);
  const [previewingDraftIndex, setPreviewingDraftIndex] = useState<number>(-1);
  const [draftCompletionShown, setDraftCompletionShown] = useState<boolean>(false);
  const [draftCompletionCount, setDraftCompletionCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [isCardCompleted, setIsCardCompleted] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Draft mode generation - creates 5 front cover variations
  const handleGenerateDraftCards = useCallback(async () => {
    const {
      userEmail,
      selectedArtisticStyle,
      customStyleDescription,
      referenceImageUrls,
      selectedDraftModel,
      selectedType,
      customCardType,
      selectedTone,
      prompt,
      toField,
      fromField,
      selectedPaperSize,
      saveJobToStorage,
      subscribeToJob,
      startElapsedTimeTracking
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
    if (referenceImageUrls.length > 0 && selectedDraftModel !== "gpt-image-1") {
      toast.error("Reference photos are only supported with GPT Image 1 model. Please switch to GPT Image 1 for draft mode or remove reference photos.");
      return;
    }

    // Stop any existing timers first
    props.stopElapsedTimeTracking();
    
    // Clear ALL WebSocket subscriptions before starting
    if (props.unsubscribeFromAllJobs) {
      props.unsubscribeFromAllJobs();
    }
    
    // Clear all old draft jobs from localStorage before starting new generation
    if (typeof window !== 'undefined') {
      console.log('🧹 Clearing old draft jobs before starting new generation');
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('cardJob_draft-')) {
          localStorage.removeItem(key);
        }
      });
      // Also clear from pending jobs list
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      const filteredJobs = pendingJobs.filter((id: string) => !id.startsWith('draft-'));
      localStorage.setItem('pendingCardJobs', JSON.stringify(filteredJobs));
    }
    
    setIsDraftMode(true);
    setIsGenerating(true);
    startElapsedTimeTracking('draft');
    setGenerationProgress("🎨 Creating 5 front cover variations for you to choose from...");
    setDraftCards([null, null, null, null, null]); // Initialize with 5 empty slots
    setSelectedDraftIndex(-1);
    setDraftCompletionShown(false);
    setDraftCompletionCount(0);
    
    // Clear any previous card state
    setGeneratedCard(null);
    setGeneratedCards([]);
    setIsCardCompleted(false);
    

    try {
      console.log("🚀 Starting draft mode generation with 5 variations");
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;

      // Generate 5 draft variations
      const draftPromises = Array.from({ length: 5 }, async (_, index) => {
        try {
          console.log(`🎨 Starting draft variation ${index + 1}`);
          
          // For smart style, use predefined styles
          let styleOverride: string | undefined = undefined;
          let styleLabel: string | undefined = undefined;
          if (selectedArtisticStyle === "ai-smart-style") {
            const predefinedStyles = ["watercolor", "botanical", "comic-book", "dreamy-fantasy", "minimalist"];
            const styleLabels = ["🎨 Watercolor", "🌿 Botanical", "💥 Comic Book", "🌸 Dreamy Fantasy", "✨ Minimalist"];
            
            styleOverride = predefinedStyles[index];
            styleLabel = styleLabels[index];
          }
          
          // Generate front cover prompt
          const selectedStyle = artisticStyles.find(style => style.id === (styleOverride || selectedArtisticStyle));
          
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
            photoReferences: props.photoReferences,
            isDraftVariation: selectedArtisticStyle === "smart",
            variationIndex: index
          };

          const { prompt: frontCoverPromptQuery, images } = PromptGenerator.generateDraftPromptWithImages(draftConfig);
          
          
          const frontCoverPrompt = await chatWithAI(frontCoverPromptQuery, {
            model: "gemini-2.5-pro",
            attachments: images
          });

          if (!frontCoverPrompt?.trim()) {
            throw new Error("Failed to generate front cover prompt");
          }

          // Enhance with reference image instructions
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
                quality: "low",
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
          
          // Save draft job to storage for recovery
          saveJobToStorage(jobId, {
            isDraft: true,
            draftIndex: index,
            styleInfo: styleOverride ? { styleName: styleOverride, styleLabel: styleLabel } : undefined,
            frontCoverPrompt: enhancedFrontCoverPrompt,
            userEmail,
            selectedType,
            selectedTone,
            toField,
            fromField,
            draftCards: []  // Will be updated as drafts complete
          });

          // Subscribe to WebSocket updates
          subscribeToJob(jobId);

        } catch (error) {
          console.error(`❌ Draft variation ${index + 1} failed:`, error);
          toast.error(`Draft variation ${index + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      // Wait for all draft generations to start
      await Promise.allSettled(draftPromises);
      console.log("🚀 All draft variations started");

    } catch (error) {
      console.error('Draft card generation error:', error);
      toast.error(`Failed to start draft generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      setIsGenerating(false);
      setIsDraftMode(false);
      setDraftCompletionShown(false);
      setDraftCompletionCount(0);
      setGenerationProgress("");
      props.stopElapsedTimeTracking();
    }
  }, [props]);

  // Generate final high-quality card from selected draft
  const handleGenerateFinalFromDraft = useCallback(async (displayIndex: number) => {
    // Prevent duplicate calls
    if (isGeneratingFinalCard) {
      console.log('⚠️ Final card generation already in progress, skipping duplicate call');
      return;
    }
    
    const selectedDraft = draftCards[displayIndex];
    if (!selectedDraft) {
      toast.error("Please wait for the draft to complete before selecting");
      return;
    }

    const {
      selectedType,
      customCardType,
      selectedTone,
      prompt,
      toField,
      fromField,
      finalCardMessage,
      isHandwrittenMessage,
      selectedArtisticStyle,
      customStyleDescription,
      isFrontBackOnly,
      selectedImageModel,
      selectedPaperSize,
      userEmail,
      referenceImageUrls,
      startElapsedTimeTracking,
      subscribeToJob
    } = props;

    // Stop any existing timers first
    props.stopElapsedTimeTracking();
    
    setIsGeneratingFinalCard(true);
    setIsDraftMode(false); // Switch out of draft mode for final generation
    setSelectedDraftIndex(displayIndex);
    startElapsedTimeTracking('final');
    setGenerationProgress("🎨 Creating high-quality version of your selected design...");

    try {
      const jobId = uuidv4();
      
      // Generate the missing prompts
      const storedFrontCoverPrompt = selectedDraft.generatedPrompts?.frontCover;
      if (!storedFrontCoverPrompt) {
        throw new Error("Selected draft is missing frontCover prompt");
      }
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;
      
      let messageContent = finalCardMessage;
      if (isHandwrittenMessage) {
        messageContent = "[Blank space for handwritten message]";
      }
      
      // Get style from the selected draft
      const draftStyleInfo = selectedDraft.styleInfo;
      let selectedStyle;
      if (draftStyleInfo && draftStyleInfo.styleName) {
        selectedStyle = artisticStyles.find(style => style.id === draftStyleInfo.styleName);
      } else {
        selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
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

      const finalPrompts = await PromptGenerator.generateFinalFromDraftPromptsCombined(finalFromDraftConfig);

      if (!finalPrompts || !finalPrompts.frontCover || !finalPrompts.backCover) {
        throw new Error("Failed to generate complete prompts for final card");
      }
      
      // Prepare input images for final generation
      const inputImages: string[] = [];
      if (referenceImageUrls.length > 0 && selectedImageModel === "gpt-image-1") {
        inputImages.push(...referenceImageUrls);
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
            quality: "high",
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
        throw new Error(result.message || 'Failed to start final card generation');
      }

      setCurrentJobId(jobId);
      toast.success("🎨 Generating high-quality version of your selected design!");
      
      // Subscribe to WebSocket updates
      subscribeToJob(jobId);

    } catch (error) {
      console.error('Final card generation error:', error);
      toast.error("Failed to generate final card. Please try again.");
      setIsGeneratingFinalCard(false);
      setGenerationProgress("");
      props.stopElapsedTimeTracking(); // Clear time-based progress on error
    }
  }, [draftCards, isGeneratingFinalCard, props]);

  return {
    isDraftMode,
    setIsDraftMode,
    draftCards,
    setDraftCards,
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
    handleGenerateDraftCards,
    handleGenerateFinalFromDraft,
    isGenerating,
    setIsGenerating,
    generationProgress,
    setGenerationProgress,
    generatedCard,
    setGeneratedCard,
    generatedCards,
    setGeneratedCards,
    isCardCompleted,
    setIsCardCompleted,
    currentJobId,
    setCurrentJobId
  };
}