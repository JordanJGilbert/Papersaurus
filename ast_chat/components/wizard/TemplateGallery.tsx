"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Search, Grid, List, Image, Clock, CheckCircle, Sparkles, 
  Heart, Star, Filter, X, ArrowLeft, ArrowRight 
} from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { toast } from "sonner";
import { useCardCache } from "@/hooks/useCardCache";

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;
  backCover?: string;
  leftPage?: string;
  rightPage?: string;
  createdAt: Date;
  shareUrl?: string;
  generatedPrompts?: {
    frontCover?: string;
    backCover?: string;
    leftInterior?: string;
    rightInterior?: string;
  };
  styleInfo?: {
    styleName?: string;
    styleLabel?: string;
  };
}

interface TemplateGalleryProps {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onTemplateSelect: (template: GeneratedCard) => void;
  isOpen: boolean;
  onClose: () => void;
}

const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

export default function TemplateGallery({ 
  formData, 
  updateFormData, 
  onTemplateSelect, 
  isOpen, 
  onClose 
}: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<GeneratedCard[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<GeneratedCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<GeneratedCard | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Use the cached template system
  const { getCachedCards, hasCache, totalCards, preloadAllCards, isLoading: cacheLoading } = useCardCache();

  // Load templates from cache
  const loadTemplates = () => {
    setLoading(true);
    try {
      if (hasCache) {
        // Get all cached cards and convert to our format
        const cachedCards = getCachedCards(1, totalCards);
        const convertedTemplates = cachedCards.map((card: any) => ({
          id: card.id,
          prompt: card.prompt || '',
          frontCover: card.frontCover || '',
          backCover: card.backCover,
          leftPage: card.leftPage,
          rightPage: card.rightPage,
          createdAt: new Date(card.createdAt || Date.now()),
          shareUrl: card.shareUrl,
          generatedPrompts: card.generatedPrompts || {},
          styleInfo: card.styleInfo || {}
        }));
        
        setTemplates(convertedTemplates);
        setFilteredTemplates(convertedTemplates);
        setHasMore(false); // All templates loaded from cache
      } else {
        // Trigger cache preload if not available
        preloadAllCards();
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error('Failed to load templates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load templates when component mounts
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen, hasCache, totalCards]);
  
  // Filter templates based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTemplates(templates);
    } else {
      const filtered = templates.filter(template => 
        template.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.styleInfo?.styleLabel?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredTemplates(filtered);
    }
  }, [searchQuery, templates]);

  // Load more templates (not needed with cache, but kept for compatibility)
  const loadMore = () => {
    // No-op since we load all templates from cache
  };

  // Handle template selection
  const handleTemplateSelect = async (template: GeneratedCard) => {
    try {
      // If template doesn't have a share URL, create one
      let templateToUse = template;
      if (!template.shareUrl) {
        const storeResponse = await fetch('/api/cards/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: template.prompt || '',
            frontCover: template.frontCover || '',
            backCover: template.backCover || '',
            leftPage: template.leftPage || '',
            rightPage: template.rightPage || '',
            generatedPrompts: template.generatedPrompts || null
          })
        });

        if (storeResponse.ok) {
          const storeData = await storeResponse.json();
          templateToUse = {
            ...template,
            shareUrl: storeData.share_url || storeData.shareUrl
          };
        }
      }

      // Update form data with template information
      updateFormData({
        prompt: templateToUse.prompt || '',
        // Extract card type from prompt if possible
        selectedType: extractCardTypeFromPrompt(templateToUse.prompt) || formData.selectedType,
        // Extract style info if available
        selectedArtisticStyle: templateToUse.styleInfo?.styleName || formData.selectedArtisticStyle
      });

      // Call the selection callback
      onTemplateSelect(templateToUse);
      
      toast.success('Template selected! Your card will be based on this design.');
      onClose();
    } catch (error) {
      console.error('Failed to select template:', error);
      toast.error('Failed to use template. Please try again.');
    }
  };

  // Extract card type from prompt (basic implementation)
  const extractCardTypeFromPrompt = (prompt: string): string | null => {
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('birthday')) return 'birthday';
    if (lowerPrompt.includes('thank') || lowerPrompt.includes('grateful')) return 'thank-you';
    if (lowerPrompt.includes('anniversary')) return 'anniversary';
    if (lowerPrompt.includes('congratulat')) return 'congratulations';
    if (lowerPrompt.includes('holiday') || lowerPrompt.includes('christmas') || lowerPrompt.includes('new year')) return 'holiday';
    if (lowerPrompt.includes('love') || lowerPrompt.includes('romantic')) return 'love';
    if (lowerPrompt.includes('wedding')) return 'wedding';
    if (lowerPrompt.includes('graduat')) return 'graduation';
    if (lowerPrompt.includes('baby')) return 'new-baby';
    if (lowerPrompt.includes('sorry') || lowerPrompt.includes('apolog')) return 'apology';
    return null;
  };

  // Search is now handled by the filter effect above

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] sm:h-[85vh] w-[98vw] sm:w-auto flex flex-col m-0 sm:m-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              <span className="text-lg sm:text-xl font-semibold">Template Gallery</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="sm:hidden h-9 w-9 p-0"
            >
              <X className="w-5 h-5" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search and Controls */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 touch-manipulation text-base"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-9 px-3 touch-manipulation"
                >
                  <Grid className="w-4 h-4" />
                  <span className="hidden sm:inline ml-2">Grid</span>
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-9 px-3 touch-manipulation"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline ml-2">List</span>
                </Button>
              </div>
              
              <div className="text-xs text-gray-500">
                {filteredTemplates.length} templates
              </div>
            </div>
          </div>

          {/* Templates Grid/List */}
          <div className="flex-1 overflow-y-auto">
            {(loading || cacheLoading) ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 animate-spin text-blue-600" />
                  <span>Loading templates...</span>
                </div>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Image className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">No templates found</p>
                  <p className="text-sm text-gray-400">Try adjusting your search terms</p>
                </div>
              </div>
            ) : (
              <div className={viewMode === 'grid' 
                ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 px-1" 
                : "space-y-4 px-1"
              }>
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="group cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleTemplateSelect(template)}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="relative">
                        <img
                          src={template.frontCover}
                          alt={template.prompt}
                          className="w-full h-40 sm:h-48 object-cover rounded-lg mb-3"
                        />
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="text-xs">
                            Template
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                          {template.prompt}
                        </p>
                        
                        {template.styleInfo?.styleLabel && (
                          <Badge variant="outline" className="text-xs">
                            {template.styleInfo.styleLabel}
                          </Badge>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {template.createdAt.toLocaleDateString()}
                          </div>
                          
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTemplateSelect(template);
                            }}
                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-9 px-3 touch-manipulation text-xs"
                          >
                            <span className="hidden sm:inline">Use Template</span>
                            <span className="sm:hidden">Use</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Load More Button - Hidden since we load all templates from cache */}
            {hasMore && !loading && filteredTemplates.length > 0 && (
              <div className="flex justify-center mt-6">
                <div className="text-sm text-gray-500">
                  All templates loaded
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}