"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CardFormData } from "@/hooks/useCardForm";
import { 
  Wrench, Cake, ThumbsUp, Heart, Trophy, TreePine, Stethoscope, 
  CloudRain, GraduationCap, Baby, Church, Gift, Home, MessageCircle, Eye,
  Image, Sparkles, Upload, X, Wand2
} from "lucide-react";
import TemplateGallery from "../TemplateGallery";
import { useCardCache } from "@/hooks/useCardCache";
import PhotoAnalysisModal from "../PhotoAnalysisModal";
import { PhotoAnalysis } from "@/hooks/cardStudio/constants";
import { toast } from "sonner";

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

interface Step1Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  onTemplateSelect?: (template: GeneratedCard) => void;
  // Photo upload props (moved from Step3)
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
  // Direct URLs from cardStudio for immediate access
  referenceImageUrlsFromStudio?: string[];
}

// Card types with icons
const cardTypes = [
  { id: "custom", label: "Custom", description: "Create your own", icon: Wrench, emoji: "✨", color: "from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800" },
  { id: "birthday", label: "Birthday", description: "Celebrate another year of life", icon: Cake, emoji: "🎂", color: "from-pink-100 to-pink-200 dark:from-pink-900 dark:to-pink-800" },
  { id: "thank-you", label: "Thank You", description: "Express gratitude", icon: ThumbsUp, emoji: "🙏", color: "from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800" },
  { id: "anniversary", label: "Anniversary", description: "Commemorate special milestones", icon: Heart, emoji: "💑", color: "from-red-100 to-red-200 dark:from-red-900 dark:to-red-800" },
  { id: "congratulations", label: "Congratulations", description: "Celebrate achievements", icon: Trophy, emoji: "🎉", color: "from-yellow-100 to-yellow-200 dark:from-yellow-900 dark:to-yellow-800" },
  { id: "holiday", label: "Holiday", description: "Seasonal and holiday greetings", icon: TreePine, emoji: "🎄", color: "from-green-100 to-green-200 dark:from-green-900 dark:to-green-800" },
  { id: "get-well", label: "Get Well Soon", description: "Send healing wishes", icon: Stethoscope, emoji: "💐", color: "from-teal-100 to-teal-200 dark:from-teal-900 dark:to-teal-800" },
  { id: "sympathy", label: "Sympathy", description: "Offer comfort", icon: CloudRain, emoji: "🕊️", color: "from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700" },
  { id: "love", label: "Love & Romance", description: "Express romantic feelings", icon: Heart, emoji: "💕", color: "from-rose-100 to-rose-200 dark:from-rose-900 dark:to-rose-800" },
  { id: "graduation", label: "Graduation", description: "Academic achievements", icon: GraduationCap, emoji: "🎓", color: "from-indigo-100 to-indigo-200 dark:from-indigo-900 dark:to-indigo-800" },
  { id: "new-baby", label: "New Baby", description: "Welcome new arrivals", icon: Baby, emoji: "👶", color: "from-cyan-100 to-cyan-200 dark:from-cyan-900 dark:to-cyan-800" },
  { id: "wedding", label: "Wedding", description: "Celebrate unions and marriages", icon: Church, emoji: "💒", color: "from-violet-100 to-violet-200 dark:from-violet-900 dark:to-violet-800" },
  { id: "retirement", label: "Retirement", description: "Honor career achievements", icon: Gift, emoji: "🎁", color: "from-amber-100 to-amber-200 dark:from-amber-900 dark:to-amber-800" },
  { id: "housewarming", label: "Housewarming", description: "Welcome to new homes", icon: Home, emoji: "🏡", color: "from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800" },
  { id: "apology", label: "Apology", description: "Make amends", icon: MessageCircle, emoji: "🙏", color: "from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800" },
  { id: "thinking-of-you", label: "Thinking of You", description: "Show you care and remember", icon: Eye, emoji: "💭", color: "from-sky-100 to-sky-200 dark:from-sky-900 dark:to-sky-800" },
];

