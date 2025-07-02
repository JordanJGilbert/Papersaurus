import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Calendar, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { motion } from "framer-motion";
import { toast } from "sonner";
import NetflixStyleImage from "./NetflixStyleImage";
import { useNetworkAware } from "../hooks/useNetworkAware";

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

interface NetflixStyleGalleryProps {
  cards: GalleryCard[];
  onCardSelect?: (card: GalleryCard) => void;
  templateMode?: boolean;
  className?: string;
}

const NetflixStyleGallery: React.FC<NetflixStyleGalleryProps> = ({
  cards,
  onCardSelect,
  templateMode = false,
  className = ''
}) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<any>(null);
  const { isSlowConnection, isFastConnection } = useNetworkAware();

  // Calculate grid dimensions (Netflix-style responsive grid)
  const { columnCount, columnWidth, rowHeight } = useMemo(() => {
    const minCardWidth = isSlowConnection ? 200 : 240;
    const gap = 16;
    const availableWidth = containerSize.width - 32;
    
    const cols = Math.max(2, Math.floor((availableWidth + gap) / (minCardWidth + gap)));
    const cardWidth = Math.floor((availableWidth - (gap * (cols - 1))) / cols);
    const cardHeight = Math.floor(cardWidth * 1.5) + (isSlowConnection ? 80 : 100);
    
    return {
      columnCount: cols,
      columnWidth: cardWidth + gap,
      rowHeight: cardHeight
    };
  }, [containerSize.width, isSlowConnection]);

  const rowCount = Math.ceil(cards.length / columnCount);

  // Handle container resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    updateSize();
    return () => resizeObserver.disconnect();
  }, []);

  // Netflix-style predictive preloading
  const predictivePreload = useCallback((visibleStartIndex: number, visibleStopIndex: number) => {
    if (isSlowConnection) return; // Skip on slow connections

    const bufferSize = isFastConnection ? 20 : 10;
    const startPreload = Math.max(0, visibleStartIndex - bufferSize);
    const endPreload = Math.min(cards.length - 1, visibleStopIndex + bufferSize);

    for (let i = startPreload; i <= endPreload; i++) {
      const card = cards[i];
      if (card && card.frontCover && !preloadedImages.has(card.frontCover)) {
        // Preload in background
        const img = new Image();
        img.onload = () => {
          setPreloadedImages(prev => new Set([...prev, card.frontCover]));
        };
        img.src = card.frontCover;
      }
    }
  }, [cards, isSlowConnection, isFastConnection, preloadedImages]);

  const handleCardClick = (card: GalleryCard) => {
    if (onCardSelect) {
      onCardSelect(card);
    }
  };

  const copyCardLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Card link copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  // Netflix-style grid cell renderer
  const Cell = ({ columnIndex, rowIndex, style }: any) => {
    const cardIndex = rowIndex * columnCount + columnIndex;
    const card = cards[cardIndex];

    if (!card) return null;

    const frontImage = card.frontCover || card.backCover || card.leftPage || card.rightPage;
    const isPriority = cardIndex < columnCount * 3; // First 3 rows get priority

    return (
      <div style={style}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            duration: 0.2, 
            delay: Math.min(cardIndex * 0.01, 0.3),
            ease: "easeOut"
          }}
          className="group pr-4 pb-4"
        >
          <div 
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer transform hover:scale-105 hover:-translate-y-1 h-full"
            onClick={() => handleCardClick(card)}
          >
            {/* Netflix-style image */}
            <div className="aspect-[2/3] relative overflow-hidden bg-gray-100">
              {frontImage ? (
                <NetflixStyleImage
                  src={frontImage}
                  alt={`Card: ${card.prompt || 'Untitled'}`}
                  className="w-full h-full"
                  priority={isPriority}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1" />
                    <p className="text-xs">No preview</p>
                  </div>
                </div>
              )}
              
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-200 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 rounded-full p-2 shadow-lg">
                  <Eye className="w-4 h-4 text-gray-700" />
                </div>
              </div>
              
              {/* Badge */}
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="bg-black/50 text-white border-0 text-xs px-1.5 py-0.5">
                  <Eye className="w-2 h-2 mr-1" />
                  {templateMode ? "Use" : "View"}
                </Badge>
              </div>
            </div>
            
            {/* Compact content */}
            <div className="p-3">
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-medium text-gray-900 text-xs line-clamp-2 flex-1">
                  {card.prompt || 'Untitled Card'}
                </h3>
                {card.shareUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-5 w-5 p-0 text-gray-400 hover:text-blue-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyCardLink(card.shareUrl!);
                    }}
                    title="Copy link"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </Button>
                )}
              </div>
              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center truncate">
                  <Calendar className="w-2.5 h-2.5 mr-1 flex-shrink-0" />
                  <span className="truncate">{card.createdAtFormatted.split(' at')[0]}</span>
                </span>
                <span className="flex items-center ml-1">
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  // Handle scroll for predictive loading
  const handleItemsRendered = ({ visibleRowStartIndex, visibleRowStopIndex }: any) => {
    const visibleStartIndex = visibleRowStartIndex * columnCount;
    const visibleStopIndex = (visibleRowStopIndex + 1) * columnCount - 1;
    predictivePreload(visibleStartIndex, visibleStopIndex);
  };

  if (containerSize.width === 0) {
    return <div ref={containerRef} className={`w-full h-full ${className}`} />;
  }

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <Grid
        ref={gridRef}
        columnCount={columnCount}
        columnWidth={columnWidth}
        height={containerSize.height}
        rowCount={rowCount}
        rowHeight={rowHeight}
        width={containerSize.width}
        itemData={cards}
        onItemsRendered={handleItemsRendered}
        overscanRowCount={2} // Netflix-style buffer
        style={{ scrollbarWidth: 'thin' }}
      >
        {Cell}
      </Grid>
    </div>
  );
};

export default NetflixStyleGallery;