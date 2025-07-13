"use client";

import React, { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Image, Upload, X, Wand2, Users } from "lucide-react";
import { PhotoReference } from "@/hooks/cardStudio/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { imageCompression } from "@/lib/imageCompression";

interface Step4Props {
  formData: any;
  updateFormData: (updates: any) => void;
  onStepComplete?: () => void;
  handleFileUpload?: (file: File, type: 'handwriting' | 'reference') => Promise<void>;
  handleRemoveReferenceImage?: (index: number) => void;
  isUploading?: boolean;
  photoReferences?: PhotoReference[];
  updatePhotoDescription?: (index: number, description: string) => void;
  referenceImageUrlsFromStudio?: string[];
}

export default function Step4Photos({ 
  formData,
  updateFormData,
  onStepComplete,
  handleFileUpload: externalHandleFileUpload,
  handleRemoveReferenceImage: externalHandleRemoveReferenceImage,
  isUploading,
  photoReferences = [],
  updatePhotoDescription,
  referenceImageUrlsFromStudio = []
}: Step4Props) {
  
  React.useEffect(() => {
    // This step is always complete since photos are optional
    onStepComplete?.();
  }, [onStepComplete]);

  // Use URLs from cardStudio if available, fallback to formData
  const displayUrls = referenceImageUrlsFromStudio.length > 0 
    ? referenceImageUrlsFromStudio 
    : formData.referenceImageUrls || [];

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !externalHandleFileUpload) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        continue;
      }

      try {
        let fileToUpload = file;
        
        // Check file size (10MB limit)
        const tenMB = 10 * 1024 * 1024;
        if (file.size > tenMB) {
          toast.info('Large image detected. Compressing...');
          
          try {
            const compressedFile = await imageCompression(file, {
              maxSizeMB: 10,
              maxWidthOrHeight: 2048,
              useWebWorker: true
            });
            
            // Create a new File object with the original name
            fileToUpload = new File([compressedFile], file.name, {
              type: compressedFile.type
            });
            
            const compressionRatio = ((file.size - fileToUpload.size) / file.size * 100).toFixed(1);
            toast.success(`Image compressed by ${compressionRatio}%`);
          } catch (compressionError) {
            console.error('Compression failed:', compressionError);
            toast.error('Failed to compress image. Please try a smaller file.');
            continue;
          }
        }

        await externalHandleFileUpload(fileToUpload, 'reference');
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload image');
      }
    }
    
    // Reset input
    e.target.value = '';
  }, [externalHandleFileUpload]);

  const handleRemove = (index: number) => {
    if (externalHandleRemoveReferenceImage) {
      externalHandleRemoveReferenceImage(index);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Add Reference Photos
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Upload photos to create custom cartoon characters
        </p>
      </div>

      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 sm:p-6 border border-indigo-200 dark:border-indigo-800">
        <div className="flex items-start gap-3">
          <Wand2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
                Transform Photos into Art! ✨
              </h4>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                Upload photos of people, and we'll create adorable cartoon versions for your card
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs text-indigo-600 dark:text-indigo-400">
              <div className="flex items-center gap-1">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Automatic cartoon style
              </div>
              <div className="flex items-center gap-1">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Multiple people OK
              </div>
              <div className="flex items-center gap-1">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Preserves characteristics
              </div>
              <div className="flex items-center gap-1">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Files over 10MB auto-compressed
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Upload Button */}
      <div className="flex justify-center">
        <label className="relative">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            disabled={isUploading || displayUrls.length >= 5}
          />
          <Button
            type="button"
            variant="default"
            size="lg"
            disabled={isUploading || displayUrls.length >= 5}
            className="cursor-pointer gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Upload Photos
              </>
            )}
          </Button>
        </label>
      </div>
      
      {displayUrls.length >= 5 && (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
          Maximum 5 photos reached
        </p>
      )}
      
      {/* Preview Grid */}
      {displayUrls.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Image className="w-4 h-4" />
            Uploaded Photos ({displayUrls.length}/5)
          </h4>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {displayUrls.map((url, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img
                    src={url}
                    alt={`Reference ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                  disabled={isUploading}
                >
                  <X className="w-4 h-4" />
                </button>
                
                {/* Photo description (if available) */}
                {photoReferences[index] && (
                  <div className="mt-2 space-y-2">
                    {photoReferences[index].people && photoReferences[index].people.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <Users className="w-3 h-3" />
                        <span>{photoReferences[index].people.length} people detected</span>
                      </div>
                    )}
                    
                    {updatePhotoDescription && (
                      <Textarea
                        placeholder="Add description (optional)"
                        value={photoReferences[index].description || ''}
                        onChange={(e) => updatePhotoDescription(index, e.target.value)}
                        className="text-xs min-h-[60px]"
                        rows={2}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>• Photos will be transformed into cartoon-style artwork</p>
            <p>• People in photos will appear on the front of your card</p>
            <p>• For best results, use clear photos with good lighting</p>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
        <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-2">📸 Photo Tips</h4>
        <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
          <li>• Clear, well-lit photos work best</li>
          <li>• Group photos are perfect for family cards</li>
          <li>• We'll cartoonify while keeping key features</li>
          <li>• Skip this step if you don't need custom characters</li>
        </ul>
      </div>
    </div>
  );
}