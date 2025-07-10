import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, Eye, Copy, Share2, Calendar, ExternalLink, Loader2, 
  Image as ImageIcon, AlertTriangle, Download, Maximize2, 
  ChevronLeft, ChevronRight, Heart, MessageSquare, Palette,
  Clock, Sparkles, X, ZoomIn, ZoomOut
} from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useCardCache } from "../hooks/useCardCache";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  cardType?: string;
  tone?: string;
  toField?: string;
  fromField?: string;
  message?: string;
  artisticStyle?: string;
}

interface EnhancedGalleryProps {
  className?: string;
  showSearch?: boolean;
  itemsPerPage?: number;
  viewMode?: 'grid' | 'list' | 'masonry';
  sortBy?: 'newest' | 'oldest' | 'popular';
  filterCardType?: string;
  filterTone?: string;
  onCardSelect?: (card: GalleryCard) => void;
}

const EnhancedGallery: React.FC<EnhancedGalleryProps> = ({
  className = '',
  showSearch = true,
  itemsPerPage = 24,
  viewMode = 'grid',
  sortBy = 'newest',
  filterCardType = 'all',
  filterTone = 'all',
  onCardSelect,
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
  const [filteredCards, setFilteredCards] = useState<GalleryCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<GalleryCard | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'front' | 'back' | 'left' | 'right'>('front');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [liked, setLiked] = useState<Set<string>>(new Set());

  // Refs for infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Panel information
  const panels = [
    { id: 'front', label: 'Front Cover', icon: <Eye className="w-4 h-4" /> },
    { id: 'back', label: 'Back Cover', icon: <ChevronLeft className="w-4 h-4" /> },
    { id: 'left', label: 'Left Interior', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'right', label: 'Right Interior', icon: <Heart className="w-4 h-4" /> },
  ];

  // Load cards from cache or API
  const loadCards = useCallback(async (page: number, search: string = '', reset: boolean = false) => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const newCards = await loadCardsFromCache(page, search, reset);
      setCards(prev => {
        if (reset) {
          return newCards;
        }
        const existingIds = new Set(prev.map(card => card.id));
        const uniqueNewCards = newCards.filter(card => !existingIds.has(card.id));
        return [...prev, ...uniqueNewCards];
      });
      
      setHasMore(newCards.length === itemsPerPage && (!isComplete || !!search));
      setCurrentPage(page);
    } catch (error) {
      console.error('Error loading cards:', error);
      setError(error instanceof Error ? error.message : 'Failed to load cards');
      toast.error('Failed to load cards');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [loading, itemsPerPage, isComplete, loadCardsFromCache]);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...cards];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(card => 
        card.prompt?.toLowerCase().includes(query) ||
        card.toField?.toLowerCase().includes(query) ||
        card.fromField?.toLowerCase().includes(query) ||
        card.message?.toLowerCase().includes(query)
      );
    }
    
    // Apply card type filter
    if (filterCardType && filterCardType !== 'all') {
      filtered = filtered.filter(card => card.cardType === filterCardType);
    }
    
    // Apply tone filter
    if (filterTone && filterTone !== 'all') {
      filtered = filtered.filter(card => card.tone === filterTone);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'popular':
          // For now, just randomize for "popular" since we don't have view counts
          return Math.random() - 0.5;
        case 'newest':
        default:
          return b.createdAt - a.createdAt;
      }
    });
    
    setFilteredCards(filtered);
  }, [cards, searchQuery, filterCardType, filterTone, sortBy]);

  // Search functionality with debouncing
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (query) {
        setCards([]);
        setCurrentPage(1);
        setHasMore(true);
        loadCards(1, query, true);
      }
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
        if (target.isIntersecting && hasMore && !loading && !initialLoading && !searchQuery) {
          loadCards(currentPage + 1, '');
        }
      },
      {
        root: null,
        rootMargin: '100px',
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

  // Initial load
  useEffect(() => {
    loadCards(1, '', true);
  }, []);

  // Handle card selection
  const handleCardClick = (card: GalleryCard) => {
    if (onCardSelect) {
      onCardSelect(card);
    } else {
      setSelectedCard(card);
      setShowModal(true);
      setActivePanel('front');
      setZoomLevel(1);
    }
  };

  // Copy card link
  const copyCardLink = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Card link copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  // Download card image
  const downloadImage = async (imageUrl: string, fileName: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Image downloaded!');
    } catch (error) {
      toast.error('Failed to download image');
    }
  };

  // Toggle like
  const toggleLike = (e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    setLiked(prev => {
      const newLiked = new Set(prev);
      if (newLiked.has(cardId)) {
        newLiked.delete(cardId);
        toast.success('Removed from favorites');
      } else {
        newLiked.add(cardId);
        toast.success('Added to favorites!');
      }
      return newLiked;
    });
  };

  // Get current panel image
  const getCurrentPanelImage = () => {
    if (!selectedCard) return '';
    switch (activePanel) {
      case 'back': return selectedCard.backCover || '';
      case 'left': return selectedCard.leftPage || '';
      case 'right': return selectedCard.rightPage || '';
      default: return selectedCard.frontCover || '';
    }
  };

  // Render card based on view mode
  const renderCard = (card: GalleryCard, index: number) => {
    const isLiked = liked.has(card.id);
    
    if (viewMode === 'list') {
      return (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="group"
        >
          <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => handleCardClick(card)}>
            <CardContent className="p-0">
              <div className="flex items-center gap-4">
                <div className="relative w-32 h-40 flex-shrink-0">
                  <img
                    src={card.frontCover}
                    alt={card.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex-1 p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 mb-2">
                    {card.prompt || 'Untitled Card'}
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {card.cardType && (
                      <Badge variant="secondary" className="text-xs">
                        {card.cardType}
                      </Badge>
                    )}
                    {card.tone && (
                      <Badge variant="outline" className="text-xs">
                        {card.tone}
                      </Badge>
                    )}
                    {card.artisticStyle && (
                      <Badge variant="outline" className="text-xs">
                        <Palette className="w-3 h-3 mr-1" />
                        {card.artisticStyle}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {card.createdAtFormatted}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => toggleLike(e, card.id)}
                        className={cn(
                          "h-8 w-8 p-0",
                          isLiked && "text-red-500"
                        )}
                      >
                        <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
                      </Button>
                      {card.shareUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => copyCardLink(e, card.shareUrl!)}
                          className="h-8 w-8 p-0"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      );
    }
    
    // Grid or Masonry view
    return (
      <motion.div
        key={card.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
        className={cn(
          "group relative",
          viewMode === 'masonry' && index % 3 === 0 && "row-span-2"
        )}
      >
        <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer" onClick={() => handleCardClick(card)}>
          <CardContent className="p-0">
            <div className={cn(
              "relative overflow-hidden",
              viewMode === 'masonry' ? "h-auto" : "aspect-[3/4]"
            )}>
              <img
                src={card.frontCover}
                alt={card.prompt}
                className={cn(
                  "w-full object-cover transition-transform duration-300 group-hover:scale-105",
                  viewMode === 'masonry' ? "h-auto" : "h-full"
                )}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                  <h3 className="font-semibold line-clamp-2 mb-2">
                    {card.prompt || 'Untitled Card'}
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs">
                      <Calendar className="w-3 h-3" />
                      {card.createdAtFormatted}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => toggleLike(e, card.id)}
                        className={cn(
                          "h-8 w-8 p-0 text-white hover:text-red-500",
                          isLiked && "text-red-500"
                        )}
                      >
                        <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
                      </Button>
                      {card.shareUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => copyCardLink(e, card.shareUrl!)}
                          className="h-8 w-8 p-0 text-white hover:text-blue-400"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Quick badges */}
              <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                {card.cardType && (
                  <Badge variant="secondary" className="text-xs bg-white/90 backdrop-blur-sm">
                    {card.cardType}
                  </Badge>
                )}
                {card.tone && (
                  <Badge variant="secondary" className="text-xs bg-white/90 backdrop-blur-sm">
                    {card.tone}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <div className={className}>
      {/* Search Bar */}
      {showSearch && (
        <div className="mb-6">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search by prompt, message, or recipient..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>
        </div>
      )}

      {/* Cards Grid */}
      {initialLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-lg">Loading gallery...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <Button onClick={() => loadCards(1, '', true)} className="mt-4">
            Try Again
          </Button>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <ImageIcon className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">No cards found</p>
          <p className="text-gray-400 text-sm">Try adjusting your filters or search terms</p>
        </div>
      ) : (
        <>
          <div className={cn(
            viewMode === 'list' && "space-y-4",
            viewMode === 'grid' && "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6",
            viewMode === 'masonry' && "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 auto-rows-[200px]"
          )}>
            {filteredCards.map((card, index) => renderCard(card, index))}
          </div>

          {/* Loading indicator for infinite scroll */}
          {hasMore && !searchQuery && (
            <div ref={loadingRef} className="flex justify-center py-8">
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading more cards...</span>
                </div>
              ) : (
                <div className="h-10" /> // Invisible trigger for intersection observer
              )}
            </div>
          )}
        </>
      )}

      {/* Enhanced Card Preview Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-semibold">
                Card Preview
              </DialogTitle>
              <div className="flex items-center gap-2">
                {selectedCard?.shareUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(selectedCard.shareUrl, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Full View
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowModal(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Card Panels Navigation */}
            <div className="lg:w-64 border-r bg-gray-50 dark:bg-gray-900/50 p-4">
              <h3 className="font-semibold mb-4">Card Panels</h3>
              <div className="space-y-2">
                {panels.map((panel) => (
                  <Button
                    key={panel.id}
                    variant={activePanel === panel.id ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setActivePanel(panel.id as any)}
                    disabled={
                      panel.id === 'back' && !selectedCard?.backCover ||
                      panel.id === 'left' && !selectedCard?.leftPage ||
                      panel.id === 'right' && !selectedCard?.rightPage
                    }
                  >
                    {panel.icon}
                    <span className="ml-2">{panel.label}</span>
                  </Button>
                ))}
              </div>

              {/* Card Details */}
              <div className="mt-6 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Details</h4>
                  <div className="space-y-2 text-sm">
                    {selectedCard?.cardType && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{selectedCard.cardType}</Badge>
                      </div>
                    )}
                    {selectedCard?.tone && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{selectedCard.tone}</Badge>
                      </div>
                    )}
                    {selectedCard?.artisticStyle && (
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4 text-gray-500" />
                        <span>{selectedCard.artisticStyle}</span>
                      </div>
                    )}
                    {selectedCard?.createdAtFormatted && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span>{selectedCard.createdAtFormatted}</span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedCard?.prompt && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Prompt</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                      {selectedCard.prompt}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Image Viewer */}
            <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-950">
              {/* Zoom Controls */}
              <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                    disabled={zoomLevel <= 0.5}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium w-16 text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
                    disabled={zoomLevel >= 3}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setZoomLevel(1)}
                    className="ml-2"
                  >
                    Reset
                  </Button>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleLike(new MouseEvent('click') as any, selectedCard?.id || '')}
                    className={cn(
                      liked.has(selectedCard?.id || '') && "text-red-500"
                    )}
                  >
                    <Heart className={cn(
                      "w-4 h-4 mr-2",
                      liked.has(selectedCard?.id || '') && "fill-current"
                    )} />
                    {liked.has(selectedCard?.id || '') ? 'Liked' : 'Like'}
                  </Button>
                  {selectedCard?.shareUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(selectedCard.shareUrl!)}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Link
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadImage(getCurrentPanelImage(), `card-${activePanel}.jpg`)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Image Display */}
              <div className="flex-1 overflow-auto p-8">
                <div className="flex items-center justify-center min-h-full">
                  <div
                    className="transition-transform duration-300 ease-out"
                    style={{ transform: `scale(${zoomLevel})` }}
                  >
                    <img
                      src={getCurrentPanelImage()}
                      alt={`Card ${activePanel} panel`}
                      className="max-w-full h-auto rounded-lg shadow-2xl"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnhancedGallery;