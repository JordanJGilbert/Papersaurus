import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye, Copy, Share2, Calendar, ExternalLink, Loader2, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import DelayedNetflixImage from "./DelayedNetflixImage";
import NetflixStyleImage from "./NetflixStyleImage";
import SkeletonGallery from "./SkeletonGallery";
import { generateSizesAttribute } from "../utils/imageUtils";
import { useCardCache } from "../hooks/useCardCache";

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

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
}

interface InfiniteScrollGalleryProps {
  className?: string;
  showSearch?: boolean;
  itemsPerPage?: number;
  maxItems?: number;
  onCardSelect?: (card: GalleryCard) => void;
  // Template selection mode
  templateMode?: boolean;
  templateModeTitle?: string;
  templateModeDescription?: string;
}

const InfiniteScrollGallery: React.FC<InfiniteScrollGalleryProps> = ({
  className = '',
  showSearch = true,
  itemsPerPage = 40,
  maxItems,
  onCardSelect,
  templateMode = false,
  templateModeTitle = "Choose a Template",
  templateModeDescription = "Browse existing cards and use them as templates for your new card"
}) => {
  // Use the card cache hook
  const { 
    cache, 
    isLoading: cacheLoading, 
    error: cacheError, 
    loadCards: loadCardsFromCache, 
    getCachedCards,
    hasCache,
    isComplete,
    totalCards
  } = useCardCache();

  const [cards, setCards] = useState<GalleryCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<GalleryCard | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Simple optimization: use original URLs but with better loading strategy
  const getThumbnailUrl = (originalUrl: string) => {
    return originalUrl; // Keep it simple for now
  };

  // Load cards from cache or API
  const loadCards = useCallback(async (page: number, search: string = '', reset: boolean = false) => {
    if (loading) return;
    
    // For searches, always use API
    if (search) {
      setLoading(true);
      setError(null);
      
      try {
        const newCards = await loadCardsFromCache(page, search, reset);
        setCards(reset ? newCards : prev => {
          const existingIds = new Set(prev.map(card => card.id));
          const uniqueNewCards = newCards.filter(card => !existingIds.has(card.id));
          return [...prev, ...uniqueNewCards];
        });
        setHasMore(newCards.length === itemsPerPage); // Assume more if full page
        setCurrentPage(page);
      } catch (error) {
        console.error('Error loading cards:', error);
        setError(error instanceof Error ? error.message : 'Failed to load cards');
        toast.error('Failed to load cards');
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
      return;
    }

    // For non-search queries, use cache if available
    if (hasCache && !reset) {
      const cachedCards = getCachedCards(page, itemsPerPage);
      if (cachedCards.length > 0) {
        setCards(prev => {
          if (reset || page === 1) {
            return cachedCards;
          }
          const existingIds = new Set(prev.map(card => card.id));
          const uniqueNewCards = cachedCards.filter(card => !existingIds.has(card.id));
          return [...prev, ...uniqueNewCards];
        });
        
        const totalPages = Math.ceil(totalCards / itemsPerPage);
        setHasMore(page < totalPages && (!maxItems || cards.length < maxItems));
        setCurrentPage(page);
        setInitialLoading(false);
        return;
      }
    }

    // Load from API if no cache
    setLoading(true);
    setError(null);
    
    try {
      const newCards = await loadCardsFromCache(page, '', reset);
      setCards(prev => {
        if (reset) {
          return newCards;
        }
        const existingIds = new Set(prev.map(card => card.id));
        const uniqueNewCards = newCards.filter(card => !existingIds.has(card.id));
        return [...prev, ...uniqueNewCards];
      });
      
      setHasMore(!isComplete && newCards.length === itemsPerPage && (!maxItems || cards.length < maxItems));
      setCurrentPage(page);
    } catch (error) {
      console.error('Error loading cards:', error);
      setError(error instanceof Error ? error.message : 'Failed to load cards');
      toast.error('Failed to load cards');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [loading, itemsPerPage, maxItems, cards.length, hasCache, getCachedCards, totalCards, isComplete, loadCardsFromCache]);

  // Search functionality with debouncing
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setCards([]);
      setCurrentPage(1);
      setHasMore(true);
      loadCards(1, query, true);
    }, 300);
  }, [loadCards]);

  // Infinite scroll intersection observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loading && !initialLoading) {
          loadCards(currentPage + 1, searchQuery);
        }
      },
      {
        root: null,
        rootMargin: '100px', // Start loading 100px before reaching the bottom
        threshold: 0.1
      }
    );

    if (loadingRef.current) {
      observerRef.current.observe(loadingRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, initialLoading, currentPage, searchQuery, loadCards]);

  // Initial load - prioritize cached data
  useEffect(() => {
    if (hasCache && !searchQuery) {
      // Load from cache immediately
      const cachedCards = getCachedCards(1, itemsPerPage);
      if (cachedCards.length > 0) {
        setCards(cachedCards);
        setCurrentPage(1);
        const totalPages = Math.ceil(totalCards / itemsPerPage);
        setHasMore(totalPages > 1);
        setInitialLoading(false);
        return;
      }
    }
    
    // Load from API if no cache
    loadCards(1, '', true);
  }, [hasCache]); // Depend on hasCache to reload when cache becomes available

  // Handle card selection
  const handleCardClick = (card: GalleryCard) => {
    if (onCardSelect) {
      onCardSelect(card);
    } else {
      setSelectedCard(card);
      setShowModal(true);
    }
  };

  // Copy card link
  const copyCardLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Card link copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  // Render individual card with Netflix-style priority loading
  const renderCard = (card: GalleryCard, index: number) => {
    const frontImage = card.frontCover || card.backCover || card.leftPage || card.rightPage;
    
    // Netflix strategy: Only load first 4 images immediately, batch load the rest
    const shouldLoadImmediately = index < 4;
    const loadingDelay = shouldLoadImmediately ? 0 : Math.floor(index / 4) * 150; // 150ms delay per batch (increased for smoother loading)
    
    return (
      <motion.div
        key={card.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.4) }}
        className="group"
      >
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer transform hover:-translate-y-1"
          onClick={() => handleCardClick(card)}
        >
          {/* Image */}
          <div className="aspect-[2/3] relative overflow-hidden bg-gray-100">
            {frontImage ? (
              <DelayedNetflixImage
                src={frontImage}
                alt={`Card: ${card.prompt || 'Untitled'}`}
                className="w-full h-full object-cover"
                priority={shouldLoadImmediately}
                loadDelay={loadingDelay}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No preview</p>
                </div>
              </div>
            )}
            
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-200 flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 rounded-full p-3 shadow-lg">
                <Eye className="w-5 h-5 text-gray-700" />
              </div>
            </div>
            
            {/* Badge */}
            <div className="absolute top-3 right-3">
              <Badge variant="secondary" className="bg-black/50 text-white border-0 text-xs">
                <Eye className="w-3 h-3 mr-1" />
                {templateMode ? "Use Template" : "View"}
              </Badge>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 flex-1">
                {card.prompt || 'Untitled Card'}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-6 w-6 p-0 text-gray-400 hover:text-blue-500"
                onClick={(e) => {
                  e.stopPropagation();
                  if (card.shareUrl) {
                    copyCardLink(card.shareUrl);
                  } else {
                    toast.error('Share URL not available');
                  }
                }}
                title="Copy link"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center">
                <Calendar className="w-3 h-3 mr-1" />
                {card.createdAtFormatted}
              </span>
              <span className="flex items-center truncate ml-2">
                <ExternalLink className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate">{card.id}</span>
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Search */}
      {showSearch && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {templateMode ? templateModeTitle : "Card Gallery"}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {templateMode ? templateModeDescription : 
             cards.length > 0 ? `Showing ${cards.length} cards${maxItems ? ` (max ${maxItems})` : ''}` : ''
            }
          </p>
        </div>
        {loading && !initialLoading && (
          <div className="flex items-center text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading more...
          </div>
        )}
      </div>

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error Loading Cards</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setError(null);
              setCards([]);
              setCurrentPage(1);
              setHasMore(true);
              loadCards(1, searchQuery, true);
            }}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Initial Loading */}
      {initialLoading && (
        <SkeletonGallery count={12} />
      )}

      {/* Cards Grid */}
      {!initialLoading && (
        <AnimatePresence>
          {cards.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {cards.map((card, index) => renderCard(card, index))}
            </div>
          ) : !loading && !error ? (
            <div className="text-center py-16">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {templateMode ? 'No Templates Available' : 'No Cards Found'}
                </h3>
                <p className="text-gray-600">
                  {templateMode ? 
                    (searchQuery ? 'No templates match your search criteria.' : 'No templates available yet. Create your first card to start building a template library!') :
                    (searchQuery ? 'No cards match your search criteria.' : 'No cards have been created yet.')
                  }
                </p>
              </div>
            </div>
          ) : null}
        </AnimatePresence>
      )}

      {/* Infinite Scroll Trigger */}
      {hasMore && !initialLoading && cards.length > 0 && (
        <div
          ref={loadingRef}
          className="flex justify-center py-8"
        >
          {loading ? (
            <div className="flex items-center text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading more cards...
            </div>
          ) : (
            <div className="text-gray-400 text-sm">Scroll for more cards</div>
          )}
        </div>
      )}

      {/* End of Results */}
      {!hasMore && !initialLoading && cards.length > 0 && (
        <div className="text-center py-8">
          <div className="text-gray-500 text-sm">
            You've reached the end! {cards.length} cards total.
          </div>
        </div>
      )}

      {/* Card Detail Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Card Details
            </DialogTitle>
            <DialogDescription>
              View all sections of this greeting card
            </DialogDescription>
          </DialogHeader>
          
          {selectedCard && (
            <div className="space-y-6">
              {/* Card Images Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Front & Back */}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Front Cover</h4>
                    {selectedCard.frontCover ? (
                      <NetflixStyleImage
                        src={selectedCard.frontCover}
                        alt="Front Cover"
                        className="w-full rounded-lg border border-gray-200"
                        priority={true}
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                        No front cover
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Back Cover</h4>
                    {selectedCard.backCover ? (
                      <NetflixStyleImage
                        src={selectedCard.backCover}
                        alt="Back Cover"
                        className="w-full rounded-lg border border-gray-200"
                        priority={true}
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                        No back cover
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Interior Pages */}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Left Interior</h4>
                    {selectedCard.leftPage ? (
                      <NetflixStyleImage
                        src={selectedCard.leftPage}
                        alt="Left Interior"
                        className="w-full rounded-lg border border-gray-200"
                        priority={true}
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                        No left interior
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Right Interior</h4>
                    {selectedCard.rightPage ? (
                      <NetflixStyleImage
                        src={selectedCard.rightPage}
                        alt="Right Interior"
                        className="w-full rounded-lg border border-gray-200"
                        priority={true}
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                        No right interior
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Card Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className="font-medium text-gray-700">Card ID:</span>
                    <span className="text-gray-600 ml-2">{selectedCard.id}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Created:</span>
                    <span className="text-gray-600 ml-2">{selectedCard.createdAtFormatted}</span>
                  </div>
                </div>
                
                <div className="mb-4">
                  <span className="font-medium text-gray-700">Description:</span>
                  <p className="text-gray-600 mt-1">{selectedCard.prompt || 'No description provided'}</p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {selectedCard.shareUrl && (
                    <Button
                      asChild
                      className="bg-blue-500 hover:bg-blue-600"
                    >
                      <a href={selectedCard.shareUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Full Card
                      </a>
                    </Button>
                  )}
                  
                  {selectedCard.shareUrl && (
                    <Button
                      variant="outline"
                      onClick={() => copyCardLink(selectedCard.shareUrl!)}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Link
                    </Button>
                  )}
                  
                  {selectedCard.shareUrl && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({
                            title: selectedCard.prompt || 'Beautiful Greeting Card',
                            url: selectedCard.shareUrl!
                          });
                        } else {
                          copyCardLink(selectedCard.shareUrl!);
                        }
                      }}
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InfiniteScrollGallery;