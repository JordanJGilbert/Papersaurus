"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { BACKEND_API_BASE_URL, PhotoReference } from './constants';

export function useFileHandling() {
  const [handwritingSample, setHandwritingSample] = useState<File | null>(null);
  const [handwritingSampleUrl, setHandwritingSampleUrl] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [imageTransformation, setImageTransformation] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  
  // Simplified photo references with descriptions
  const [photoReferences, setPhotoReferences] = useState<PhotoReference[]>([]);

  // File upload handler
  const handleFileUpload = useCallback(async (file: File, type: 'handwriting' | 'reference') => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${BACKEND_API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      
      const result = await response.json();
      
      if (type === 'handwriting') {
        setHandwritingSample(file);
        setHandwritingSampleUrl(result.url);
        toast.success("Handwriting sample uploaded!");
      } else {
        const newImageIndex = referenceImages.length;
        setReferenceImages(prev => [...prev, file]);
        setReferenceImageUrls(prev => [...prev, result.url]);
        toast.success(`Reference image uploaded! ${referenceImages.length + 1} photo${referenceImages.length + 1 > 1 ? 's' : ''} ready for character creation.`);
        
        // Create a simple photo reference
        const photoRef: PhotoReference = {
          imageUrl: result.url,
          imageIndex: newImageIndex,
          description: '' // User will fill this in via UI
        };
        
        setPhotoReferences(prev => [...prev, photoRef]);
      }
    } catch (error) {
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceImages.length]);

  const handleRemoveReferenceImage = useCallback((index: number) => {
    const removedImage = referenceImages[index];
    const removedUrl = referenceImageUrls[index];
    
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    setReferenceImageUrls(prev => prev.filter((_, i) => i !== index));
    
    // Also remove associated photo reference
    setPhotoReferences(prev => prev.filter((_, i) => i !== index));
    
    console.log("🔍 DEBUG: Reference image removed:", {
      fileName: removedImage?.name,
      url: removedUrl,
      remainingImages: referenceImages.length - 1
    });
    
    toast.success(`Reference image removed! ${referenceImages.length - 1} photo${referenceImages.length - 1 !== 1 ? 's' : ''} remaining.`);
  }, [referenceImages, referenceImageUrls]);

  // Update photo description
  const updatePhotoDescription = useCallback((index: number, description: string) => {
    setPhotoReferences(prev => {
      const newRefs = [...prev];
      if (newRefs[index]) {
        newRefs[index] = { ...newRefs[index], description };
      }
      return newRefs;
    });
  }, []);

  return {
    handwritingSample,
    setHandwritingSample,
    handwritingSampleUrl,
    setHandwritingSampleUrl,
    referenceImages,
    setReferenceImages,
    referenceImageUrls,
    setReferenceImageUrls,
    imageTransformation,
    setImageTransformation,
    isUploading,
    setIsUploading,
    handleFileUpload,
    handleRemoveReferenceImage,
    // Simplified photo references
    photoReferences,
    setPhotoReferences,
    updatePhotoDescription
  };
}