// Card tone/style options
const cardTones = [
  { id: "funny", label: "😄 Funny", description: "Humorous and lighthearted", color: "from-yellow-100 to-orange-100 dark:from-yellow-900 dark:to-orange-900" },
  { id: "genz-humor", label: "💀 GenZ Humor", description: "Memes and chaotic vibes", color: "from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900" },
  { id: "romantic", label: "💕 Romantic", description: "Sweet and loving", color: "from-pink-100 to-rose-100 dark:from-pink-900 dark:to-rose-900" },
  { id: "professional", label: "👔 Professional", description: "Formal and business-ready", color: "from-slate-100 to-gray-100 dark:from-slate-900 dark:to-gray-900" },
  { id: "heartfelt", label: "❤️ Heartfelt", description: "Sincere and emotional", color: "from-red-100 to-pink-100 dark:from-red-900 dark:to-pink-900" },
  { id: "playful", label: "🎉 Playful", description: "Fun and energetic", color: "from-cyan-100 to-blue-100 dark:from-cyan-900 dark:to-blue-900" },
  { id: "elegant", label: "✨ Elegant", description: "Sophisticated and refined", color: "from-violet-100 to-indigo-100 dark:from-violet-900 dark:to-indigo-900" },
  { id: "casual", label: "😊 Casual", description: "Relaxed and friendly", color: "from-green-100 to-teal-100 dark:from-green-900 dark:to-teal-900" },
  { id: "inspirational", label: "🌟 Inspirational", description: "Motivating and uplifting", color: "from-amber-100 to-yellow-100 dark:from-amber-900 dark:to-yellow-900" },
  { id: "quirky", label: "🤪 Quirky", description: "Unique and unconventional", color: "from-lime-100 to-emerald-100 dark:from-lime-900 dark:to-emerald-900" },
  { id: "traditional", label: "🎭 Traditional", description: "Classic and timeless", color: "from-stone-100 to-amber-100 dark:from-stone-900 dark:to-amber-900" },
];

