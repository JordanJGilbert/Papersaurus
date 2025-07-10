import { useState, useEffect, useCallback } from 'react';

interface GalleryCard {
  id: string;
  prompt: string;
  frontCover: string;
  backCover?: string;
  leftPage?: string;
  rightPage?: string;
  createdAt: number;
  createdAtFormatted: string;
  shareUrl?: string;
  hasImages: boolean;
  generatedPrompts?: {
    frontCover?: string;
    backCover?: string;
    leftInterior?: string;
    rightInterior?: string;
  };
}

interface CardCache {
  cards: GalleryCard[];
  totalCount: number;
  lastFetched: number;
  isComplete: boolean;
}

const CACHE_KEY = 'vibecarding_template_cache';
const IMAGE_CACHE_KEY = 'vibecarding_image_cache';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const IMAGE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';
const MAX_CONCURRENT_IMAGES = 3; // Netflix-style: Very conservative concurrent loads

// Use the regular list endpoint - it's fast enough and always current
const CARDS_LIST_URL = `${BACKEND_API_BASE_URL}/api/cards/list`;

// Global cache state
let globalCache: CardCache | null = null;
let isPreloading = false;
const cacheListeners: Set<() => void> = new Set();

const notifyListeners = () => {
  cacheListeners.forEach(listener => listener());
};

