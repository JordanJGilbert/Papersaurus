"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Edit, Clock, CheckCircle, Sparkles, Printer, Mail, ChevronLeft } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Separator } from "@/components/ui/separator";
import CardPreview from "@/components/CardPreview";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;
  backCover: string;
  leftPage: string;
  rightPage: string;
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

interface Step5Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  isGenerating?: boolean;
  isGeneratingMessage?: boolean;
  generationProgress?: string;
  progressPercentage?: number;
  currentElapsedTime?: number;
  generatedCards?: GeneratedCard[];
  selectedCardIndex?: number;
  formatGenerationTime?: (seconds: number) => string;
  onGenerateCards?: () => void;
  onSelectCard?: (index: number) => void;
  isCardCompleted?: boolean;
  onRegenerate?: () => void;
}

export default function Step5Generate({ 
  formData, 
  updateFormData, 
  onStepComplete, 
  isGenerating = false, 
  isGeneratingMessage = false,
  generationProgress = "",
  progressPercentage = 0,
  currentElapsedTime = 0,
  generatedCards = [],
  selectedCardIndex = -1,
  formatGenerationTime,
  onGenerateCards,
  onSelectCard,
  isCardCompleted = false,
  onRegenerate
}: Step5Props) {
  const [isReady, setIsReady] = useState(false);
  const [showPrintConfirmation, setShowPrintConfirmation] = useState(false);
  const [printOption, setPrintOption] = useState<'physical' | 'email'>('physical');

  // Mark step as complete when ready
  useEffect(() => {
    if (isReady && onStepComplete) {
      onStepComplete();
    }
  }, [isReady, onStepComplete]);

  // Auto-mark as ready
  useEffect(() => {
    setIsReady(true);
  }, []);

  // Get selected card
  const selectedCard = selectedCardIndex >= 0 && selectedCardIndex < generatedCards.length 
    ? generatedCards[selectedCardIndex] 
    : null;

  // Print handlers
  const handlePrintClick = () => {
    if (!selectedCard) {
      toast.error("Please select a card design first");
      return;
    }
    
    if (!formData.userEmail?.trim()) {
      toast.error("Please enter your email address before printing");
      return;
    }
    
    setPrintOption('physical');
    setShowPrintConfirmation(true);
  };

  const handleConfirmPrint = async () => {
    if (!selectedCard) {
      toast.error("No card selected");
      return;
    }
    
    setShowPrintConfirmation(false);
    
    try {
      const cardData = {
        front_cover: selectedCard.frontCover,
        back_cover: selectedCard.backCover,
        left_page: selectedCard.leftPage,
        right_page: selectedCard.rightPage,
        card_name: (selectedCard.prompt || 'Custom Card').substring(0, 50),
        paper_size: 'standard',
        is_front_back_only: formData.isFrontBackOnly,
        copies: 1,
        color_mode: 'color',
        quality: 'high'
      };

      if (printOption === 'email') {
        const emailData = {
          ...cardData,
          user_email: formData.userEmail.trim(),
          send_pdf: true
        };

        const response = await fetch('/api/send-pdf-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'success') {
          toast.success(`📧 PDF sent to ${formData.userEmail}! Check your inbox.`);
        } else {
          throw new Error(result.error || 'Failed to send PDF');
        }
      } else {
        // Physical printing logic
        const response = await fetch('/api/print-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cardData),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'queued') {
          toast.success(`🖨️ Your card is now printing! You can pick it up shortly.`);
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      }
    } catch (error) {
      console.error('Print/Email error:', error);
      toast.error(printOption === 'email' ? "Failed to send PDF email" : "Failed to queue print job");
    }
  };

  // Show loading state while generating
  if (isGenerating && generatedCards.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Creating Your Cards
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Generating 5 unique high-quality card variations...
            </p>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {generationProgress || "Generating your cards..."}
              </span>
            </div>

            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium">
                {Math.round(progressPercentage)}% Complete
              </span>
              <div className="flex items-center gap-3">
                {currentElapsedTime > 0 && formatGenerationTime && (
                  <span className="text-blue-600 dark:text-blue-400">
                    ⏱️ {formatGenerationTime(currentElapsedTime)}
                  </span>
                )}
                <span className="text-gray-500">
                  ~2-3 min expected
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">What's happening:</h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Creating 5 unique card designs with all 4 panels</li>
            <li>• Using high-quality image generation</li>
            <li>• Each card will be complete and ready to print</li>
            {formData.selectedArtisticStyle === "ai-smart-style" && (
              <li>• Each variation will showcase a different artistic style</li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  // Show generation button if no cards yet
  if (!isGenerating && generatedCards.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Ready to Create Your Card?
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            We'll generate 5 unique card variations for you to choose from
          </p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm">🎨</span>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-purple-900 dark:text-purple-100">
                Complete Card Generation
              </h4>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Each card variation will include all 4 panels in high quality:
              </p>
              <ul className="text-sm text-purple-600 dark:text-purple-400 space-y-1 ml-4">
                <li>• Front cover with your design</li>
                <li>• Back cover with decorative elements</li>
                {!formData.isFrontBackOnly && (
                  <>
                    <li>• Left interior with themed artwork</li>
                    <li>• Right interior with your message</li>
                  </>
                )}
              </ul>
              {formData.selectedArtisticStyle === "ai-smart-style" && (
                <p className="text-sm text-purple-600 dark:text-purple-400 italic mt-2">
                  Each variation will showcase a different artistic style!
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onGenerateCards}
          disabled={isGenerating || isGeneratingMessage || !formData.userEmail?.trim()}
          className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-5 h-5" />
          <span>Generate 5 Card Variations</span>
        </button>

        {!formData.userEmail?.trim() && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <span className="text-amber-600">⚠️</span>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Please enter your email address in the previous step to generate your card.
              </p>
            </div>
          </div>
        )}

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">💡 Generation Tips:</h4>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <li>• Generation takes 2-3 minutes for high-quality results</li>
            <li>• You can safely leave this page during generation</li>
            <li>• Each card will be complete with all panels</li>
            {formData.referenceImageUrls?.length > 0 && (
              <li>• Your {formData.referenceImageUrls.length} reference photo{formData.referenceImageUrls.length > 1 ? 's' : ''} will be incorporated into the designs</li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  // Show card selection UI when cards are generated
  if (generatedCards.length > 0) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isGenerating ? "Creating Your Cards..." : "Choose Your Favorite Design"}
          </h3>
          {!isGenerating && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select the card design you'd like to use. Each is a complete, print-ready card.
            </p>
          )}
        </div>

        {/* Progress bar if still generating */}
        {isGenerating && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {generationProgress || "Generating remaining variations..."}
                </span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium">
                  {Math.round(progressPercentage)}% Complete
                </span>
                <div className="flex items-center gap-3">
                  {currentElapsedTime > 0 && formatGenerationTime && (
                    <span className="text-blue-600 dark:text-blue-400">
                      ⏱️ {formatGenerationTime(currentElapsedTime)}
                    </span>
                  )}
                  <span className="text-gray-500">
                    ~2-3 min expected
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Card selection grid */}
        <div className="w-full">
          <div className="flex overflow-x-auto gap-3 pb-4 -mx-4 px-4 snap-x snap-mandatory touch-pan-x">
            {Array.from({ length: 5 }, (_, displayIndex) => {
              const card = generatedCards[displayIndex];
              const isSelected = selectedCardIndex === displayIndex;
              const isLoading = !card;
              
              return (
                <div
                  key={displayIndex}
                  className={`flex-shrink-0 w-52 sm:w-56 snap-center rounded-lg border-2 p-3 transition-all cursor-pointer touch-manipulation ${
                    isSelected
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg'
                      : card
                      ? 'border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10'
                      : 'border-dashed border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={() => card && onSelectCard && onSelectCard(displayIndex)}
                >
                  {card ? (
                    <>
                      <div className="aspect-[2/3] relative overflow-hidden rounded border mb-3">
                        <img
                          src={card.frontCover}
                          alt={`Design ${displayIndex + 1} - Front Cover`}
                          className="w-full h-full object-cover"
                        />
                        
                        {isSelected && (
                          <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center pointer-events-none">
                            <div className="bg-white rounded-full p-2">
                              <CheckCircle className="w-8 h-8 text-purple-600" />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-center space-y-2">
                        <h4 className="font-medium text-sm">
                          Design {displayIndex + 1}
                        </h4>
                        {formData.selectedArtisticStyle === "ai-smart-style" && card.styleInfo && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {card.styleInfo.styleLabel}
                          </p>
                        )}
                        {isSelected && (
                          <div className="bg-purple-600 text-white text-xs px-3 py-1 rounded-full">
                            ✓ Selected
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <h4 className="font-medium text-sm mb-1">Creating...</h4>
                      <p className="text-xs text-gray-500">Generating card...</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected card preview and actions */}
          {selectedCard && !isGenerating && (
            <div className="space-y-4 mt-6">
              <div className="text-center bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  ✓ Design {selectedCardIndex + 1} selected - ready to view or print!
                </p>
              </div>

              {/* Full card preview */}
              <CardPreview 
                card={selectedCard}
                isFrontBackOnly={formData.isFrontBackOnly}
                onPrint={handlePrintClick}
                referenceImageUrls={formData.referenceImageUrls}
                personalTraits={formData.personalTraits}
                relationshipField={formData.relationshipField}
                photoReferences={formData.photoReferences}
              />

              {/* Action buttons */}
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={onRegenerate}
                  disabled={isGenerating}
                  className="h-10 px-4"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate New Variations
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}