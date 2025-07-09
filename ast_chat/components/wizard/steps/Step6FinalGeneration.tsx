"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Clock, CheckCircle, Printer, Mail } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import CardPreview from "@/components/CardPreview";
import { toast } from "sonner";

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

interface PaperConfig {
  id: string;
  label: string;
  description: string;
  aspectRatio: string;
  dimensions: string;
  printWidth: string;
  printHeight: string;
}

// Paper size options - same as main page
const paperSizes: PaperConfig[] = [
  {
    id: "standard",
    label: "5×7 Card (Standard)",
    description: "Standard 5×7 greeting card (10×7 print layout)",
    aspectRatio: "9:16",
    dimensions: "1024x1536",
    printWidth: "10in",
    printHeight: "7in"
  },
  {
    id: "compact",
    label: "4×6 Card (Compact)",
    description: "Compact 4×6 greeting card (8×6 print layout)",
    aspectRatio: "2:3",
    dimensions: "768x1152",
    printWidth: "8in",
    printHeight: "6in"
  },
  {
    id: "a6",
    label: "A6 Card (4×6)",
    description: "A6 paper size (8.3×5.8 print layout)",
    aspectRatio: "2:3",
    dimensions: "768x1152",
    printWidth: "8.3in",
    printHeight: "5.8in"
  }
];

interface Step6FinalGenerationProps {
  formData: CardFormData;
  isGeneratingFinalCard: boolean;
  generationProgress: string;
  progressPercentage: number;
  currentElapsedTime: number;
  selectedDraftIndex: number;
  draftCards: GeneratedCard[];
  generatedCard: GeneratedCard | null;
  isCardCompleted: boolean;
  onGenerateFinalCard: (draftIndex: number) => void;
  formatGenerationTime: (seconds: number) => string;
}

