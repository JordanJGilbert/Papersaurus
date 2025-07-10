"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { BACKEND_API_BASE_URL, PhotoAnalysis, PhotoAnalysisResult, SelectedPerson } from './constants';
import { chatWithAI } from './utils';

export function useFileHandling() {
  const [handwritingSample, setHandwritingSample] = useState<File | null>(null);
  const [handwritingSampleUrl, setHandwritingSampleUrl] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [imageTransformation, setImageTransformation] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  
  // Photo analysis state
  const [photoAnalyses, setPhotoAnalyses] = useState<PhotoAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [pendingAnalysisIndex, setPendingAnalysisIndex] = useState<number | null>(null);

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
        console.log("🔍 DEBUG: Reference image uploaded successfully:", {
          fileName: file.name,
          url: result.url,
          totalImages: referenceImages.length + 1
        });
        toast.success(`Reference image uploaded! ${referenceImages.length + 1} photo${referenceImages.length + 1 > 1 ? 's' : ''} ready for character creation.`);
        
        // Trigger analysis modal for this image
        setPendingAnalysisIndex(newImageIndex);
        setShowAnalysisModal(true);
      }
    } catch (error) {
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }, [referenceImages.length]);

  const handleRemoveReferenceImage = useCallback((index: number) => {
    const removedImage = referenceImages[index];
    const removedUrl = referenceImageUrls[index];
    
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    setReferenceImageUrls(prev => prev.filter((_, i) => i !== index));
    
    // Also remove associated photo analysis
    setPhotoAnalyses(prev => prev.filter((_, i) => i !== index));
    
    console.log("🔍 DEBUG: Reference image removed:", {
      fileName: removedImage?.name,
      url: removedUrl,
      remainingImages: referenceImages.length - 1
    });
    
    toast.success(`Reference image removed! ${referenceImages.length - 1} photo${referenceImages.length - 1 !== 1 ? 's' : ''} remaining.`);
  }, [referenceImages, referenceImageUrls]);

  // Analyze a photo using AI vision
  const analyzePhoto = useCallback(async (imageUrl: string, imageIndex: number): Promise<PhotoAnalysisResult | null> => {
    setIsAnalyzing(true);
    try {
      const analysisPrompt = `Analyze this photo and identify all people visible. For each person:
1. Describe their position in the image (far-left, left, center-left, center, center-right, right, far-right)
2. Provide a brief description of their appearance
3. Estimate their apparent age range (e.g., "20-25", "40s", "elderly")
4. Note their hair color and style
5. Describe their clothing
6. Note any distinguishing features
7. Describe their expression/mood
8. Also note if there are any pets, the background/setting, overall mood, and lighting

Return a detailed JSON response following the schema provided.`;

      const result = await chatWithAI(analysisPrompt, {
        attachments: [imageUrl],
        model: "gemini-2.0-flash-exp",
        jsonSchema: {
          type: "object",
          properties: {
            peopleCount: { type: "number", description: "Total number of people in the photo" },
            people: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique identifier like 'person-1'" },
                  position: { 
                    type: "string", 
                    enum: ["far-left", "left", "center-left", "center", "center-right", "right", "far-right"],
                    description: "Position in the image"
                  },
                  positionDescription: { type: "string", description: "Natural description like 'person on the far left wearing blue'" },
                  description: { type: "string", description: "Overall appearance description" },
                  apparentAge: { type: "string", description: "Age range like '20-25' or '40s'" },
                  gender: { type: "string", description: "Apparent gender if identifiable" },
                  hairColor: { type: "string", description: "Hair color" },
                  hairStyle: { type: "string", description: "Hair style/length" },
                  distinguishingFeatures: { type: "string", description: "Notable features like glasses, beard, etc." },
                  clothing: { type: "string", description: "What they're wearing" },
                  expression: { type: "string", description: "Facial expression/mood" }
                },
                required: ["id", "position", "positionDescription", "description", "apparentAge", "hairColor", "hairStyle", "clothing", "expression"]
              }
            },
            hasPets: { type: "boolean", description: "Whether pets are visible" },
            petDescription: { type: "string", description: "Description of pets if present" },
            backgroundDescription: { type: "string", description: "Description of the background/environment" },
            setting: { type: "string", description: "Type of setting (outdoor park, beach, indoor, etc.)" },
            overallMood: { type: "string", description: "Overall mood/atmosphere of the photo" },
            lighting: { type: "string", description: "Lighting conditions" }
          },
          required: ["peopleCount", "people", "hasPets", "backgroundDescription", "setting", "overallMood", "lighting"]
        }
      });

      console.log("📸 Photo analysis result:", result);
      return result as PhotoAnalysisResult;
    } catch (error) {
      console.error("Failed to analyze photo:", error);
      toast.error("Failed to analyze photo. You can still use it without analysis.");
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Save photo analysis results
  const savePhotoAnalysis = useCallback((analysis: PhotoAnalysis) => {
    setPhotoAnalyses(prev => {
      const newAnalyses = [...prev];
      newAnalyses[analysis.imageIndex] = analysis;
      return newAnalyses;
    });
    setShowAnalysisModal(false);
    setPendingAnalysisIndex(null);
  }, []);

  // Skip photo analysis
  const skipPhotoAnalysis = useCallback(() => {
    if (pendingAnalysisIndex !== null) {
      const skippedAnalysis: PhotoAnalysis = {
        imageUrl: referenceImageUrls[pendingAnalysisIndex],
        imageIndex: pendingAnalysisIndex,
        analysisResult: {
          peopleCount: 0,
          people: [],
          hasPets: false,
          backgroundDescription: "",
          setting: "",
          overallMood: "",
          lighting: ""
        },
        selectedPeople: [],
        includeEveryone: true,
        excludedCount: 0,
        analyzed: false,
        analysisFailed: false
      };
      savePhotoAnalysis(skippedAnalysis);
    }
    setShowAnalysisModal(false);
    setPendingAnalysisIndex(null);
  }, [pendingAnalysisIndex, referenceImageUrls, savePhotoAnalysis]);

  // Get combined analysis for all photos
  const getCombinedPhotoAnalysis = useCallback(() => {
    const analyzedPhotos = photoAnalyses.filter(a => a.analyzed && !a.analysisFailed);
    if (analyzedPhotos.length === 0) return null;

    const allSelectedPeople = analyzedPhotos.flatMap(a => a.selectedPeople);
    const totalPeopleCount = analyzedPhotos.reduce((sum, a) => sum + a.analysisResult.peopleCount, 0);
    const totalSelectedCount = allSelectedPeople.length;
    const totalExcludedCount = totalPeopleCount - totalSelectedCount;

    return {
      analyzedPhotos,
      allSelectedPeople,
      totalPeopleCount,
      totalSelectedCount,
      totalExcludedCount,
      hasMultiplePhotos: analyzedPhotos.length > 1
    };
  }, [photoAnalyses]);

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
    // Photo analysis
    photoAnalyses,
    setPhotoAnalyses,
    isAnalyzing,
    showAnalysisModal,
    setShowAnalysisModal,
    pendingAnalysisIndex,
    setPendingAnalysisIndex,
    analyzePhoto,
    savePhotoAnalysis,
    skipPhotoAnalysis,
    getCombinedPhotoAnalysis
  };
}