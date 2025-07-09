"use client";

import { useState, useCallback } from "react";
import { CardFormData } from "./useCardForm";

export interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;
  backCover: string;
  leftPage: string;
  rightPage: string;
  createdAt: Date;
  shareUrl?: string;
  generatedPrompts?: {
    frontCover?: string;
    backCover?: string;
    leftInterior?: string;
    rightInterior?: string;
  };
  thumbnails?: {
    frontCover?: string;
    backCover?: string;
    leftPage?: string;
    rightPage?: string;
  };
  styleInfo?: {
    styleName?: string;
    styleLabel?: string;
  };
}

export function useCardGeneration(formData: CardFormData) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  
  // Draft mode states
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [draftCards, setDraftCards] = useState<GeneratedCard[]>([]);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState(-1);
  const [isGeneratingFinalCard, setIsGeneratingFinalCard] = useState(false);
  
  // Progress tracking
  const [generationProgress, setGenerationProgress] = useState("");
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [generationDuration, setGenerationDuration] = useState<number | null>(null);
  
  // Job tracking
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const resetGeneration = useCallback(() => {
    setIsGenerating(false);
    setGeneratedCard(null);
    setGeneratedCards([]);
    setSelectedCardIndex(0);
    setIsDraftMode(false);
    setDraftCards([]);
    setSelectedDraftIndex(-1);
    setIsGeneratingFinalCard(false);
    setGenerationProgress("");
    setProgressPercentage(0);
    setGenerationDuration(null);
    setCurrentJobId(null);
  }, []);

  const handleGenerateCard = useCallback(async () => {
    // This will contain the logic from the original handleGenerateCardAsync
    // For now, just a placeholder
    setIsGenerating(true);
    setGenerationProgress("Starting card generation...");
    
    try {
      // TODO: Implement actual generation logic here
      // This will be extracted from the original page.tsx
      await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate generation
      
      // Mock generated card
      const mockCard: GeneratedCard = {
        id: `card-${Date.now()}`,
        prompt: formData.prompt || "Generated card",
        frontCover: "/placeholder-front.jpg",
        backCover: "/placeholder-back.jpg", 
        leftPage: "/placeholder-left.jpg",
        rightPage: "/placeholder-right.jpg",
        createdAt: new Date(),
      };
      
      setGeneratedCard(mockCard);
      setGeneratedCards([mockCard]);
      setGenerationProgress("Card generation complete!");
      setProgressPercentage(100);
      
    } catch (error) {
      console.error('Card generation failed:', error);
      setGenerationProgress("Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [formData]);

  const handleGenerateDraftCards = useCallback(async () => {
    setIsDraftMode(true);
    setIsGenerating(true);
    setGenerationProgress("Creating 5 front cover variations...");
    setDraftCards([]);
    
    try {
      // TODO: Implement actual draft generation logic
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate generation
      
      // Mock draft cards
      const mockDrafts: GeneratedCard[] = Array.from({ length: 5 }, (_, i) => ({
        id: `draft-${i + 1}-${Date.now()}`,
        prompt: `Draft variation ${i + 1}`,
        frontCover: `/placeholder-draft-${i + 1}.jpg`,
        backCover: "",
        leftPage: "",
        rightPage: "",
        createdAt: new Date(),
      }));
      
      setDraftCards(mockDrafts);
      setGenerationProgress("All 5 variations complete!");
      setProgressPercentage(100);
      
    } catch (error) {
      console.error('Draft generation failed:', error);
      setGenerationProgress("Draft generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [formData]);

  const handleGenerateFinalFromDraft = useCallback(async (draftIndex: number) => {
    if (draftIndex < 0 || draftIndex >= draftCards.length) return;
    
    setIsGeneratingFinalCard(true);
    setSelectedDraftIndex(draftIndex);
    setGenerationProgress("Creating high-quality version...");
    
    try {
      // TODO: Implement actual final generation from draft
      await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate generation
      
      const selectedDraft = draftCards[draftIndex];
      const finalCard: GeneratedCard = {
        ...selectedDraft,
        id: `final-${Date.now()}`,
        backCover: "/placeholder-back.jpg",
        leftPage: "/placeholder-left.jpg", 
        rightPage: "/placeholder-right.jpg",
      };
      
      setGeneratedCard(finalCard);
      setGeneratedCards([finalCard]);
      setIsDraftMode(false);
      setGenerationProgress("High-quality card complete!");
      
    } catch (error) {
      console.error('Final card generation failed:', error);
      setGenerationProgress("Final generation failed");
    } finally {
      setIsGeneratingFinalCard(false);
    }
  }, [draftCards]);

  return {
    // Generation state
    isGenerating,
    generatedCard,
    generatedCards,
    selectedCardIndex,
    
    // Draft mode state
    isDraftMode,
    draftCards,
    selectedDraftIndex,
    isGeneratingFinalCard,
    
    // Progress state
    generationProgress,
    progressPercentage,
    generationDuration,
    currentJobId,
    
    // Actions
    handleGenerateCard,
    handleGenerateDraftCards,
    handleGenerateFinalFromDraft,
    resetGeneration,
    
    // Setters for external control
    setGeneratedCard,
    setGeneratedCards,
    setSelectedCardIndex,
    setSelectedDraftIndex,
  };
} 