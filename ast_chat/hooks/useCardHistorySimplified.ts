"use client";

import { useState, useEffect } from 'react';
import { storage } from '@/lib/storageManager';

export interface CardHistoryItem {
  id: string;
  date: string;
  type: string;
  tone: string;
  recipient?: string;
  sender?: string;
  message?: string;
  thumbnailUrl?: string;
}

export function useCardHistory() {
  const [cardHistory, setCardHistory] = useState<CardHistoryItem[]>([]);
  const [draftSessions, setDraftSessions] = useState<any[]>([]);

  // Load recent cards on mount
  useEffect(() => {
    const recent = storage.getRecentCards();
    const historyItems: CardHistoryItem[] = recent.map(card => ({
      id: card.id,
      date: card.date,
      type: card.type,
      tone: card.tone,
      recipient: card.recipient,
      sender: undefined,
      message: undefined,
      thumbnailUrl: card.preview
    }));
    setCardHistory(historyItems);
  }, []);

  // Add a new card to history
  const addCardToHistory = (card: CardHistoryItem) => {
    storage.addRecentCard({
      id: card.id,
      date: card.date,
      type: card.type,
      tone: card.tone,
      recipient: card.recipient,
      preview: card.thumbnailUrl
    });
    
    // Update local state
    setCardHistory(prev => [card, ...prev].slice(0, 5));
  };

  // Clear all history
  const clearHistory = () => {
    storage.clearAll();
    setCardHistory([]);
    setDraftSessions([]);
  };

  // For compatibility - these functions don't do anything in simplified version
  const saveDraftSession = () => {};
  const resumeDraftSession = () => {};
  const removeDraftSession = () => {};

  return {
    cardHistory,
    draftSessions,
    addCardToHistory,
    clearHistory,
    saveDraftSession,
    resumeDraftSession,
    removeDraftSession,
  };
}