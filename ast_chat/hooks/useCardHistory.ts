import { useState, useEffect, useCallback } from 'react';

interface GeneratedCard {
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
  styleInfo?: {
    styleName?: string;
    styleLabel?: string;
  };
}

interface DraftSession {
  id: string;
  formData: any; // Form data at time of draft creation
  draftCards: GeneratedCard[];
  selectedDraftIndex: number;
  createdAt: Date;
  lastModified: Date;
  title?: string; // Auto-generated title based on card type
}

interface CardHistoryData {
  completedCards: GeneratedCard[];
  draftSessions: DraftSession[];
  lastUpdated: number;
}

const HISTORY_STORAGE_KEY = 'vibecarding-card-history';
const DRAFT_STORAGE_KEY = 'vibecarding-draft-sessions';
const HISTORY_RETENTION = 30 * 24 * 60 * 60 * 1000; // 30 days
const DRAFT_RETENTION = 7 * 24 * 60 * 60 * 1000; // 7 days

export const useCardHistory = () => {
  const [history, setHistory] = useState<CardHistoryData>({
    completedCards: [],
    draftSessions: [],
    lastUpdated: Date.now()
  });

  const [isLoading, setIsLoading] = useState(true);

  // Load history from localStorage on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = useCallback(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed: CardHistoryData = JSON.parse(stored);
        
        // Filter out expired items
        const now = Date.now();
        const filteredCompleted = parsed.completedCards.filter(card => {
          const cardAge = now - new Date(card.createdAt).getTime();
          return cardAge < HISTORY_RETENTION;
        });

        const filteredDrafts = parsed.draftSessions.filter(session => {
          const sessionAge = now - new Date(session.lastModified).getTime();
          return sessionAge < DRAFT_RETENTION;
        });

        setHistory({
          completedCards: filteredCompleted,
          draftSessions: filteredDrafts,
          lastUpdated: now
        });
      }
    } catch (error) {
      console.error('Failed to load card history:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveHistory = useCallback((newHistory: CardHistoryData) => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save card history:', error);
    }
  }, []);

  // Add completed card to history
  const addCompletedCard = useCallback((card: GeneratedCard) => {
    setHistory(prev => {
      const newHistory = {
        ...prev,
        completedCards: [card, ...prev.completedCards],
        lastUpdated: Date.now()
      };
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  // Save draft session
  const saveDraftSession = useCallback((
    formData: any, 
    draftCards: GeneratedCard[], 
    selectedDraftIndex: number = -1,
    sessionId?: string
  ) => {
    const now = new Date();
    const id = sessionId || generateSessionId();
    
    // Generate title from form data
    const title = generateDraftTitle(formData);
    
    const draftSession: DraftSession = {
      id,
      formData,
      draftCards,
      selectedDraftIndex,
      createdAt: sessionId ? 
        (history.draftSessions.find(s => s.id === sessionId)?.createdAt || now) : 
        now,
      lastModified: now,
      title
    };

    setHistory(prev => {
      const existingIndex = prev.draftSessions.findIndex(s => s.id === id);
      let newDraftSessions;
      
      if (existingIndex >= 0) {
        // Update existing session
        newDraftSessions = [...prev.draftSessions];
        newDraftSessions[existingIndex] = draftSession;
      } else {
        // Add new session
        newDraftSessions = [draftSession, ...prev.draftSessions];
      }

      const newHistory = {
        ...prev,
        draftSessions: newDraftSessions,
        lastUpdated: Date.now()
      };
      saveHistory(newHistory);
      return newHistory;
    });

    return id;
  }, [history.draftSessions, saveHistory]);

  // Resume draft session
  const resumeDraftSession = useCallback((sessionId: string) => {
    const session = history.draftSessions.find(s => s.id === sessionId);
    if (!session) return null;

    // Don't update last modified time here to avoid infinite loop
    // The session will be saved again when the draft cards are set in the UI
    
    return session;
  }, [history.draftSessions]);

  // Delete draft session
  const deleteDraftSession = useCallback((sessionId: string) => {
    setHistory(prev => {
      const newHistory = {
        ...prev,
        draftSessions: prev.draftSessions.filter(s => s.id !== sessionId),
        lastUpdated: Date.now()
      };
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  // Delete completed card
  const deleteCompletedCard = useCallback((cardId: string) => {
    setHistory(prev => {
      const newHistory = {
        ...prev,
        completedCards: prev.completedCards.filter(c => c.id !== cardId),
        lastUpdated: Date.now()
      };
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  // Clear all history
  const clearHistory = useCallback(() => {
    const newHistory: CardHistoryData = {
      completedCards: [],
      draftSessions: [],
      lastUpdated: Date.now()
    };
    setHistory(newHistory);
    saveHistory(newHistory);
  }, [saveHistory]);

  // Get active draft session (most recent)
  const getActiveDraftSession = useCallback(() => {
    return history.draftSessions.length > 0 ? history.draftSessions[0] : null;
  }, [history.draftSessions]);

  return {
    history,
    isLoading,
    addCompletedCard,
    saveDraftSession,
    resumeDraftSession,
    deleteDraftSession,
    deleteCompletedCard,
    clearHistory,
    getActiveDraftSession,
    hasCompletedCards: history.completedCards.length > 0,
    hasDraftSessions: history.draftSessions.length > 0,
    totalCards: history.completedCards.length,
    totalDrafts: history.draftSessions.length
  };
};

// Helper functions
const generateSessionId = () => {
  return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const generateDraftTitle = (formData: any): string => {
  const cardType = formData.selectedType === 'custom' ? 
    formData.customCardType : 
    formData.selectedType;
  
  const tone = formData.selectedTone;
  const timestamp = new Date().toLocaleString();
  
  if (cardType && tone) {
    return `${cardType} (${tone}) - ${timestamp}`;
  } else if (cardType) {
    return `${cardType} - ${timestamp}`;
  } else {
    return `Draft Card - ${timestamp}`;
  }
};