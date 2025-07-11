"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useSimpleDraftGeneration } from './cardStudio/useSimpleDraftGeneration';
import { useSimpleTimer } from './cardStudio/useSimpleTimer';
import { useSimpleWebSocket } from './cardStudio/useSimpleWebSocket';

// Simple state interface
interface CardStudioState {
  // Form fields
  cardType: string;
  tone: string;
  to: string;
  from: string;
  message: string;
  email: string;
  prompt: string;
  
  // File uploads
  referenceImages: string[];
  handwrittenMessage: string | null;
  
  // Generation state
  isGenerating: boolean;
  finalCard: any | null;
}

export function useCardStudioSimple() {
  // Single state object
  const [state, setState] = useState<CardStudioState>({
    cardType: 'birthday',
    tone: 'funny',
    to: '',
    from: '',
    message: '',
    email: '',
    prompt: '',
    referenceImages: [],
    handwrittenMessage: null,
    isGenerating: false,
    finalCard: null
  });

  // Use our simple hooks
  const drafts = useSimpleDraftGeneration();
  const timer = useSimpleTimer();
  const ws = useSimpleWebSocket();

  // Update a field
  const updateField = useCallback((field: keyof CardStudioState, value: any) => {
    setState(prev => ({ ...prev, [field]: value }));
  }, []);

  // Generate message with AI
  const generateMessage = useCallback(async () => {
    try {
      const response = await fetch('/api/generate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardType: state.cardType,
          tone: state.tone,
          to: state.to,
          from: state.from
        })
      });
      
      const data = await response.json();
      if (data.message) {
        updateField('message', data.message);
        toast.success('Message generated!');
      }
    } catch (error) {
      toast.error('Failed to generate message');
    }
  }, [state.cardType, state.tone, state.to, state.from, updateField]);

  // Upload reference image
  const uploadImage = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      if (data.url) {
        setState(prev => ({
          ...prev,
          referenceImages: [...prev.referenceImages, data.url]
        }));
        toast.success('Image uploaded!');
      }
    } catch (error) {
      toast.error('Failed to upload image');
    }
  }, []);

  // Generate drafts
  const generateDrafts = useCallback(async () => {
    if (!state.email) {
      toast.error('Please enter your email');
      return;
    }

    await drafts.generateDrafts({
      cardType: state.cardType,
      tone: state.tone,
      to: state.to,
      from: state.from,
      message: state.message,
      prompt: state.prompt,
      referenceImages: state.referenceImages,
      model: 'gpt-image-1'
    });
  }, [state, drafts]);

  // Generate final card from selected draft
  const generateFinalCard = useCallback(async () => {
    if (drafts.selectedDraftIndex < 0) {
      toast.error('Please select a draft first');
      return;
    }

    setState(prev => ({ ...prev, isGenerating: true }));
    timer.start();

    try {
      const selectedDraft = drafts.drafts[drafts.selectedDraftIndex];
      
      // Simple API call
      const response = await fetch('/api/generate-final-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: selectedDraft,
          message: state.message,
          handwrittenMessage: state.handwrittenMessage,
          email: state.email
        })
      });

      const result = await response.json();
      
      if (result.card) {
        setState(prev => ({ 
          ...prev, 
          isGenerating: false,
          finalCard: result.card
        }));
        timer.stop();
        toast.success('Card generated successfully!');
      }
    } catch (error) {
      setState(prev => ({ ...prev, isGenerating: false }));
      timer.stop();
      toast.error('Failed to generate card');
    }
  }, [drafts, state, timer]);

  // Reset everything
  const reset = useCallback(() => {
    setState({
      cardType: 'birthday',
      tone: 'funny',
      to: '',
      from: '',
      message: '',
      email: '',
      prompt: '',
      referenceImages: [],
      handwrittenMessage: null,
      isGenerating: false,
      finalCard: null
    });
    drafts.reset();
    timer.reset();
  }, [drafts, timer]);

  return {
    // State
    ...state,
    
    // Draft state
    drafts: drafts.drafts,
    selectedDraftIndex: drafts.selectedDraftIndex,
    isDraftGenerating: drafts.isGenerating,
    draftProgress: drafts.progress,
    
    // Timer
    elapsedTime: timer.formatted,
    
    // WebSocket status
    isConnected: ws.isConnected,
    
    // Actions
    updateField,
    generateMessage,
    uploadImage,
    generateDrafts,
    selectDraft: drafts.selectDraft,
    generateFinalCard,
    reset
  };
}