export const useCardCache = () => {
  const [cache, setCache] = useState<CardCache | null>(globalCache);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to cache updates
  useEffect(() => {
    const updateCache = () => setCache(globalCache);
    cacheListeners.add(updateCache);
    return () => {
      cacheListeners.delete(updateCache);
    };
  }, []);

  // Load from localStorage on mount (after hydration)
  useEffect(() => {
    if (typeof window === 'undefined' || globalCache) return;
    
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed: CardCache = JSON.parse(stored);
        const isExpired = Date.now() - parsed.lastFetched > CACHE_DURATION;
        
        if (!isExpired) {
          globalCache = parsed;
          setCache(parsed);
          console.log('📦 Loaded cached template cards:', parsed.cards.length);
        } else {
          localStorage.removeItem(CACHE_KEY);
          console.log('🗑️ Expired cache removed');
        }
      }
    } catch (error) {
      console.error('Failed to load cache:', error);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  }, []);

  const loadCards = useCallback(async (page: number = 1, search: string = '', reset: boolean = false): Promise<GalleryCard[]> => {
    // If we have complete cache and no search, return cached data immediately
    if (!search && globalCache?.isComplete && !reset) {
      const startIndex = (page - 1) * 40;
      const endIndex = startIndex + 40;
      return globalCache.cards.slice(startIndex, endIndex);
    }

    // For searches or when no cache, fetch from list endpoint
    if (!search && (reset || !globalCache)) {
      try {
        // Fetch all cards with a large per_page to get everything at once
        const response = await fetch(`${CARDS_LIST_URL}?per_page=1000&template_mode=true`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.cards && Array.isArray(data.cards)) {
            // Update global cache
            globalCache = {
              cards: data.cards,
              totalCount: data.pagination?.total || data.cards.length,
              lastFetched: Date.now(),
              isComplete: true
            };

            // Save to localStorage
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(globalCache));
              } catch (error) {
                console.warn('Failed to save cache to localStorage:', error);
              }
            }

            notifyListeners();

            // Return requested page
            const startIndex = (page - 1) * 40;
            const endIndex = startIndex + 40;
            return data.cards.slice(startIndex, endIndex);
          }
        }
      } catch (error) {
        console.warn('List endpoint failed, falling back to paginated API:', error);
      }
    }

    // Fallback to original paginated API
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '40',
        ...(search && { search }),
        template_mode: 'true'
      });

      const response = await fetch(`${BACKEND_API_BASE_URL}/api/cards/list?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status === 'success') {
        const newCards = data.cards as GalleryCard[];
        
        // Update global cache for non-search queries
        if (!search) {
          if (reset || !globalCache) {
            globalCache = {
              cards: newCards,
              totalCount: data.pagination.total,
              lastFetched: Date.now(),
              isComplete: !data.pagination.has_next
            };
          } else {
            // Append to existing cache
            const existingIds = new Set(globalCache.cards.map(card => card.id));
            const uniqueNewCards = newCards.filter(card => !existingIds.has(card.id));
            
            globalCache = {
              ...globalCache,
              cards: [...globalCache.cards, ...uniqueNewCards],
              lastFetched: Date.now(),
              isComplete: !data.pagination.has_next
            };
          }

          // Save to localStorage
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(globalCache));
            } catch (error) {
              console.warn('Failed to save cache to localStorage:', error);
            }
          }

          notifyListeners();
        }

        return newCards;
      } else {
        throw new Error(data.message || 'Failed to load cards');
      }
    } catch (error) {
      console.error('Error loading cards:', error);
      setError(error instanceof Error ? error.message : 'Failed to load cards');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const preloadAllCards = useCallback(async () => {
    if (isPreloading) {
      return;
    }
    
    // Check if we already have a complete cache that's fresh
    if (globalCache?.isComplete) {
      const cacheAge = Date.now() - globalCache.lastFetched;
      if (cacheAge < CACHE_DURATION) {
        console.log('⚡ Using fresh cached template data:', globalCache.cards.length, 'cards');
        // No image preloading - instant response like reference site
        console.log('⚡ Using fresh cached data, no preloading needed');
        return;
      }
    }

    isPreloading = true;
    console.log('🚀 Starting immediate template preload on page load...');

    try {
      // Load all cards from list endpoint (always current!)
      const response = await fetch(`${CARDS_LIST_URL}?per_page=1000&template_mode=true`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status === 'success' && data.cards && Array.isArray(data.cards)) {
        // Update global cache with all cards at once
        globalCache = {
          cards: data.cards,
          totalCount: data.pagination?.total || data.cards.length,
          lastFetched: Date.now(),
          isComplete: true // We have all cards!
        };

        // Save to localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(globalCache));
          } catch (error) {
            console.warn('Failed to save cache to localStorage:', error);
          }
        }

        notifyListeners();
        
        console.log('✅ Page load template preload complete:', data.cards.length, 'cards');
        
        // Ultra-simple: No image preloading, let browser lazy loading handle it
        console.log('✅ Cards loaded, letting browser handle image loading');
      }
      
    } catch (error) {
      console.error('❌ Static preload failed, falling back to paginated:', error);
      // Fallback to old method if static fails
      await preloadAllCardsLegacy();
    } finally {
      isPreloading = false;
    }
  }, []);

  // Legacy preload method as fallback
  const preloadAllCardsLegacy = async () => {
    try {
      let page = 1;
      let hasMore = true;
      let allCards: GalleryCard[] = [];

      while (hasMore && page <= 5) { // Limit to 5 pages max
        const cards = await loadCards(page, '', page === 1);
        allCards = page === 1 ? cards : [...allCards, ...cards];
        
        // Check if we have more pages
        const response = await fetch(`${BACKEND_API_BASE_URL}/api/cards/list?page=${page}&per_page=40&template_mode=true`);
        const data = await response.json();
        hasMore = data.pagination?.has_next || false;
        page++;
      }

      console.log('✅ Legacy preload complete:', allCards.length, 'cards');
      await preloadImages(allCards.slice(0, 20));
      
    } catch (error) {
      console.error('❌ Legacy preload failed:', error);
    }
  };

  const preloadImages = async (cards: GalleryCard[]) => {
    // Disabled for instant loading like reference site
    console.log('🚀 Skipping image preloading for instant response');
    return;
  };

  const getCachedCards = useCallback((page: number = 1, itemsPerPage: number = 40): GalleryCard[] => {
    if (!globalCache) return [];
    
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return globalCache.cards.slice(startIndex, endIndex);
  }, []);

  const clearCache = useCallback(() => {
    globalCache = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CACHE_KEY);
    }
    setCache(null);
    notifyListeners();
  }, []);

  return {
    cache,
    isLoading,
    error,
    loadCards,
    preloadAllCards,
    getCachedCards,
    clearCache,
    hasCache: !!globalCache,
    isComplete: globalCache?.isComplete || false,
    totalCards: globalCache?.totalCount || 0
  };
};