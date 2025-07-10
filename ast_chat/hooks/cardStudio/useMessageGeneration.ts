"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { PromptGenerator, MessageConfig } from '@/lib/promptGenerator';
import { cardTones } from './constants';
import { chatWithAI } from './utils';

export function useMessageGeneration(
  selectedType: string,
  customCardType: string,
  selectedTone: string,
  prompt: string,
  toField: string,
  fromField: string,
  photoAnalyses?: any[]
) {
  const [finalCardMessage, setFinalCardMessage] = useState("");
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [messageHistory, setMessageHistory] = useState<string[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [isRefiningMessage, setIsRefiningMessage] = useState(false);
  const [showRefinementBox, setShowRefinementBox] = useState(false);

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

  // Full message generation function
  const handleGetMessageHelp = useCallback(async () => {
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
        fromField: fromField,
        photoAnalyses: photoAnalyses
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
  }, [selectedType, customCardType, selectedTone, prompt, toField, fromField, finalCardMessage, photoAnalyses]);

  return {
    finalCardMessage,
    setFinalCardMessage,
    isGeneratingMessage,
    setIsGeneratingMessage,
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
    handleGetMessageHelp,
    addMessageToHistory,
    undoMessage,
    redoMessage
  };
}