export default function Step1CardBasics({ 
  formData, 
  updateFormData, 
  onStepComplete, 
  onTemplateSelect,
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
  setShowAnalysisModal,
  referenceImageUrlsFromStudio = []
}: Step1Props) {
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<any>(null);
  const { preloadAllCards } = useCardCache();
  
  // Preload template cache when component mounts
  useEffect(() => {
    preloadAllCards();
  }, []);

  React.useEffect(() => {
    // Auto-complete step when all required fields are filled
    if (formData.selectedType && formData.selectedTone && 
        (formData.selectedType !== "custom" || formData.customCardType.trim())) {
      onStepComplete?.();
    }
  }, [formData.selectedType, formData.selectedTone, formData.customCardType, onStepComplete]);

  const handleTemplateSelect = (template: GeneratedCard) => {
    onTemplateSelect?.(template);
    setShowTemplateGallery(false);
  };

  // Compress image if needed
  const compressImage = async (file: File, maxSizeMB: number = 10): Promise<File> => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    // If file is already small enough, return as-is
    if (file.size <= maxSizeBytes) {
      return file;
    }
    
    // Create a canvas to resize the image
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Calculate new dimensions (max 2048px on longest side)
          let { width, height } = img;
          const maxDimension = 2048;
          
          if (width > height && width > maxDimension) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Convert to blob with compression
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            0.85 // 85% quality
          );
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Photo upload handlers (moved from Step3)
  const handleFileUploadLocal = async (file: File) => {
    if (!externalHandleFileUpload) {
      toast.error("File upload not available");
      return;
    }
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid image file (JPG, PNG, GIF, or WebP)");
      return;
    }
    
    try {
      // Auto-compress if needed
      const maxSize = 10 * 1024 * 1024; // 10MB
      let fileToUpload = file;
      
      if (file.size > maxSize) {
        toast.info("Compressing large image...");
        fileToUpload = await compressImage(file, 10);
        toast.success(`Image compressed from ${(file.size / 1024 / 1024).toFixed(1)}MB to ${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB`);
      }
      
      await externalHandleFileUpload(fileToUpload, 'reference');
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file");
    }
  };

  const handleRemoveImage = (index: number) => {
    if (externalHandleRemoveReferenceImage) {
      externalHandleRemoveReferenceImage(index);
    }
  };

  // Trigger photo analysis when modal opens
  React.useEffect(() => {
    if (showAnalysisModal && pendingAnalysisIndex !== null && analyzePhoto) {
      const imageUrls = referenceImageUrlsFromStudio.length > 0 ? referenceImageUrlsFromStudio : formData.referenceImageUrls;
      const imageUrl = imageUrls[pendingAnalysisIndex];
      if (imageUrl && !analysisResult) {
        setAnalysisResult(null);
        analyzePhoto(imageUrl, pendingAnalysisIndex).then(result => {
          setAnalysisResult(result);
        }).catch(error => {
          console.error("Error analyzing photo:", error);
          toast.error("Failed to analyze photo");
        });
      }
    }
  }, [showAnalysisModal, pendingAnalysisIndex, analyzePhoto, formData.referenceImageUrls, referenceImageUrlsFromStudio, analysisResult]);

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* Template Gallery Option - Temporarily Hidden */}
      {/* TODO: Re-enable when AI-powered template extraction is implemented
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 sm:p-6 border border-purple-200 dark:border-purple-800">
        ... template content ...
      </div>
      */}

      {/* Card Type Selection */}
      <div className="space-y-3 sm:space-y-4 w-full">
        <label className="text-base font-semibold text-gray-800 dark:text-gray-200 px-1">
          Card Type
        </label>
        <Select 
          value={formData.selectedType} 
          onValueChange={(value) => updateFormData({ selectedType: value })}
        >
          <SelectTrigger className="w-full h-12 sm:h-14 border-2 hover:border-blue-300 dark:hover:border-blue-700 transition-colors touch-manipulation text-base [&>span]:!line-clamp-none">
            <SelectValue>
              {(() => {
                const selected = cardTypes.find((type) => type.id === formData.selectedType);
                if (!selected) return <span className="text-gray-400">Choose card type</span>;
                const IconComponent = selected.icon;
                return (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br ${selected.color} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                      <span className="text-sm sm:text-lg">{selected.emoji}</span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm sm:text-base">{selected.label}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px] w-full" position="popper" sideOffset={5}>
            {cardTypes.map((type) => {
              const IconComponent = type.icon;
              return (
                <SelectItem key={type.id} value={type.id} className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  <div className="flex items-center gap-3 py-1">
                    <div className={`w-10 h-10 bg-gradient-to-br ${type.color} rounded-lg flex items-center justify-center shadow-sm`}>
                      <span className="text-xl">{type.emoji}</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{type.label}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{type.description}</div>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        
        {/* Custom Card Type Input */}
        {formData.selectedType === "custom" && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 animate-in slide-in-from-top-2 duration-300">
            <label className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-3 block flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Describe Your Custom Card Type
            </label>
            <Input
              placeholder="✨ E.g., 'Promotion at work', 'Moving away', 'First day of school'"
              value={formData.customCardType}
              onChange={(e) => updateFormData({ customCardType: e.target.value })}
              className="h-12 border-2 border-purple-300 dark:border-purple-700 focus:border-purple-500 dark:focus:border-purple-500 touch-manipulation"
              style={{ fontSize: '16px' }}
            />
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
              What type of card is this? This helps personalize the message and style.
            </p>
          </div>
        )}
      </div>

      {/* Card Tone */}
      <div className="space-y-3 sm:space-y-4 w-full">
        <label className="text-base font-semibold text-gray-800 dark:text-gray-200 px-1">
          Card Tone & Style
        </label>
        <Select 
          value={formData.selectedTone} 
          onValueChange={(value) => updateFormData({ selectedTone: value })}
        >
          <SelectTrigger className="w-full h-12 sm:h-14 border-2 hover:border-purple-300 dark:hover:border-purple-700 transition-colors touch-manipulation text-base [&>span]:!line-clamp-none">
            <SelectValue>
              {(() => {
                const selected = cardTones.find((tone) => tone.id === formData.selectedTone);
                if (!selected) return <span className="text-gray-400">Choose card tone</span>;
                return (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br ${selected.color} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                      <span className="text-sm sm:text-base">{selected.label.split(' ')[0]}</span>
                    </div>
                    <span className="font-medium text-sm sm:text-base">{selected.label.split(' ').slice(1).join(' ')}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px] w-full" position="popper" sideOffset={5}>
            {cardTones.map((tone) => (
              <SelectItem key={tone.id} value={tone.id} className="cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20">
                <div className="flex items-center gap-3 py-1">
                  <div className={`w-10 h-10 bg-gradient-to-br ${tone.color} rounded-lg flex items-center justify-center shadow-sm`}>
                    <span className="text-xl">{tone.label.split(' ')[0]}</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{tone.label.split(' ').slice(1).join(' ')}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{tone.description}</div>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* To/From Fields */}
      <div className="space-y-3 sm:space-y-4 w-full">
        <label className="text-base font-semibold text-gray-800 dark:text-gray-200 px-1">
          Personalization (Optional)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              To (Optional)
            </label>
            <Input
              placeholder="🎯 To"
              value={formData.toField}
              onChange={(e) => updateFormData({ toField: e.target.value })}
              className="h-12 sm:h-14 touch-manipulation border-2 hover:border-green-300 dark:hover:border-green-700 transition-colors text-base"
              style={{ fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              From (Optional)
            </label>
            <Input
              placeholder="📝 From"
              value={formData.fromField}
              onChange={(e) => updateFormData({ fromField: e.target.value })}
              className="h-12 sm:h-14 touch-manipulation border-2 hover:border-green-300 dark:hover:border-green-700 transition-colors text-base"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </div>

      {/* Reference Photos (moved from Step 3) */}
      <div className="space-y-3 sm:space-y-4 w-full">
        <label className="text-base font-semibold text-gray-800 dark:text-gray-200 px-1">
          Reference Photos (Optional)
        </label>
        
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 sm:p-6 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-start gap-3">
            <Wand2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-indigo-900 dark:text-indigo-100 mb-2">
                Upload photos to create cartoon characters!
              </h4>
              <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-4">
                Add photos of people to include them as personalized cartoon characters in your card
              </p>
              
              {/* Upload Area */}
              {(referenceImageUrlsFromStudio.length === 0 && formData.referenceImageUrls.length === 0) ? (
                <div className="border-2 border-dashed border-indigo-300 dark:border-indigo-600 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleFileUploadLocal(e.target.files[0])}
                    disabled={isUploading}
                    className="hidden"
                    id="reference-upload"
                  />
                  <label htmlFor="reference-upload" className={`cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Upload className={`w-8 h-8 mx-auto mb-2 text-indigo-400 ${isUploading ? 'animate-pulse' : ''}`} />
                    <div className="text-base font-medium text-indigo-600 dark:text-indigo-400">
                      {isUploading ? "Uploading..." : "Tap to upload photo"}
                    </div>
                    <div className="text-xs text-indigo-500 dark:text-indigo-300 mt-1">
                      JPG, PNG up to 10MB
                    </div>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Display uploaded images */}
                  <div className="grid grid-cols-2 gap-3">
                    {(referenceImageUrlsFromStudio.length > 0 ? referenceImageUrlsFromStudio : formData.referenceImageUrls).map((url, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={url}
                          alt={`Reference ${index + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border-2 border-indigo-200 dark:border-indigo-700"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveImage(index)}
                          className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  
                  {/* Add more photos button */}
                  {formData.referenceImageUrls.length < 4 && (
                    <div className="mt-3">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleFileUploadLocal(e.target.files[0])}
                        disabled={isUploading}
                        className="hidden"
                        id="reference-upload-more"
                      />
                      <label htmlFor="reference-upload-more">
                        <Button variant="outline" size="sm" disabled={isUploading} asChild>
                          <span className="cursor-pointer">
                            <Upload className="w-4 h-4 mr-2" />
                            Add another photo
                          </span>
                        </Button>
                      </label>
                    </div>
                  )}
                  
                  {/* Transformation Instructions */}
                  <div className="mt-4">
                    <label className="text-sm font-medium text-indigo-800 dark:text-indigo-200 mb-2 block">
                      Character Style Instructions (Optional)
                    </label>
                    <Textarea
                      placeholder="e.g., 'Make us look like anime characters', 'Keep our exact outfits but in watercolor style'"
                      value={formData.imageTransformation}
                      onChange={(e) => updateFormData({ imageTransformation: e.target.value })}
                      rows={2}
                      className="resize-none text-sm"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Tips - Mobile Optimized */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">💡 Tips</h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Pick your card type and tone</li>
          <li>• To/From fields help personalize</li>
          <li>• All fields are optional</li>
        </ul>
      </div>

      {/* Template Gallery Modal - Temporarily Hidden */}
      {/* TODO: Re-enable when AI-powered template extraction is implemented
      <TemplateGallery
        formData={formData}
        updateFormData={updateFormData}
        onTemplateSelect={handleTemplateSelect}
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
      />
      */}

      {/* Photo Analysis Modal (moved from Step3) */}
      {showAnalysisModal && pendingAnalysisIndex !== null && (
        <PhotoAnalysisModal
          isOpen={showAnalysisModal}
          onClose={() => {
            setShowAnalysisModal?.(false);
            setAnalysisResult(null);
          }}
          imageUrl={(referenceImageUrlsFromStudio.length > 0 ? referenceImageUrlsFromStudio : formData.referenceImageUrls)[pendingAnalysisIndex]}
          imageIndex={pendingAnalysisIndex}
          isAnalyzing={isAnalyzing || false}
          analysisResult={analysisResult}
          onSave={(analysis) => {
            savePhotoAnalysis?.(analysis);
            setAnalysisResult(null);
            setShowAnalysisModal?.(false);
          }}
          onSkip={() => {
            skipPhotoAnalysis?.();
            setAnalysisResult(null);
            setShowAnalysisModal?.(false);
          }}
          toField={formData.toField}
          fromField={formData.fromField}
        />
      )}
    </div>
  );
} 