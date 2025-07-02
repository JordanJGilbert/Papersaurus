import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Calendar, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { motion } from "framer-motion";
import { toast } from "sonner";
import FastImage from "./FastImage";

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

interface VirtualizedGalleryProps {
  cards: GalleryCard[];
  onCardSelect?: (card: GalleryCard) => void;
  templateMode?: boolean;
  className?: string;
}

const VirtualizedGallery: React.FC<VirtualizedGalleryProps> = ({
  cards,
  onCardSelect,
  templateMode = false,
  className = ''
}) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate grid dimensions
  const { columnCount, columnWidth, rowHeight } = useMemo(() => {
    const minCardWidth = 240;
    const gap = 24;
    const availableWidth = containerSize.width - 32; // Account for padding
    
    const cols = Math.max(1, Math.floor((availableWidth + gap) / (minCardWidth + gap)));
    const cardWidth = Math.floor((availableWidth - (gap * (cols - 1))) / cols);
    const cardHeight = Math.floor(cardWidth * 1.5) + 100; // 2:3 aspect ratio + content height
    
    return {
      columnCount: cols,
      columnWidth: cardWidth + gap,
      rowHeight: cardHeight
    };
  }, [containerSize.width]);

  const rowCount = Math.ceil(cards.length / columnCount);

  // Handle container resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

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

  const Cell = ({ columnIndex, rowIndex, style }: any) => {
    const cardIndex = rowIndex * columnCount + columnIndex;
    const card = cards[cardIndex];

    if (!card) return null;

    const frontImage = card.frontCover || card.backCover || card.leftPage || card.rightPage;

    return (
      <div style={style}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(cardIndex * 0.01, 0.3) }}
          className="group pr-6 pb-6"
        >
          <div 
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer transform hover:-translate-y-1 h-full"
            onClick={() => handleCardClick(card)}
          >
            {/* Image */}
            <div className="aspect-[2/3] relative overflow-hidden bg-gray-100">
              {frontImage ? (
                <FastImage
                  src={frontImage}
                  alt={`Card: ${card.prompt || 'Untitled'}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  sizes="240px"
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
                {card.shareUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-6 w-6 p-0 text-gray-400 hover:text-blue-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyCardLink(card.shareUrl!);
                    }}
                    title="Copy link"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                )}
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
      </div>
    );
  };

  if (containerSize.width === 0) {
    return <div ref={containerRef} className={`w-full h-full ${className}`} />;
  }

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <Grid
        columnCount={columnCount}
        columnWidth={columnWidth}
        height={containerSize.height}
        rowCount={rowCount}
        rowHeight={rowHeight}
        width={containerSize.width}
        itemData={cards}
      >
        {Cell}
      </Grid>
    </div>
  );
};

export default VirtualizedGallery;