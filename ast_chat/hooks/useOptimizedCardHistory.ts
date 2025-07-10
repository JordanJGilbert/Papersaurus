import { useState, useEffect, useCallback } from 'react';

interface CardHistoryItem {
  id: string;
  prompt: string;
  createdAt: Date;
  shareUrl?: string;
  cardType: string;
  tone: string;
  styleInfo?: {
    styleName?: string;
    styleLabel?: string;
  };
}

interface DraftSession {
  id: string;
  formData: any;
  draftCardIds: string[]; // Store only IDs, not full cards
  selectedDraftIndex: number;
  createdAt: Date;
  lastModified: Date;
  title: string;
}

interface OptimizedCardHistory {
  completedCards: CardHistoryItem[];
  draftSessions: DraftSession[];
  lastUpdated: number;
}

const OPTIMIZED_HISTORY_KEY = 'vibecarding-optimized-history';
const HISTORY_RETENTION = 30 * 24 * 60 * 60 * 1000; // 30 days
const DRAFT_RETENTION = 7 * 24 * 60 * 60 * 1000; // 7 days
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

export const useOptimizedCardHistory = () => {
  const [history, setHistory] = useState<OptimizedCardHistory>({
    completedCards: [],
    draftSessions: [],
    lastUpdated: Date.now()
  });

  const [isLoading, setIsLoading] = useState(true);

  // Load lightweight history from localStorage
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = useCallback(() => {
    try {
      const stored = localStorage.getItem(OPTIMIZED_HISTORY_KEY);
      if (stored) {
        const parsed: OptimizedCardHistory = JSON.parse(stored);
        
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
      console.error('Failed to load optimized history:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveHistory = useCallback((newHistory: OptimizedCardHistory) => {
    try {
      // This is now lightweight - just metadata!
      localStorage.setItem(OPTIMIZED_HISTORY_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save optimized history:', error);
    }
  }, []);

  // Add completed card (lightweight metadata only)
  const addCompletedCard = useCallback((fullCard: any, formData: any) => {
    const cardItem: CardHistoryItem = {
      id: fullCard.id,
      prompt: fullCard.prompt?.substring(0, 200) || '',
      createdAt: fullCard.createdAt || new Date(),
      shareUrl: fullCard.shareUrl,
      cardType: formData.selectedType === 'custom' ? formData.customCardType : formData.selectedType,
      tone: formData.selectedTone,
      styleInfo: fullCard.styleInfo
    };

    setHistory(prev => {
      const newHistory = {
        ...prev,
        completedCards: [cardItem, ...prev.completedCards],
        lastUpdated: Date.now()
      };
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  // Save draft session (store card IDs, not full cards)
  const saveDraftSession = useCallback((
    formData: any, 
    draftCards: any[], 
    selectedDraftIndex: number = -1,
    sessionId?: string
  ) => {
    const now = new Date();
    const id = sessionId || generateSessionId();
    
    const title = generateDraftTitle(formData);
    
    const draftSession: DraftSession = {
      id,
      formData,
      draftCardIds: draftCards.map(card => card.id || `temp_${Date.now()}_${Math.random()}`),
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
        newDraftSessions = [...prev.draftSessions];
        newDraftSessions[existingIndex] = draftSession;
      } else {
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

  // Fetch full card data from server
  const loadCardData = useCallback(async (cardId: string) => {
    try {
      const response = await fetch(`${BACKEND_API_BASE_URL}/api/cards/${cardId}`);
      if (!response.ok) {
        throw new Error(`Failed to load card: ${response.status}`);
      }
      const cardData = await response.json();
      return cardData;
    } catch (error) {
      console.error('Failed to load card data:', error);
      return null;
    }
  }, []);

  // Resume draft session (need to fetch actual draft cards)
  const resumeDraftSession = useCallback(async (sessionId: string) => {
    const session = history.draftSessions.find(s => s.id === sessionId);
    if (!session) return null;

    // For drafts, we might need to fetch from temporary storage or regenerate
    // This is more complex - drafts are typically temporary
    
    // Update last modified time
    saveDraftSession(
      session.formData,
      [], // Empty for now - would need better draft persistence
      session.selectedDraftIndex,
      sessionId
    );

    return session;
  }, [history.draftSessions, saveDraftSession]);

  // Delete operations (same as before)
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

  const clearHistory = useCallback(() => {
    const newHistory: OptimizedCardHistory = {
      completedCards: [],
      draftSessions: [],
      lastUpdated: Date.now()
    };
    setHistory(newHistory);
    saveHistory(newHistory);
  }, [saveHistory]);

  return {
    history,
    isLoading,
    addCompletedCard,
    saveDraftSession,
    resumeDraftSession,
    deleteDraftSession,
    deleteCompletedCard,
    clearHistory,
    loadCardData, // New method to fetch full card data
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