export default function Step6FinalGeneration({
  formData,
  isGeneratingFinalCard,
  generationProgress,
  progressPercentage,
  currentElapsedTime,
  selectedDraftIndex,
  draftCards,
  generatedCard,
  isCardCompleted,
  onGenerateFinalCard,
  formatGenerationTime
}: Step6FinalGenerationProps) {

  // Print-related state
  const [showPrintConfirmation, setShowPrintConfirmation] = useState(false);
  const [printOption, setPrintOption] = useState<'physical' | 'email'>('physical');
  const [selectedPaperSize, setSelectedPaperSize] = useState<string>("standard");

  // Auto-start final generation when component mounts
  useEffect(() => {
    if (selectedDraftIndex >= 0 && !isGeneratingFinalCard && !isCardCompleted && !generatedCard) {
      console.log('🚀 Auto-starting final card generation for selected draft:', selectedDraftIndex);
      onGenerateFinalCard(selectedDraftIndex);
    }
  }, [selectedDraftIndex, isGeneratingFinalCard, isCardCompleted, generatedCard, onGenerateFinalCard]);

  const selectedDraft = draftCards[selectedDraftIndex];

  // Print click handler
  const handlePrintClick = () => {
    if (!generatedCard) return;
    
    // Check if user email is provided
    if (!formData.userEmail?.trim()) {
      toast.error("Please enter your email address before printing");
      return;
    }
    
    setPrintOption('physical'); // Reset to default
    setShowPrintConfirmation(true);
  };

  // Handle print confirmation
  const handleConfirmPrint = async () => {
    const cardToPrint = generatedCard;
    if (!cardToPrint) {
      toast.error("No card available to print");
      return;
    }
    
    // Validate email before proceeding
    if (!formData.userEmail?.trim()) {
      toast.error("Please enter your email address before printing");
      setShowPrintConfirmation(false);
      return;
    }
    
    setShowPrintConfirmation(false);
    
    try {
      // Validate card data
      if (!cardToPrint.frontCover) {
        toast.error("Card is missing front cover image. Please regenerate the card.");
        return;
      }
      
      if (!cardToPrint.backCover) {
        toast.error("Card is missing back cover image. Please regenerate the card.");
        return;
      }
      
      if (!formData.isFrontBackOnly && (!cardToPrint.leftPage || !cardToPrint.rightPage)) {
        toast.error("Card is missing interior pages. Please regenerate the card or use front-back only mode.");
        return;
      }
      
      // Prepare card data for both printing and PDF email
      const cardData = {
        front_cover: cardToPrint.frontCover,
        back_cover: cardToPrint.backCover,
        left_page: cardToPrint.leftPage,
        right_page: cardToPrint.rightPage,
        card_name: (cardToPrint.prompt || 'Custom Card').substring(0, 50) + ((cardToPrint.prompt || '').length > 50 ? '...' : ''),
        paper_size: selectedPaperSize,
        is_front_back_only: formData.isFrontBackOnly,
        copies: 1,
        color_mode: 'color',
        quality: 'high'
      };

      if (printOption === 'email') {
        // Send PDF to email
        const emailData = {
          ...cardData,
          user_email: formData.userEmail.trim(),
          send_pdf: true
        };

        const response = await fetch('/api/send-pdf-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailData),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        if (result.status === 'success') {
          toast.success(`📧 PDF sent to ${formData.userEmail}! Check your inbox.`);
        } else {
          throw new Error(result.error || 'Failed to send PDF');
        }
      } else {
        // Physical printing
        const response = await fetch('/api/print-queue', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cardData),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        
        if (result.status === 'queued') {
          toast.success(`🖨️ Your card is now printing! You can pick it up shortly.`);
          
          // Poll for job status (simplified version)
          setTimeout(async () => {
            try {
              const statusResponse = await fetch(`/api/print-status/${result.job_id}`);
              if (statusResponse.ok) {
                const statusResult = await statusResponse.json();
                if (statusResult.status === 'found') {
                  if (statusResult.job.status === 'completed') {
                    toast.success("✅ Your card has been added to the print queue and should be available for pickup shortly.");
                  } else if (statusResult.job.status === 'failed') {
                    toast.error("❌ There was an issue with printing. Please try again or contact us for help.");
                  }
                }
              }
            } catch (error) {
              console.log("Could not check print status:", error);
            }
          }, 10000);
          
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      }
    } catch (error) {
      console.error('Print/Email error:', error);
      toast.error(printOption === 'email' ? "Failed to send PDF email" : "Failed to queue print job");
    }
  };

  return (
    <div className="space-y-6">
      {/* Selected Draft Preview */}
      {selectedDraft && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Selected Design
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <img 
                  src={selectedDraft.frontCover} 
                  alt="Selected draft" 
                  className="w-24 h-36 object-cover rounded-lg border shadow-sm"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Creating complete high-quality version with:
                </p>
                <ul className="text-sm space-y-1">
                  <li>✓ High-resolution front cover</li>
                  <li>✓ Personalized back cover</li>
                  {!formData.isFrontBackOnly && (
                    <>
                      <li>✓ Interior left page</li>
                      <li>✓ Interior right page</li>
                    </>
                  )}
                  <li>✓ Print-ready quality</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generation Progress */}
      {isGeneratingFinalCard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-600" />
              Generating Your Complete Card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Progress</span>
                <span className="font-medium">{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            {/* Status Message */}
            {generationProgress && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-center text-blue-800 dark:text-blue-200 font-medium">
                  {generationProgress}
                </p>
              </div>
            )}

            {/* Elapsed Time */}
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>Elapsed: {formatGenerationTime(currentElapsedTime)}</span>
            </div>

            {/* Generation Tips */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                💡 While you wait:
              </h4>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>• High-quality generation typically takes 1-3 minutes</li>
                <li>• You can safely leave this page during generation</li>
                <li>• Your card will be ready when you return</li>
                <li>• We'll send email updates to {formData.userEmail}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion State */}
      {isCardCompleted && generatedCard && (
        <div className="space-y-6">
          <Card className="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2 text-green-800 dark:text-green-200">
                <CheckCircle className="w-6 h-6" />
                Your Card is Ready!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-green-700 dark:text-green-300">
                  🎉 Your complete high-quality card has been generated successfully!
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Full Card Preview with all functionality */}
          <CardPreview 
            card={generatedCard}
            isFrontBackOnly={formData.isFrontBackOnly}
            isCardCompleted={true}
            onPrint={handlePrintClick}
            paperConfig={paperSizes.find(size => size.id === selectedPaperSize) || paperSizes[0]}
            selectedPaperSize={selectedPaperSize}
            onPaperSizeChange={setSelectedPaperSize}
            paperSizes={paperSizes}
          />
        </div>
      )}

      {/* Error State */}
      {!isGeneratingFinalCard && !isCardCompleted && !generatedCard && selectedDraftIndex >= 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Clock className="w-5 h-5" />
              Ready to Generate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-4">
              <p className="text-amber-700 dark:text-amber-300">
                Final card generation will start automatically...
              </p>
              <Button 
                onClick={() => onGenerateFinalCard(selectedDraftIndex)}
                className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                size="lg"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Start Final Generation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print Confirmation Dialog */}
      <Dialog open={showPrintConfirmation} onOpenChange={setShowPrintConfirmation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Print Your Card
            </DialogTitle>
            <DialogDescription>
              Choose how you'd like to print your greeting card.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Print Options */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Print Options</h4>
              
              {/* Physical Print Option */}
              <div 
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  printOption === 'physical'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setPrintOption('physical')}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={printOption === 'physical'}
                    onChange={() => setPrintOption('physical')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Printer className="w-4 h-4 text-blue-600" />
                      <span className="font-medium">Physical Print</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Print directly to our office printer. Pick up your card shortly.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Email PDF Option */}
              <div 
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  printOption === 'email'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setPrintOption('email')}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={printOption === 'email'}
                    onChange={() => setPrintOption('email')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-green-600" />
                      <span className="font-medium">Email PDF</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Get a PDF version sent to your email for printing at home.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Physical Print Settings */}
            {printOption === 'physical' && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Print Settings</h4>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
                    Paper Size
                  </label>
                  <Select value={selectedPaperSize} onValueChange={setSelectedPaperSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paperSizes.map((size) => (
                        <SelectItem key={size.id} value={size.id}>
                          <div className="text-left">
                            <div className="font-medium">{size.label}</div>
                            <div className="text-xs text-muted-foreground">{size.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Email Address Display */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input
                value={formData.userEmail || ""}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
              {printOption === 'email' && (
                <p className="text-xs text-gray-500">
                  PDF will be sent to this email address
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPrintConfirmation(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmPrint}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              >
                {printOption === 'email' ? (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send PDF
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Card
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 