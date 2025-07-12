"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Tabs removed - draft sessions no longer supported
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Clock, 
  Trash2, 
  Play, 
  Calendar,
  Image,
  FileText,
  Palette,
  Mail,
  Share2,
  Download
} from 'lucide-react';
import { useCardHistory } from '@/hooks/useCardHistorySimplified';
import { toast } from 'sonner';

interface CardHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResumeDraft?: (sessionId: string) => void;
  onLoadCard?: (cardId: string) => void;
}

export default function CardHistoryModal({ 
  isOpen, 
  onClose, 
  onResumeDraft,
  onLoadCard 
}: CardHistoryModalProps) {
  const { 
    cardHistory,
    draftSessions,
    clearHistory 
  } = useCardHistory();
  
  // These features are no longer available in simplified version
  const isLoading = false;
  const history = {
    completedCards: cardHistory,
    draftSessions: draftSessions
  };

  // Removed tabs since draft sessions are no longer supported

  const handleResumeDraft = (sessionId: string) => {
    // Draft sessions are no longer supported in simplified version
    toast.info('Draft sessions are no longer supported. Please start a new card.');
  };

  const handleDeleteDraft = (sessionId: string) => {
    // Draft deletion not supported in simplified version
    toast.info('Draft management has been simplified.');
  };

  const handleDeleteCard = (cardId: string) => {
    // Individual card deletion not supported in simplified version
    toast.info('Card history is automatically managed.');
  };

  const handleClearAll = () => {
    clearHistory();
    toast.success('All history cleared');
  };

  const handleShareCard = async (card: any) => {
    if (card.shareUrl) {
      try {
        await navigator.clipboard.writeText(card.shareUrl);
        toast.success('Share link copied to clipboard!');
      } catch (error) {
        toast.error('Failed to copy share link');
      }
    } else {
      toast.error('No share link available for this card');
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (date: string | Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return '1 day ago';
    return `${Math.floor(diffInHours / 24)} days ago`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-bold">Your Card History</DialogTitle>
          <DialogDescription>
            View your recently generated cards
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1">
          <div className="px-6 pb-6">
            {/* Completed Cards */}
            <div className="mt-4">
              <ScrollArea className="h-96">
                {history.completedCards.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No completed cards yet</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      Complete your first card to see it here!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.completedCards.map((card) => (
                      <Card key={card.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Card Preview */}
                            <div className="flex-shrink-0">
                              <img 
                                src={card.thumbnailUrl || '/placeholder-card.png'} 
                                alt="Card preview" 
                                className="w-20 h-28 object-cover rounded-lg border shadow-sm"
                              />
                            </div>
                            
                            {/* Card Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-2">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                  {card.type} Card {card.recipient ? `for ${card.recipient}` : ''}
                                </h3>
                                <div className="flex items-center gap-2 ml-2">
                                  <Badge variant="secondary" className="text-xs">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {formatDate(card.date)}
                                  </Badge>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {getRelativeTime(card.date)}
                                </span>
                                {card.tone && (
                                  <span className="flex items-center gap-1">
                                    <Palette className="w-4 h-4" />
                                    {card.tone}
                                  </span>
                                )}
                              </div>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onLoadCard?.(card.id)}
                                  className="flex items-center gap-1"
                                >
                                  <Image className="w-4 h-4" />
                                  View
                                </Button>
                                
                                {card.shareUrl && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleShareCard(card)}
                                    className="flex items-center gap-1"
                                  >
                                    <Share2 className="w-4 h-4" />
                                    Share
                                  </Button>
                                )}
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteCard(card.id)}
                                  className="flex items-center gap-1 text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {history.completedCards.length} recent cards
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}