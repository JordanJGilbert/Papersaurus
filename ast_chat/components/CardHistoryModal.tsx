"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useCardHistory } from '@/hooks/useCardHistory';
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
    history, 
    isLoading, 
    deleteDraftSession, 
    deleteCompletedCard,
    resumeDraftSession,
    clearHistory 
  } = useCardHistory();

  const [activeTab, setActiveTab] = useState<'completed' | 'drafts'>('completed');

  const handleResumeDraft = (sessionId: string) => {
    const session = resumeDraftSession(sessionId);
    if (session) {
      onResumeDraft?.(sessionId);
      onClose();
      toast.success('Draft session resumed!');
    } else {
      toast.error('Failed to resume draft session');
    }
  };

  const handleDeleteDraft = (sessionId: string) => {
    deleteDraftSession(sessionId);
    toast.success('Draft session deleted');
  };

  const handleDeleteCard = (cardId: string) => {
    deleteCompletedCard(cardId);
    toast.success('Card deleted from history');
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (date: Date) => {
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
            View your completed cards and resume draft sessions
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'completed' | 'drafts')} className="flex-1">
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="completed" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Completed Cards ({history.completedCards.length})
              </TabsTrigger>
              <TabsTrigger value="drafts" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Draft Sessions ({history.draftSessions.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-6 pb-6">
            {/* Completed Cards Tab */}
            <TabsContent value="completed" className="mt-4">
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
                                src={card.frontCover} 
                                alt="Card preview" 
                                className="w-20 h-28 object-cover rounded-lg border shadow-sm"
                              />
                            </div>
                            
                            {/* Card Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-2">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                  {card.prompt.substring(0, 50)}
                                  {card.prompt.length > 50 && '...'}
                                </h3>
                                <div className="flex items-center gap-2 ml-2">
                                  <Badge variant="secondary" className="text-xs">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {formatDate(card.createdAt)}
                                  </Badge>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {getRelativeTime(card.createdAt)}
                                </span>
                                {card.styleInfo && (
                                  <span className="flex items-center gap-1">
                                    <Palette className="w-4 h-4" />
                                    {card.styleInfo.styleLabel}
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
            </TabsContent>

            {/* Draft Sessions Tab */}
            <TabsContent value="drafts" className="mt-4">
              <ScrollArea className="h-96">
                {history.draftSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No draft sessions</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      Create draft cards to see them here!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.draftSessions.map((session) => (
                      <Card key={session.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Draft Preview */}
                            <div className="flex-shrink-0">
                              {(() => {
                                const validDrafts = session.draftCards.filter(Boolean);
                                const firstDraft = validDrafts[0];
                                
                                if (firstDraft) {
                                  return (
                                    <div className="relative">
                                      <img 
                                        src={firstDraft.frontCover} 
                                        alt="Draft preview" 
                                        className="w-20 h-28 object-cover rounded-lg border shadow-sm"
                                      />
                                      {validDrafts.length > 1 && (
                                        <Badge 
                                          variant="secondary" 
                                          className="absolute -top-2 -right-2 text-xs bg-purple-600 text-white"
                                        >
                                          {validDrafts.length}
                                        </Badge>
                                      )}
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="w-20 h-28 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center justify-center">
                                      <Clock className="w-6 h-6 text-gray-400" />
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                            
                            {/* Session Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-2">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                  {session.title}
                                </h3>
                                <div className="flex items-center gap-2 ml-2">
                                  <Badge variant="outline" className="text-xs">
                                    {session.draftCards.filter(Boolean).length} drafts
                                  </Badge>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {getRelativeTime(session.lastModified)}
                                </span>
                                {session.selectedDraftIndex >= 0 && (
                                  <span className="flex items-center gap-1">
                                    <Badge variant="secondary" className="text-xs">
                                      Draft {session.selectedDraftIndex + 1} selected
                                    </Badge>
                                  </span>
                                )}
                              </div>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleResumeDraft(session.id)}
                                  className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700"
                                >
                                  <Play className="w-4 h-4" />
                                  Resume
                                </Button>
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteDraft(session.id)}
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
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer Actions */}
        <div className="border-t p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {history.completedCards.length} completed • {history.draftSessions.length} drafts
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