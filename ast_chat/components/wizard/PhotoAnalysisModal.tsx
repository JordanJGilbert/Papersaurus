"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Users, User, Camera, Loader2 } from "lucide-react";
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
}

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
  fromField
}: PhotoAnalysisModalProps) {
  const [includeEveryone, setIncludeEveryone] = useState(true);
  const [selectedPeople, setSelectedPeople] = useState<SelectedPerson[]>([]);
  const [groupRelationship, setGroupRelationship] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Debug logging
  React.useEffect(() => {
    console.log("📸 PhotoAnalysisModal state:", {
      isOpen,
      imageUrl,
      imageIndex,
      isAnalyzing,
      hasAnalysisResult: !!analysisResult,
      analysisResultPeopleCount: analysisResult?.peopleCount
    });
  }, [isOpen, imageUrl, imageIndex, isAnalyzing, analysisResult]);

  // Initialize selected people when analysis completes
  useEffect(() => {
    if (analysisResult?.people) {
      setSelectedPeople(
        analysisResult.people.map(person => ({
          ...person,
          includeInCard: true,
          name: "",
          relationshipToRecipient: ""
        }))
      );
    }
  }, [analysisResult]);

  if (!isOpen) return null;

  const handlePersonToggle = (personId: string) => {
    setSelectedPeople(prev =>
      prev.map(person =>
        person.id === personId
          ? { ...person, includeInCard: !person.includeInCard }
          : person
      )
    );
    setIncludeEveryone(false);
  };

  const handlePersonNameChange = (personId: string, name: string) => {
    setSelectedPeople(prev =>
      prev.map(person =>
        person.id === personId ? { ...person, name } : person
      )
    );
  };

  const handlePersonRelationshipChange = (personId: string, relationship: string) => {
    setSelectedPeople(prev =>
      prev.map(person =>
        person.id === personId ? { ...person, relationshipToRecipient: relationship } : person
      )
    );
  };

  const handleSave = () => {
    const finalSelectedPeople = includeEveryone
      ? selectedPeople
      : selectedPeople.filter(p => p.includeInCard);

    const analysis: PhotoAnalysis = {
      imageUrl,
      imageIndex,
      analysisResult: analysisResult!,
      selectedPeople: finalSelectedPeople,
      includeEveryone,
      groupRelationship,
      excludedCount: analysisResult!.peopleCount - finalSelectedPeople.length,
      specialInstructions,
      analyzed: true,
      analysisFailed: false
    };

    onSave(analysis);
  };

  const getPositionLabel = (position: string) => {
    const labels: Record<string, string> = {
      'far-left': 'Far Left',
      'left': 'Left',
      'center-left': 'Center Left',
      'center': 'Center',
      'center-right': 'Center Right',
      'right': 'Right',
      'far-right': 'Far Right'
    };
    return labels[position] || position;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-lg shadow-xl w-full sm:max-w-2xl h-[85vh] sm:h-auto sm:max-h-[85vh] overflow-hidden animate-slide-up sm:animate-none flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 z-10 flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
            Photo Analysis
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
          ) : analysisResult ? (
            <div className="space-y-6">
              {/* Image Preview with People Count */}
              <div className="relative flex-shrink-0">
                <div className="w-full h-32 sm:h-48 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
                  <img
                    src={imageUrl}
                    alt="Reference photo"
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                <div className="absolute top-2 right-2 bg-black/70 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                  {analysisResult.peopleCount} {analysisResult.peopleCount === 1 ? 'person' : 'people'}
                </div>
              </div>

              {/* Scene Description - Collapsible on mobile */}
              <details className="bg-gray-50 dark:bg-gray-700 p-3 sm:p-4 rounded-lg">
                <summary className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white cursor-pointer">
                  Scene Details
                </summary>
                <div className="mt-2 space-y-1 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  <p><strong>Setting:</strong> {analysisResult.setting}</p>
                  <p><strong>Mood:</strong> {analysisResult.overallMood}</p>
                  <p><strong>Lighting:</strong> {analysisResult.lighting}</p>
                  {analysisResult.hasPets && (
                    <p><strong>Pets:</strong> {analysisResult.petDescription}</p>
                  )}
                </div>
              </details>

              {/* People Selection */}
              {analysisResult.peopleCount > 0 && (
                <>
                  <div>
                    <h3 className="font-semibold mb-3 text-sm sm:text-base text-gray-900 dark:text-white">
                      Who should appear on the card?
                    </h3>
                    <div className="space-y-3 mb-4">
                      <label className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer">
                        <input
                          type="radio"
                          checked={includeEveryone}
                          onChange={() => setIncludeEveryone(true)}
                          className="mr-3 w-4 h-4"
                        />
                        <span className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Everyone in the photo
                        </span>
                      </label>
                      <label className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer">
                        <input
                          type="radio"
                          checked={!includeEveryone}
                          onChange={() => setIncludeEveryone(false)}
                          className="mr-3 w-4 h-4"
                        />
                        <span className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                          Let me choose specific people
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Individual People */}
                  <div className="space-y-3">
                    {selectedPeople.map((person, idx) => (
                      <div
                        key={person.id}
                        className={`p-3 border-2 rounded-lg transition-all ${
                          !includeEveryone && !person.includeInCard
                            ? 'border-gray-200 dark:border-gray-600 opacity-50'
                            : 'border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                        }`}
                      >
                        <div className="flex items-start gap-2 sm:gap-3">
                          {!includeEveryone && (
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                checked={person.includeInCard}
                                onChange={() => handlePersonToggle(person.id)}
                                className="w-5 h-5 cursor-pointer"
                              />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                              <span className="font-medium text-sm sm:text-base">
                                Person {idx + 1} - {getPositionLabel(person.position)}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-3">
                              {person.description} • {person.apparentAge} • {person.clothing}
                            </p>
                            {(!includeEveryone ? person.includeInCard : true) && (
                              <div className="space-y-2">
                                <div>
                                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Name (optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={person.name || ''}
                                    onChange={(e) => handlePersonNameChange(person.id, e.target.value)}
                                    placeholder="e.g., John"
                                    className="mt-1 w-full px-2 py-1.5 text-sm border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                    style={{ fontSize: '16px' }}
                                  />
                                </div>
                                {toField && (
                                  <div>
                                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Relationship to {toField} (optional)
                                    </label>
                                    <input
                                      type="text"
                                      value={person.relationshipToRecipient || ''}
                                      onChange={(e) => handlePersonRelationshipChange(person.id, e.target.value)}
                                      placeholder="e.g., son, friend"
                                      className="mt-1 w-full px-2 py-1.5 text-sm border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                      style={{ fontSize: '16px' }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Group Relationship */}
                  {toField && selectedPeople.filter(p => includeEveryone || p.includeInCard).length > 1 && (
                    <div>
                      <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                        How is this group related to {toField}? (optional)
                      </label>
                      <input
                        type="text"
                        value={groupRelationship}
                        onChange={(e) => setGroupRelationship(e.target.value)}
                        placeholder="e.g., family, friends, colleagues"
                        className="mt-1 w-full px-3 py-2 text-sm sm:text-base border rounded-md dark:bg-gray-700 dark:border-gray-600"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Special Instructions */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Special instructions for this photo (optional)
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="e.g., Make sure to capture the beach background, focus on the happy expressions"
                  rows={2}
                  className="mt-1 w-full px-3 py-2 text-sm sm:text-base border rounded-md dark:bg-gray-700 dark:border-gray-600 resize-none"
                  style={{ fontSize: '16px' }}
                />
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

        {/* Footer - Mobile optimized */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between items-stretch sm:items-center p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onSkip}
            className="order-2 sm:order-1 px-4 py-3 sm:py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
          >
            Skip Analysis
          </button>
          <div className="order-1 sm:order-2 flex gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isAnalyzing || !analysisResult}
              className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Confirm</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}