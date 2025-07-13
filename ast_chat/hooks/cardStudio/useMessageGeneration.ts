"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { PromptGenerator, MessageConfig } from '@/lib/promptGenerator';
import { cardTones, PhotoReference } from './constants';
import { chatWithAI } from './utils';

export function useMessageGeneration(
  selectedType: string,
  customCardType: string,
  selectedTone: string,
  prompt: string,
  toField: string,
  fromField: string,
  relationshipField: string,
  photoReferences?: PhotoReference[]
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
  const handleGetMessageHelp = useCallback(async (userInput?: string, conversationHistory?: any[]) => {
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
        relationshipField: relationshipField,
        photoReferences: photoReferences
      };

      // If user input is provided, incorporate it into the prompt
      let messagePrompt = PromptGenerator.generateMessagePrompt(messageConfig);
      
      // Build conversation context if provided
      let conversationContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        conversationContext = conversationHistory
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');
      }
      
      if (userInput) {
        if (conversationContext) {
          // If we have conversation history, include it for context
          messagePrompt = `${messagePrompt}\n\n## Conversation History\nHere's the conversation so far:\n\n${conversationContext}\n\n## User's Current Request\n"${userInput}"\n\nBased on the conversation context and the user's current request, create a message that addresses their specific needs. If they're asking for changes or variations, modify the previous suggestions accordingly while maintaining the ${toneDescription} tone for this ${cardTypeForPrompt} card.`;
        } else {
          // Original behavior for non-chat context
          messagePrompt = `${messagePrompt}\n\n## User Request\nThe user has provided additional context or specific requests for the message:\n\n"${userInput}"\n\nPlease incorporate their feedback and create a message that addresses their specific needs while maintaining the ${toneDescription} tone for this ${cardTypeForPrompt} card.`;
        }
      }

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
  }, [selectedType, customCardType, selectedTone, prompt, toField, fromField, relationshipField, finalCardMessage, photoReferences]);

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