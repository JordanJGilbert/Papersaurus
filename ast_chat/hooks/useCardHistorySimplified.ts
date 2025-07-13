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

  // Load recent cards and draft sessions on mount
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
    
    // Load draft sessions from localStorage directly
    if (typeof window !== 'undefined') {
      try {
        const sessions = JSON.parse(localStorage.getItem('vibe-draft-sessions') || '[]');
        const twoHours = 2 * 60 * 60 * 1000;
        
        // Filter out expired sessions
        const validSessions = sessions.filter((session: any) => {
          if (!session.savedAt) return false;
          const age = Date.now() - new Date(session.savedAt).getTime();
          return age < twoHours;
        });
        
        // Update localStorage if we removed any expired sessions
        if (validSessions.length !== sessions.length) {
          localStorage.setItem('vibe-draft-sessions', JSON.stringify(validSessions));
        }
        
        setDraftSessions(validSessions);
      } catch {
        setDraftSessions([]);
      }
    }
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
  };

  // Draft session management
  const saveDraftSession = (formData: any, draftCards: any[], selectedIndex: number, sessionId?: string) => {
    if (typeof window === 'undefined') return sessionId || '';
    
    const id = sessionId || `draft_${Date.now()}`;
    const session = {
      id,
      formData,
      draftCards: draftCards.filter(Boolean), // Only save completed drafts
      selectedIndex,
      savedAt: new Date().toISOString()
    };
    
    try {
      // Save current session
      localStorage.setItem('vibe-current-draft-session', JSON.stringify(session));
      
      // Update draft sessions list
      const sessions = JSON.parse(localStorage.getItem('vibe-draft-sessions') || '[]');
      const existingIndex = sessions.findIndex((s: any) => s.id === id);
      if (existingIndex >= 0) {
        sessions[existingIndex] = session;
      } else {
        sessions.unshift(session);
      }
      // Keep only the most recent session
      const updatedSessions = sessions.slice(0, 1);
      localStorage.setItem('vibe-draft-sessions', JSON.stringify(updatedSessions));
      setDraftSessions(updatedSessions);
    } catch (e) {
      console.error('Failed to save draft session:', e);
    }
    
    return id;
  };
  
  const resumeDraftSession = (sessionId: string) => {
    if (typeof window === 'undefined') return null;
    
    try {
      // Check current session first
      const currentSession = JSON.parse(localStorage.getItem('vibe-current-draft-session') || 'null');
      if (currentSession && (sessionId === 'current' || currentSession.id === sessionId)) {
        return currentSession;
      }
      
      // Check sessions list
      const sessions = JSON.parse(localStorage.getItem('vibe-draft-sessions') || '[]');
      return sessions.find((s: any) => s.id === sessionId);
    } catch {
      return null;
    }
  };
  
  const removeDraftSession = (sessionId: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      const currentSession = JSON.parse(localStorage.getItem('vibe-current-draft-session') || 'null');
      if (currentSession && currentSession.id === sessionId) {
        localStorage.removeItem('vibe-current-draft-session');
      }
      
      const sessions = JSON.parse(localStorage.getItem('vibe-draft-sessions') || '[]');
      const filtered = sessions.filter((s: any) => s.id !== sessionId);
      localStorage.setItem('vibe-draft-sessions', JSON.stringify(filtered));
      setDraftSessions(filtered);
    } catch (e) {
      console.error('Failed to remove draft session:', e);
    }
  };

  // Alias for backward compatibility
  const addCompletedCard = (card: any) => {
    // Convert from the old format to new format
    const historyItem: CardHistoryItem = {
      id: card.id || Date.now().toString(),
      date: new Date().toISOString(),
      type: card.cardType || 'custom',
      tone: card.cardTone || 'casual',
      recipient: card.toField,
      sender: card.fromField,
      message: card.finalCardMessage,
      thumbnailUrl: card.frontCover || card.images?.frontCover
    };
    addCardToHistory(historyItem);
  };

  return {
    cardHistory,
    draftSessions,
    addCardToHistory,
    addCompletedCard,  // Add this for backward compatibility
    clearHistory,
    saveDraftSession,
    resumeDraftSession,
    removeDraftSession,
    // Add these for backward compatibility
    hasCompletedCards: cardHistory.length > 0,
    hasDraftSessions: draftSessions.length > 0,
    totalCards: cardHistory.length,
    totalDrafts: draftSessions.length,
  };
}