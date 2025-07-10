"use client";

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, X, Wand2 } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { toast } from "sonner";
import PhotoAnalysisModal from "../PhotoAnalysisModal";
import { PhotoAnalysis } from "@/hooks/cardStudio/constants";

interface Step3Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  handleFileUpload?: (file: File, type: 'handwriting' | 'reference') => Promise<void>;
  handleRemoveReferenceImage?: (index: number) => void;
  isUploading?: boolean;
  // Photo analysis props
  photoAnalyses?: PhotoAnalysis[];
  isAnalyzing?: boolean;
  showAnalysisModal?: boolean;
  pendingAnalysisIndex?: number | null;
  analyzePhoto?: (imageUrl: string, imageIndex: number) => Promise<any>;
  savePhotoAnalysis?: (analysis: PhotoAnalysis) => void;
  skipPhotoAnalysis?: () => void;
  setShowAnalysisModal?: (show: boolean) => void;
}

// Curated artistic styles
const artisticStyles = [
  {
    id: "ai-smart-style", 
    label: "✨ Smart Style", 
    description: "Let our experts choose the perfect style for your card",
    color: "from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900",
    preview: "✨"
  },
  {
    id: "custom", 
    label: "✨ Custom Style", 
    description: "Define your own unique artistic style",
    color: "from-violet-100 to-purple-100 dark:from-violet-900 dark:to-purple-900",
    preview: "🎯"
  },
  { 
    id: "watercolor", 
    label: "🎨 Watercolor", 
    description: "Soft, flowing paint effects (our personal favorite)",
    color: "from-blue-100 to-cyan-100 dark:from-blue-900 dark:to-cyan-900",
    preview: "🎨"
  },
  {
    id: "minimalist", 
    label: "✨ Minimalist", 
    description: "Clean, simple, elegant design",
    color: "from-gray-100 to-slate-100 dark:from-gray-900 dark:to-slate-900",
    preview: "◯"
  },
  { 
    id: "botanical", 
    label: "🌿 Botanical", 
    description: "Beautiful flowers and nature elements",
    color: "from-green-100 to-emerald-100 dark:from-green-900 dark:to-emerald-900",
    preview: "🌿"
  },
  { 
    id: "comic-book", 
    label: "💥 Comic Book", 
    description: "Bold graphic novel style",
    color: "from-yellow-100 to-red-100 dark:from-yellow-900 dark:to-red-900",
    preview: "💥"
  },
  { 
    id: "dreamy-fantasy", 
    label: "🌸 Dreamy Fantasy", 
    description: "Enchanting anime-inspired art",
    color: "from-pink-100 to-purple-100 dark:from-pink-900 dark:to-purple-900",
    preview: "🌸"
  },
  {
    id: "modern-geometric", 
    label: "🔷 Modern Geometric", 
    description: "Clean contemporary shapes",
    color: "from-indigo-100 to-blue-100 dark:from-indigo-900 dark:to-blue-900",
    preview: "🔷"
  },
];

