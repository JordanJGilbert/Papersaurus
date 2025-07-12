"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Users, User, Camera, Loader2, Edit3, ChevronRight } from "lucide-react";
import { PhotoAnalysis, PhotoAnalysisResult, SelectedPerson } from "@/hooks/cardStudio/constants";

interface PhotoAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageIndex: number;
  isAnalyzing: boolean;
  analysisResult: PhotoAnalysisResult | null;
  onSave: (analysis: PhotoAnalysis) => void;
  onSkip: () => void;
  toField?: string;
  fromField?: string;
  existingAnalysis?: PhotoAnalysis | null;
}

type ModalStep = 'selection' | 'naming';

export default function PhotoAnalysisModal({
  isOpen,
  onClose,
  imageUrl,
  imageIndex,
  isAnalyzing,
  analysisResult,
  onSave,
  onSkip,
  toField,
  fromField,
  existingAnalysis
}: PhotoAnalysisModalProps) {
  const [currentStep, setCurrentStep] = useState<ModalStep>('selection');
  const [includeEveryone, setIncludeEveryone] = useState(true);
  const [selectedPeople, setSelectedPeople] = useState<SelectedPerson[]>([]);
  const [showNaming, setShowNaming] = useState(false);
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(5); // For large groups

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('selection');
      setIncludeEveryone(true);
      setShowNaming(false);
      setVisiblePeopleCount(5);
    }
  }, [isOpen]);

  // Initialize selected people when analysis completes or from existing data
  useEffect(() => {
    if (existingAnalysis?.selectedPeople) {
      // Use existing analysis data (from pre-analysis)
      setSelectedPeople(existingAnalysis.selectedPeople);
      
      // If any person has a name, show the naming step
      const hasNames = existingAnalysis.selectedPeople.some(p => p.name && p.name.trim() !== '');
      if (hasNames) {
        setShowNaming(true);
      }
    } else if (analysisResult?.people) {
      // Fresh analysis result
      setSelectedPeople(
        analysisResult.people.map(person => ({
          ...person,
          includeInCard: person.includeInCard !== undefined ? person.includeInCard : true,
          name: person.name || "",
          relationshipToRecipient: person.relationshipToRecipient || ""
        }))
      );
    }
  }, [analysisResult, existingAnalysis]);

  const handleContinueFromSelection = () => {
    if (showNaming) {
      setCurrentStep('naming');
    } else {
      handleSaveWithoutNames();
    }
  };

  const handlePersonNameChange = (personId: string, name: string) => {
    setSelectedPeople(prev =>
      prev.map(person =>
        person.id === personId ? { ...person, name } : person
      )
    );
  };

  const handlePersonRelationshipChange = (personId: string, relationshipToRecipient: string) => {
    setSelectedPeople(prev =>
      prev.map(person =>
        person.id === personId ? { ...person, relationshipToRecipient } : person
      )
    );
  };

  const handleSaveWithoutNames = () => {
    if (!analysisResult) return;
    
    const analysis: PhotoAnalysis = {
      imageUrl,
      imageIndex,
      analysisResult,
      selectedPeople: selectedPeople.map(p => ({ ...p, includeInCard: true })),
      includeEveryone: true,
      groupRelationship: '',
      excludedCount: 0,
      specialInstructions: '',
      analyzed: true,
      analysisFailed: false
    };

    onSave(analysis);
  };

  const handleSaveWithNames = () => {
    if (!analysisResult) return;
    
    // Check if all people have names
    const allHaveNames = selectedPeople.every(person => person.name && person.name.trim() !== '');
    
    if (!allHaveNames) {
      // Don't save if names are missing
      return;
    }
    
    const analysis: PhotoAnalysis = {
      imageUrl,
      imageIndex,
      analysisResult,
      selectedPeople,
      includeEveryone: true,
      groupRelationship: '',
      excludedCount: 0,
      specialInstructions: '',
      analyzed: true,
      analysisFailed: false
    };

    onSave(analysis);
  };

  const getSimplePositionLabel = (position: string, peopleCount: number) => {
    // For small groups, use simple labels
    if (peopleCount <= 3) {
      if (position.includes('left')) return 'Left';
      if (position.includes('right')) return 'Right';
      return 'Center';
    }
    
    // For larger groups, keep more detail
    const labels: Record<string, string> = {
      'far-left': 'Far Left',
      'left': 'Left',
      'center-left': 'Center-Left',
      'center': 'Center',
      'center-right': 'Center-Right',
      'right': 'Right',
      'far-right': 'Far Right'
    };
    return labels[position] || position;
  };
  
  const getMostDistinguishingFeature = (person: any) => {
    // Pick the most useful identifying feature
    if (person.distinguishingFeatures && person.distinguishingFeatures !== 'None') {
      return person.distinguishingFeatures.split(',')[0].trim();
    }
    if (person.clothing) {
      // Extract color or key item from clothing
      const colorMatch = person.clothing.match(/(red|blue|green|yellow|black|white|pink|purple|orange|grey|gray|brown)\s+\w+/i);
      if (colorMatch) return colorMatch[0];
      return person.clothing.split(',')[0].trim();
    }
    if (person.hairColor && person.hairColor !== 'Unknown') {
      return `${person.hairColor} hair`;
    }
    return person.apparentAge || 'Person';
  };

  // Group people by rows for large groups
  const groupPeopleByRows = (people: any[]) => {
    if (people.length <= 6) {
      return [{ row: 'Single Row', people }];
    }
    
    // Simple grouping - front half and back half
    const midpoint = Math.ceil(people.length / 2);
    return [
      { row: 'Front Row', people: people.slice(0, midpoint) },
      { row: 'Back Row', people: people.slice(midpoint) }
    ];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-lg shadow-xl w-full sm:max-w-md h-auto max-h-[85vh] overflow-hidden animate-slide-up sm:animate-none flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            {currentStep === 'selection' ? 'Add People to Card' : 'Name People (Optional)'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-target"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6">
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
              <p className="text-lg text-gray-600 dark:text-gray-300">
                Analyzing your photo...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Identifying people and understanding the scene
              </p>
            </div>
          ) : analysisResult && currentStep === 'selection' ? (
            <div className="space-y-6">
              {/* Image Preview with People Count */}
              <div className="relative flex-shrink-0">
                <div className="w-full h-48 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
                  <img
                    src={imageUrl}
                    alt="Reference photo"
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                <div className="absolute top-2 right-2 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
                  <Users className="w-4 h-4 inline mr-1" />
                  {analysisResult.peopleCount} {analysisResult.peopleCount === 1 ? 'person' : 'people'}
                </div>
              </div>

              {/* Simple Selection */}
              {analysisResult.peopleCount > 0 && (
                <div className="space-y-4">
                  <p className="text-base text-gray-700 dark:text-gray-300">
                    Would you like to include the people from this photo in your card design?
                  </p>
                  
                  <div className="flex items-center justify-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-400 dark:border-blue-500">
                    <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
                    <span className="text-base font-medium text-blue-700 dark:text-blue-300">
                      Yes, include everyone
                    </span>
                  </div>

                  {/* Add Names Option */}
                  <label className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                    <input
                      type="checkbox"
                      checked={showNaming}
                      onChange={(e) => setShowNaming(e.target.checked)}
                      className="mr-3 w-4 h-4"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Add names to personalize
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Optional - helps create more personal messages
                      </p>
                    </div>
                    <Edit3 className="w-4 h-4 text-gray-400" />
                  </label>
                </div>
              )}
            </div>
          ) : analysisResult && currentStep === 'naming' ? (
            <div className="space-y-4">
              {/* Compact Image Preview */}
              <div className="w-full h-24 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
                <img
                  src={imageUrl}
                  alt="Reference photo"
                  className="w-full h-full object-cover object-center"
                />
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300">
                Add names to help personalize your card
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Names are required. Relationships are optional but recommended.
              </p>

              {/* People List */}
              <div className="space-y-2">
                {selectedPeople.length <= 6 ? (
                  // Show all people for small groups
                  selectedPeople.map((person, idx) => (
                    <div key={person.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{idx + 1}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {getSimplePositionLabel(person.position, analysisResult.peopleCount)} • {getMostDistinguishingFeature(person)}
                          </p>
                          <div>
                            <input
                              type="text"
                              value={person.name || ''}
                              onChange={(e) => handlePersonNameChange(person.id, e.target.value)}
                              placeholder="Name (required)"
                              className={`w-full px-2 py-1 text-sm border rounded-md dark:bg-gray-600 dark:border-gray-500 ${
                                !person.name?.trim() ? 'border-red-300 dark:border-red-600' : ''
                              }`}
                              style={{ fontSize: '16px' }}
                              required
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              value={person.relationshipToRecipient || ''}
                              onChange={(e) => handlePersonRelationshipChange(person.id, e.target.value)}
                              placeholder={`Relationship to ${toField || 'recipient'} (optional)`}
                              className="w-full px-2 py-1 text-sm border rounded-md dark:bg-gray-600 dark:border-gray-500"
                              style={{ fontSize: '16px' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  // Group by rows for large groups
                  <>
                    {groupPeopleByRows(selectedPeople).map((group, groupIdx) => (
                      <div key={groupIdx} className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                          {group.row} ({group.people.length} people)
                        </h4>
                        {group.people.slice(0, groupIdx === 0 ? visiblePeopleCount : 3).map((person, idx) => {
                          const globalIdx = groupIdx === 0 ? idx : Math.ceil(selectedPeople.length / 2) + idx;
                          return (
                            <div key={person.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-1">
                                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{globalIdx + 1}</span>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0 space-y-2">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {getSimplePositionLabel(person.position, analysisResult.peopleCount)} • {getMostDistinguishingFeature(person)}
                                  </p>
                                  <div>
                                    <input
                                      type="text"
                                      value={person.name || ''}
                                      onChange={(e) => handlePersonNameChange(person.id, e.target.value)}
                                      placeholder="Name (required)"
                                      className={`w-full px-2 py-1 text-sm border rounded-md dark:bg-gray-600 dark:border-gray-500 ${
                                        !person.name?.trim() ? 'border-red-300 dark:border-red-600' : ''
                                      }`}
                                      style={{ fontSize: '16px' }}
                                      required
                                    />
                                  </div>
                                  <div>
                                    <input
                                      type="text"
                                      value={person.relationshipToRecipient || ''}
                                      onChange={(e) => handlePersonRelationshipChange(person.id, e.target.value)}
                                      placeholder={`Relationship to ${toField || 'recipient'} (optional)`}
                                      className="w-full px-2 py-1 text-sm border rounded-md dark:bg-gray-600 dark:border-gray-500"
                                      style={{ fontSize: '16px' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {groupIdx === 0 && group.people.length > visiblePeopleCount && (
                          <button
                            onClick={() => setVisiblePeopleCount(prev => prev + 5)}
                            className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          >
                            Show more ({group.people.length - visiblePeopleCount} hidden)
                          </button>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <Camera className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-lg text-gray-600 dark:text-gray-300">
                Photo analysis not available
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                You can still use this photo without analysis
              </p>
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 flex gap-3 items-center p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700">
          {currentStep === 'selection' ? (
            <>
              <button
                onClick={onSkip}
                className="flex-1 px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Skip
              </button>
              <button
                onClick={handleContinueFromSelection}
                disabled={isAnalyzing || !analysisResult}
                className="flex-1 px-4 py-3 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCurrentStep('selection')}
                className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Back
              </button>
              <button
                onClick={() => handleSaveWithoutNames()}
                className="flex-1 px-4 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Skip Names
              </button>
              <button
                onClick={handleSaveWithNames}
                disabled={!selectedPeople.every(p => p.name?.trim())}
                className="flex-1 px-4 py-3 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Save Names</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}