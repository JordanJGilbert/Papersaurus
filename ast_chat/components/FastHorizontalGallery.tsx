import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Calendar, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { toast } from "sonner";
import { useCardCache } from "../hooks/useCardCache";

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

interface FastHorizontalGalleryProps {
  onCardSelect?: (card: GalleryCard) => void;
  templateMode?: boolean;
  className?: string;
}

const FastHorizontalGallery: React.FC<FastHorizontalGalleryProps> = ({
  onCardSelect,
  templateMode = false,
  className = ''
}) => {
  const { getCachedCards, hasCache, totalCards } = useCardCache();
  const [cards, setCards] = useState<GalleryCard[]>([]);

  // Load ALL cards immediately - no pagination, no delays
  useEffect(() => {
    if (hasCache) {
      // Get all cards at once
      const allCards = getCachedCards(1, Math.max(totalCards, 1000));
      setCards(allCards);
    }
  }, [hasCache, totalCards, getCachedCards]);

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

  return (
    <div className={`w-full ${className}`}>
      {/* Simple horizontal scroll - like the reference site */}
      <div 
        className="flex overflow-x-auto gap-4 pb-4"
        style={{
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          scrollSnapType: 'x mandatory'
        }}
      >
        {cards.map((card, index) => {
          const frontImage = card.frontCover || card.backCover || card.leftPage || card.rightPage;
          
          return (
            <div
              key={card.id}
              className="flex-shrink-0 w-64 cursor-pointer"
              style={{ scrollSnapAlign: 'start' }}
              onClick={() => handleCardClick(card)}
            >
              <div className="bg-gray-900 rounded-xl p-2 shadow-inner space-y-2 h-full">
                {/* Simple image - no progressive loading, no blur-up */}
                {frontImage ? (
                  <img
                    src={frontImage}
                    alt={`Card: ${card.prompt || 'Untitled'}`}
                    className="rounded-lg shadow-lg w-full h-auto object-cover"
                    loading="lazy" // Browser handles it
                    style={{
                      WebkitUserDrag: 'none',
                      userDrag: 'none',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  />
                ) : (
                  <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">No preview</p>
                    </div>
                  </div>
                )}

                {/* Simple action buttons */}
                <div className="flex justify-around text-sm text-gray-300 px-1 space-x-2">
                  <button className="flex items-center">
                    👍 <span className="ml-1">{Math.floor(Math.random() * 100)}</span>
                  </button>
                  <button 
                    className="flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardClick(card);
                    }}
                  >
                    🖨️ <span className="ml-1">{Math.floor(Math.random() * 50)}</span>
                  </button>
                  <button className="flex items-center">
                    🚩 <span className="ml-1">0</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FastHorizontalGallery;