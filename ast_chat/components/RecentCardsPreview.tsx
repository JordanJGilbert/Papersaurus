import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ArrowRight, Loader2, Image as ImageIcon } from 'lucide-react';
import { motion } from "framer-motion";
import Link from "next/link";
import OptimizedImage from "./OptimizedImage";
import { generateSizesAttribute } from "../utils/imageUtils";
import { useCardCache } from "../hooks/useCardCache";

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

interface RecentCard {
  id: string;
  prompt: string;
  frontCover: string;
  createdAtFormatted: string;
  shareUrl?: string; // Make optional to match GalleryCard
  hasImages: boolean;
}

interface RecentCardsPreviewProps {
  maxCards?: number;
  className?: string;
  onCardSelect?: (card: RecentCard) => void;
}

const RecentCardsPreview: React.FC<RecentCardsPreviewProps> = ({
  maxCards = 6,
  className = '',
  onCardSelect
}) => {
  const { getCachedCards, hasCache } = useCardCache();
  const [cards, setCards] = useState<RecentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRecentCards = async () => {
      // Try to use cached cards first
      if (hasCache) {
        const cachedCards = getCachedCards(1, maxCards);
        if (cachedCards.length > 0) {
          setCards(cachedCards.filter((card: any) => card.hasImages).slice(0, maxCards));
          setLoading(false);
          return;
        }
      }

      // Fallback to API
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${BACKEND_API_BASE_URL}/api/cards/list?page=1&per_page=${maxCards}&template_mode=true`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'success') {
          setCards(data.cards.filter((card: RecentCard) => card.hasImages));
        } else {
          throw new Error(data.message || 'Failed to load cards');
        }
      } catch (error) {
        console.error('Error loading recent cards:', error);
        setError(error instanceof Error ? error.message : 'Failed to load cards');
      } finally {
        setLoading(false);
      }
    };

    loadRecentCards();
  }, [maxCards, hasCache, getCachedCards]);

  const handleCardClick = (card: RecentCard) => {
    if (onCardSelect) {
      onCardSelect(card);
    } else {
      // Extract card ID from shareUrl or use the card.id directly
      let cardId = card.id;
      
      // If shareUrl contains a card ID, extract it
      if (card.shareUrl && card.shareUrl.includes('/card/')) {
        const urlParts = card.shareUrl.split('/card/');
        if (urlParts.length > 1) {
          cardId = urlParts[1].split('?')[0]; // Remove any query parameters
        }
      }
      
      // Navigate to the card viewer web app
      window.open(`/card/${cardId}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Loading Recent Cards...</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: maxCards }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="aspect-[2/3] bg-gray-200 dark:bg-slate-700 animate-pulse"></div>
              <div className="p-2">
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || cards.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Cards</h3>
          <Link href="/gallery">
            <Button variant="outline" size="sm">
              <Eye className="w-4 h-4 mr-2" />
              View All Cards
            </Button>
          </Link>
        </div>
        <div className="text-center py-8 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
          <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {error ? 'Failed to load recent cards' : 'No cards found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Cards</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Inspiration from the latest creations
          </p>
        </div>
        <Link href="/gallery">
          <Button variant="outline" size="sm" className="group">
            <Eye className="w-4 h-4 mr-2" />
            View All
            <ArrowRight className="w-3 h-3 ml-2 group-hover:translate-x-0.5 transition-transform" />
          </Button>
        </Link>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="group"
          >
            <div 
              className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
              onClick={() => handleCardClick(card)}
            >
              {/* Image */}
              <div className="aspect-[2/3] relative overflow-hidden bg-gray-100 dark:bg-slate-700">
                {card.frontCover ? (
                  <OptimizedImage
                    src={card.frontCover}
                    alt={`Card: ${card.prompt || 'Untitled'}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    priority={false}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 dark:bg-slate-800/90 rounded-full p-2 shadow-lg">
                    <Eye className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </div>
                </div>
                
                {/* Badge */}
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="bg-black/50 text-white border-0 text-xs px-1.5 py-0.5">
                    <Eye className="w-2 h-2 mr-1" />
                    View
                  </Badge>
                </div>
              </div>
              
              {/* Content */}
              <div className="p-2">
                <h4 className="font-medium text-gray-900 dark:text-white text-xs line-clamp-2 mb-1">
                  {card.prompt || 'Untitled Card'}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {card.createdAtFormatted}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Call to Action */}
      <div className="text-center pt-2">
        <Link href="/gallery">
          <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
            Discover more amazing cards in our infinite gallery
            <ArrowRight className="w-3 h-3 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default RecentCardsPreview;