export default function Step3Personalization({ 
  formData, 
  updateFormData, 
  onStepComplete, 
  handleFileUpload: externalHandleFileUpload,
  handleRemoveReferenceImage: externalHandleRemoveReferenceImage,
  isUploading = false,
  photoAnalyses = [],
  isAnalyzing = false,
  showAnalysisModal = false,
  pendingAnalysisIndex = null,
  analyzePhoto,
  savePhotoAnalysis,
  skipPhotoAnalysis,
  setShowAnalysisModal
}: Step3Props) {
  const [analysisResult, setAnalysisResult] = React.useState<any>(null);

  // Handle analysis when modal should open
  React.useEffect(() => {
    const performAnalysis = async () => {
      if (showAnalysisModal && pendingAnalysisIndex !== null && analyzePhoto) {
        const imageUrl = formData.referenceImageUrls[pendingAnalysisIndex];
        if (imageUrl) {
          const result = await analyzePhoto(imageUrl, pendingAnalysisIndex);
          setAnalysisResult(result);
        }
      }
    };
    performAnalysis();
  }, [showAnalysisModal, pendingAnalysisIndex, analyzePhoto, formData.referenceImageUrls]);
  React.useEffect(() => {
    // Auto-complete step when style is selected and valid
    const isValid = formData.selectedArtisticStyle && 
      (formData.selectedArtisticStyle !== "custom" || formData.customStyleDescription.trim()) &&
      (formData.referenceImageUrls.length === 0 || formData.selectedImageModel === "gpt-image-1");
    
    if (isValid) {
      onStepComplete?.();
    }
  }, [formData.selectedArtisticStyle, formData.customStyleDescription, formData.referenceImageUrls, formData.selectedImageModel, onStepComplete]);

  const handleFileUploadLocal = async (file: File) => {
    // Always use external handler if available
    if (externalHandleFileUpload) {
      await externalHandleFileUpload(file, 'reference');
      return;
    }

    // Fallback error if no handler is provided
    toast.error("File upload handler not available");
  };

  const handleRemoveImage = (index: number) => {
    // Use external handler if available, otherwise use local implementation
    if (externalHandleRemoveReferenceImage) {
      externalHandleRemoveReferenceImage(index);
      return;
    }

    // Local implementation
    const newImages = formData.referenceImages.filter((_, i) => i !== index);
    const newUrls = formData.referenceImageUrls.filter((_, i) => i !== index);
    updateFormData({ 
      referenceImages: newImages,
      referenceImageUrls: newUrls
    });
  };

  return (
    <div className="space-y-6">
      {/* Artistic Style Selection */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
          Artistic Style
        </label>
        <Select 
          value={formData.selectedArtisticStyle} 
          onValueChange={(value) => updateFormData({ selectedArtisticStyle: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose artistic style">
              {(() => {
                const selected = artisticStyles.find((style) => style.id === formData.selectedArtisticStyle);
                if (!selected) return <span className="text-gray-400">Choose artistic style</span>;
                return (
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 bg-gradient-to-br ${selected.color} rounded-lg flex items-center justify-center shadow-sm`}>
                      <span className="text-lg">{selected.preview}</span>
                    </div>
                    <span className="font-medium">{selected.label}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {artisticStyles.map((style) => (
              <SelectItem key={style.id} value={style.id} className="cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20">
                <div className="flex items-center gap-3 py-1">
                  <div className={`w-10 h-10 bg-gradient-to-br ${style.color} rounded-lg flex items-center justify-center shadow-sm`}>
                    <span className="text-xl">{style.preview}</span>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{style.label}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{style.description}</div>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Custom Style Description */}
        {formData.selectedArtisticStyle === "custom" && (
          <div className="mt-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Describe Your Custom Style
            </label>
            <Textarea
              placeholder="e.g., in vintage 1920s art deco style with gold accents and geometric patterns..."
              value={formData.customStyleDescription}
              onChange={(e) => updateFormData({ customStyleDescription: e.target.value })}
              rows={3}
              className="resize-none"
              style={{ fontSize: '16px' }}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Describe the artistic style you want for your card (colors, techniques, era, mood, etc.)
            </p>
          </div>
        )}
      </div>

      {/* Reference Photos */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
          Reference Photos (Optional)
        </label>
        
        {formData.selectedImageModel !== "gpt-image-1" && formData.referenceImageUrls.length === 0 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Reference photos are only available with GPT Image 1 model. You can enable this in the Details step.
            </p>
          </div>
        )}

        {formData.selectedImageModel === "gpt-image-1" && (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Upload photos to create cartoon characters!
            </p>
            
            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFileUploadLocal(e.target.files[0])}
                disabled={isUploading}
                className="hidden"
                id="reference-upload"
              />
              <label htmlFor="reference-upload" className={`cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Wand2 className={`w-6 h-6 mx-auto mb-2 text-gray-400 ${isUploading ? 'animate-spin' : ''}`} />
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {isUploading ? "Uploading..." : "Upload reference photo"}
                </div>
              </label>
            </div>
          </>
        )}

        {/* Display uploaded images */}
        {formData.referenceImageUrls.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formData.referenceImageUrls.length} photo{formData.referenceImageUrls.length > 1 ? 's' : ''} uploaded:
            </div>
            <div className="grid grid-cols-2 gap-2">
              {formData.referenceImageUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Reference ${index + 1}`}
                    className="w-full aspect-square object-cover rounded border"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
            
            {/* Transformation Instructions */}
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Character Style Instructions (Optional)
              </label>
              <Textarea
                placeholder="e.g., 'Make us look like anime characters', 'Keep our exact outfits but in watercolor style'"
                value={formData.imageTransformation}
                onChange={(e) => updateFormData({ imageTransformation: e.target.value })}
                rows={3}
                className="resize-none"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tips - Mobile Optimized */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
        <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">🎨 Tips</h4>
        <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
          <li>• Smart Style picks best style</li>
          <li>• Photos create cartoon versions</li>
          <li>• All options are optional</li>
        </ul>
      </div>

      {/* Photo Analysis Modal */}
      {showAnalysisModal && pendingAnalysisIndex !== null && analyzePhoto && savePhotoAnalysis && skipPhotoAnalysis && setShowAnalysisModal && (
        <PhotoAnalysisModal
          isOpen={showAnalysisModal}
          onClose={() => setShowAnalysisModal(false)}
          imageUrl={formData.referenceImageUrls[pendingAnalysisIndex]}
          imageIndex={pendingAnalysisIndex}
          isAnalyzing={isAnalyzing}
          analysisResult={analysisResult}
          onSave={savePhotoAnalysis}
          onSkip={skipPhotoAnalysis}
          toField={formData.toField}
          fromField={formData.fromField}
        />
      )}
    </div>
  );
} 