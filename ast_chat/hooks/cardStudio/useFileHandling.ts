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
        toast.success(`Reference image uploaded! ${referenceImages.length + 1} photo${referenceImages.length + 1 > 1 ? 's' : ''} ready for character creation.`);
        
        // Store the URL and index for later analysis
        const analysisData = { url: result.url, index: newImageIndex };
        
        // Auto-analyze the photo in the background after state updates
        setTimeout(() => {
          console.log("🤖 Auto-analyzing uploaded photo...");
          analyzePhoto(analysisData.url, analysisData.index).then(analysisResult => {
            if (analysisResult && analysisResult.peopleCount > 0) {
              console.log(`✅ Photo analysis complete: ${analysisResult.peopleCount} people detected`);
              
              // Create default photo analysis with all people included
              const defaultAnalysis: PhotoAnalysis = {
                imageUrl: analysisData.url,
                imageIndex: analysisData.index,
                analysisResult: analysisResult,
                selectedPeople: analysisResult.people.map(person => ({
                  ...person,
                  includeInCard: true,
                  name: '', // No name by default, user can add via "Customize people"
                  relationshipToRecipient: ''
                })),
                includeEveryone: true,
                excludedCount: 0,
                analyzed: true,
                analysisFailed: false
              };
              
              // Save the analysis silently
              setPhotoAnalyses(prev => {
                const newAnalyses = [...prev];
                newAnalyses[analysisData.index] = defaultAnalysis;
                return newAnalyses;
              });
              
              // Subtle notification that analysis is complete
              if (analysisResult.peopleCount === 1) {
                console.log("📸 1 person detected and ready for card creation");
              } else {
                console.log(`📸 ${analysisResult.peopleCount} people detected and ready for card creation`);
              }
            } else if (analysisResult && analysisResult.peopleCount === 0) {
              console.log("📸 No people detected in photo, but it can still be used for reference");
            } else {
              console.log("⚠️ Photo analysis failed, but photo can still be used");
            }
          }).catch(error => {
            console.error("Failed to auto-analyze photo:", error);
            // Don't show error toast - silent failure is OK since analysis is optional
          });
        }, 100); // Small delay to ensure state updates are complete
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
    console.log("📸 Starting photo analysis for:", imageUrl);
    setIsAnalyzing(true);
    try {
      // Ensure the image URL is absolute
      let fullImageUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        fullImageUrl = `${window.location.origin}${imageUrl}`;
      }
      console.log("📸 Using full image URL:", fullImageUrl);
      
      const analysisPrompt = `Analyze this photo and provide a detailed JSON response with the following structure:
{
  "peopleCount": <number of people in photo>,
  "people": [
    {
      "id": "person-1",
      "position": <one of: "far-left", "left", "center-left", "center", "center-right", "right", "far-right">,
      "positionDescription": <natural description like "person on the far left wearing blue">,
      "description": <overall appearance description>,
      "apparentAge": <age range like "20-25" or "40s">,
      "gender": <apparent gender if identifiable>,
      "hairColor": <hair color>,
      "hairStyle": <hair style/length>,
      "distinguishingFeatures": <notable features like glasses, beard, etc.>,
      "clothing": <what they're wearing>,
      "expression": <facial expression/mood>
    }
  ],
  "hasPets": <boolean>,
  "petDescription": <description of pets if present>,
  "backgroundDescription": <description of the background/environment>,
  "setting": <type of setting like "outdoor park", "beach", "indoor", etc.>,
  "overallMood": <overall mood/atmosphere of the photo>,
  "lighting": <lighting conditions>
}

For each person:
1. Describe their position in the image using the enum values
2. Provide a brief description of their appearance  
3. Estimate their apparent age range
4. Note their hair color and style
5. Describe their clothing
6. Note any distinguishing features
7. Describe their expression/mood

Return ONLY the JSON response, no additional text.`;

      // Use the analyze_images tool through the MCP service
      const response = await fetch('/internal/call_mcp_tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'analyze_images',
          arguments: {
            urls: [fullImageUrl],
            analysis_prompt: analysisPrompt
          }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("analyze_images error response:", errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log("🤖 analyze_images response data:", data);
      
      if (data.error && data.error !== "None" && data.error !== null) {
        throw new Error(data.error);
      }
      
      let result;
      if (typeof data.result === 'string') {
        try {
          result = JSON.parse(data.result);
        } catch {
          result = { status: 'error', message: 'Invalid JSON response from MCP' };
        }
      } else {
        result = data.result;
      }
      
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      
      // Extract the analysis from the results array
      if (result.results && result.results.length > 0) {
        const imageResult = result.results[0];
        if (imageResult.status === 'success' && imageResult.analysis) {
          console.log("📸 Raw analysis text:", imageResult.analysis);
          
          // Try to parse the analysis as JSON
          try {
            // Extract JSON from the analysis text
            let jsonText = imageResult.analysis;
            
            // If the response contains markdown code blocks, extract the JSON
            const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              jsonText = jsonMatch[1];
            }
            
            // Parse the JSON
            const analysisData = JSON.parse(jsonText);
            console.log("📸 Parsed analysis data:", analysisData);
            
            // Ensure the data matches our expected structure
            if (typeof analysisData.peopleCount === 'number' && Array.isArray(analysisData.people)) {
              setIsAnalyzing(false);
              return analysisData as PhotoAnalysisResult;
            } else {
              console.error("Analysis data doesn't match expected structure");
              setIsAnalyzing(false);
              return null;
            }
          } catch (parseError) {
            console.error("Failed to parse analysis as JSON:", parseError);
            console.error("Raw analysis:", imageResult.analysis);
            setIsAnalyzing(false);
            return null;
          }
        } else {
          console.error("Image analysis failed:", imageResult.message);
          setIsAnalyzing(false);
          return null;
        }
      } else {
        console.error("No results returned from analyze_images");
        setIsAnalyzing(false);
        return null;
      }
      
    } catch (error) {
      console.error("Failed to analyze photo:", error);
      toast.error("Failed to analyze photo. You can still use it without analysis.");
      setIsAnalyzing(false);
      return null;
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

  // Manually trigger photo analysis for a specific image
  const triggerPhotoAnalysis = useCallback((imageIndex: number) => {
    if (imageIndex >= 0 && imageIndex < referenceImageUrls.length) {
      setPendingAnalysisIndex(imageIndex);
      setShowAnalysisModal(true);
    }
  }, [referenceImageUrls.length]);

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
    getCombinedPhotoAnalysis,
    triggerPhotoAnalysis
  };
}