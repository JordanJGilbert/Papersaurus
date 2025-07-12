"use client";

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { searchInterests, INTEREST_CATEGORIES, Interest } from '@/lib/interestsDatabase';
import { cn } from '@/lib/utils';

export interface PersonalDetail {
  id: string;
  text: string;
  category?: string;
  icon?: string;
}

interface PersonalDetailsInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

export default function PersonalDetailsInput({
  value,
  onChange,
  placeholder = "Type interests and press Enter (e.g., coffee lover, hiking, our first date...)",
  maxTags = 10,
  className
}: PersonalDetailsInputProps) {
  const [tags, setTags] = useState<PersonalDetail[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Interest[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Parse initial value into tags
  useEffect(() => {
    if (value && tags.length === 0) {
      const initialTags = value.split(',').map(text => ({
        id: Date.now() + Math.random().toString(),
        text: text.trim()
      })).filter(tag => tag.text);
      setTags(initialTags);
    }
  }, [value, tags.length]);

  // Update parent value when tags change
  useEffect(() => {
    const newValue = tags.map(tag => tag.text).join(', ');
    if (newValue !== value) {
      onChange(newValue);
    }
  }, [tags, onChange, value]);

  // Handle input changes and search for suggestions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    if (newValue.trim()) {
      const results = searchInterests(newValue);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedSuggestionIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Add a tag
  const addTag = (text: string, icon?: string, category?: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    
    // Check if tag already exists
    if (tags.some(tag => tag.text.toLowerCase() === trimmedText.toLowerCase())) {
      setInputValue('');
      return;
    }
    
    // Check max tags limit
    if (tags.length >= maxTags) {
      return;
    }
    
    const newTag: PersonalDetail = {
      id: Date.now() + Math.random().toString(),
      text: trimmedText,
      icon,
      category
    };
    
    setTags([...tags, newTag]);
    setInputValue('');
    setShowSuggestions(false);
    setSuggestions([]);
  };

  // Remove a tag
  const removeTag = (id: string) => {
    setTags(tags.filter(tag => tag.id !== id));
  };

  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      
      // If a suggestion is selected, use it
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        const suggestion = suggestions[selectedSuggestionIndex];
        addTag(suggestion.text, suggestion.icon, suggestion.category);
      } else {
        // Otherwise add the raw input
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag if backspace pressed on empty input
      removeTag(tags[tags.length - 1].id);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > -1 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: Interest) => {
    addTag(suggestion.text, suggestion.icon, suggestion.category);
  };

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get category color
  const getCategoryColor = (category?: string) => {
    if (!category) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    return INTEREST_CATEGORIES[category]?.color || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Tags Display */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map(tag => (
            <Badge
              key={tag.id}
              variant="secondary"
              className={cn(
                "pl-2.5 pr-1.5 py-1.5 text-sm font-medium",
                getCategoryColor(tag.category)
              )}
            >
              {tag.icon && <span className="mr-1">{tag.icon}</span>}
              {tag.text}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="ml-1.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                aria-label={`Remove ${tag.text}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Badge>
          ))}
          {tags.length < maxTags && (
            <div className="text-xs text-muted-foreground self-center">
              {maxTags - tags.length} more available
            </div>
          )}
        </div>
      )}

      {/* Input Field */}
      <div className="relative">
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : "Add more..."}
            className={cn(
              "pr-10",
              tags.length >= maxTags && "opacity-50 cursor-not-allowed"
            )}
            disabled={tags.length >= maxTags}
            style={{ fontSize: '16px' }}
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => addTag(inputValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              disabled={tags.length >= maxTags}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className={cn(
                  "w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2",
                  index === selectedSuggestionIndex && "bg-gray-100 dark:bg-gray-800"
                )}
              >
                {suggestion.icon && <span>{suggestion.icon}</span>}
                <span className="flex-1">{suggestion.text}</span>
                <span className="text-xs text-muted-foreground">
                  {INTEREST_CATEGORIES[suggestion.category]?.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Helper Text */}
      <p className="text-xs text-muted-foreground">
        Press Enter or comma to add • Click tags to remove • {tags.length}/{maxTags} details added
      </p>
    </div>
  );
}