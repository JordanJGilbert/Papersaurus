/**
 * Simplified Storage Manager for VibeCarding
 * 
 * Philosophy: Minimal persistence focused on preventing user frustration
 * Only 3 keys: active-session, recent-cards, recovery
 */

interface ActiveSession {
  formData: any;
  wizardState: {
    currentStep: number;
    completedSteps: number[];
  };
  expires: number;
  lastUpdated: number;
}

interface RecentCard {
  id: string;
  date: string;
  type: string;
  tone: string;
  recipient?: string;
  preview?: string; // Small thumbnail URL
}

interface Recovery {
  jobId: string;
  formData: any;
  expires: number;
}

const STORAGE_KEYS = {
  activeSession: 'vibe-active-session',
  recentCards: 'vibe-recent-cards',
  recovery: 'vibe-recovery'
} as const;

const EXPIRY_TIMES = {
  session: 24 * 60 * 60 * 1000, // 24 hours
  recovery: 10 * 60 * 1000,     // 10 minutes
  recentCards: 30              // 30 days (handled differently)
} as const;

class StorageManager {
  /**
   * Save active session data (form + wizard state)
   */
  saveSession(formData: any, wizardState: { currentStep: number; completedSteps: number[] }) {
    if (typeof window === 'undefined') return;
    
    const session: ActiveSession = {
      formData,
      wizardState,
      expires: Date.now() + EXPIRY_TIMES.session,
      lastUpdated: Date.now()
    };
    
    try {
      localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(session));
    } catch (e) {
      // Silent fail - not critical
    }
  }

  /**
   * Get active session if not expired
   */
  getSession(): { formData: any; wizardState: any } | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.activeSession);
      if (!stored) return null;
      
      const session: ActiveSession = JSON.parse(stored);
      
      // Check if expired
      if (Date.now() > session.expires) {
        this.clearSession();
        return null;
      }
      
      return {
        formData: session.formData,
        wizardState: session.wizardState
      };
    } catch {
      return null;
    }
  }

  /**
   * Clear active session
   */
  clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.activeSession);
  }

  /**
   * Save recovery data during generation
   */
  saveRecovery(jobId: string, formData: any) {
    if (typeof window === 'undefined') return;
    
    const recovery: Recovery = {
      jobId,
      formData,
      expires: Date.now() + EXPIRY_TIMES.recovery
    };
    
    try {
      localStorage.setItem(STORAGE_KEYS.recovery, JSON.stringify(recovery));
    } catch (e) {
      // Silent fail
    }
  }

  /**
   * Get recovery data if not expired
   */
  getRecovery(): Recovery | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.recovery);
      if (!stored) return null;
      
      const recovery: Recovery = JSON.parse(stored);
      
      // Check if expired
      if (Date.now() > recovery.expires) {
        this.clearRecovery();
        return null;
      }
      
      return recovery;
    } catch {
      return null;
    }
  }

  /**
   * Clear recovery data
   */
  clearRecovery() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.recovery);
  }

  /**
   * Add a card to recent history (max 5 cards, metadata only)
   */
  addRecentCard(card: RecentCard) {
    if (typeof window === 'undefined') return;
    
    try {
      const recent = this.getRecentCards();
      
      // Add new card at beginning
      recent.unshift(card);
      
      // Keep only last 5
      const trimmed = recent.slice(0, 5);
      
      localStorage.setItem(STORAGE_KEYS.recentCards, JSON.stringify(trimmed));
    } catch (e) {
      // Silent fail
    }
  }

  /**
   * Get recent cards
   */
  getRecentCards(): RecentCard[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.recentCards);
      if (!stored) return [];
      
      const cards: RecentCard[] = JSON.parse(stored);
      
      // Filter out cards older than 30 days
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return cards.filter(card => new Date(card.date).getTime() > thirtyDaysAgo);
    } catch {
      return [];
    }
  }

  /**
   * Clear all storage (privacy-first)
   */
  clearAll() {
    if (typeof window === 'undefined') return;
    
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }

  /**
   * Get storage size info
   */
  getStorageInfo() {
    if (typeof window === 'undefined') return { used: 0, keys: [] };
    
    let totalSize = 0;
    const keys: string[] = [];
    
    Object.values(STORAGE_KEYS).forEach(key => {
      const item = localStorage.getItem(key);
      if (item) {
        totalSize += item.length;
        keys.push(key);
      }
    });
    
    return {
      used: Math.round(totalSize / 1024), // KB
      keys
    };
  }
}

// Export singleton instance
export const storage = new StorageManager();

// Export types
export type { ActiveSession, RecentCard, Recovery };