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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Photo Analysis
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
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
              <div className="relative">
                <img
                  src={imageUrl}
                  alt="Reference photo"
                  className="w-full h-auto rounded-lg shadow-md"
                />
                <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
                  <Users className="w-4 h-4 inline mr-1" />
                  {analysisResult.peopleCount} {analysisResult.peopleCount === 1 ? 'person' : 'people'} found
                </div>
              </div>

              {/* Scene Description */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Scene Details</h3>
                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <p><strong>Setting:</strong> {analysisResult.setting}</p>
                  <p><strong>Mood:</strong> {analysisResult.overallMood}</p>
                  <p><strong>Lighting:</strong> {analysisResult.lighting}</p>
                  {analysisResult.hasPets && (
                    <p><strong>Pets:</strong> {analysisResult.petDescription}</p>
                  )}
                </div>
              </div>

              {/* People Selection */}
              {analysisResult.peopleCount > 0 && (
                <>
                  <div>
                    <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
                      Who should appear on the card?
                    </h3>
                    <div className="space-y-2 mb-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          checked={includeEveryone}
                          onChange={() => setIncludeEveryone(true)}
                          className="mr-2"
                        />
                        <span className="text-gray-700 dark:text-gray-300">
                          Everyone in the photo
                        </span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          checked={!includeEveryone}
                          onChange={() => setIncludeEveryone(false)}
                          className="mr-2"
                        />
                        <span className="text-gray-700 dark:text-gray-300">
                          Let me choose specific people
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Individual People */}
                  <div className="space-y-4">
                    {selectedPeople.map((person, idx) => (
                      <div
                        key={person.id}
                        className={`p-4 border rounded-lg ${
                          !includeEveryone && !person.includeInCard
                            ? 'border-gray-200 dark:border-gray-600 opacity-50'
                            : 'border-blue-200 dark:border-blue-600'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {!includeEveryone && (
                            <input
                              type="checkbox"
                              checked={person.includeInCard}
                              onChange={() => handlePersonToggle(person.id)}
                              className="mt-1"
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <User className="w-5 h-5 text-gray-500" />
                              <span className="font-medium">
                                Person {idx + 1} - {getPositionLabel(person.position)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                              {person.description} • {person.apparentAge} • {person.clothing}
                            </p>
                            {(!includeEveryone ? person.includeInCard : true) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Name (optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={person.name || ''}
                                    onChange={(e) => handlePersonNameChange(person.id, e.target.value)}
                                    placeholder="e.g., John"
                                    className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                  />
                                </div>
                                {toField && (
                                  <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                      Relationship to {toField} (optional)
                                    </label>
                                    <input
                                      type="text"
                                      value={person.relationshipToRecipient || ''}
                                      onChange={(e) => handlePersonRelationshipChange(person.id, e.target.value)}
                                      placeholder="e.g., son, friend"
                                      className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
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
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        How is this group related to {toField}? (optional)
                      </label>
                      <input
                        type="text"
                        value={groupRelationship}
                        onChange={(e) => setGroupRelationship(e.target.value)}
                        placeholder="e.g., family, friends, colleagues"
                        className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Special Instructions */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Special instructions for this photo (optional)
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="e.g., Make sure to capture the beach background, focus on the happy expressions"
                  rows={2}
                  className="mt-1 w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
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

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
          >
            Skip Analysis
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isAnalyzing || !analysisResult}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}