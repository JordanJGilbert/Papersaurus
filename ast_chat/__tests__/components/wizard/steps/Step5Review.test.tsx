import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step5Review from '@/components/wizard/steps/Step5Review';
import { CardFormData } from '@/hooks/useCardForm';

// Mock the localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('Step5Review - Page Refresh During Generation', () => {
  const defaultFormData: CardFormData = {
    selectedType: 'birthday',
    customCardType: '',
    selectedTone: 'funny',
    toField: 'John',
    fromField: 'Jane',
    relationshipField: '',
    finalCardMessage: 'Happy Birthday!',
    isHandwrittenMessage: false,
    selectedArtisticStyle: 'modern',
    customStyleDescription: '',
    prompt: '',
    selectedDraftModel: 'gpt-image-1',
    selectedImageModel: 'gpt-image-1',
    selectedPaperSize: 'standard',
    isFrontBackOnly: false,
    referenceImageUrls: [],
    referenceImageFile: null,
    handwritingImageUrl: '',
    handwritingImageFile: null,
    userEmail: 'test@example.com',
    completedSteps: [1, 2, 3, 4],
    currentCardId: null,
    photoAnalyses: [],
  };

  const defaultProps = {
    formData: defaultFormData,
    updateFormData: jest.fn(),
    onStepComplete: jest.fn(),
    isGenerating: false,
    isGeneratingFinalCard: false,
    isGeneratingMessage: false,
    generationProgress: '',
    progressPercentage: 0,
    currentElapsedTime: 0,
    isDraftMode: false,
    draftCards: [],
    selectedDraftIndex: -1,
    formatGenerationTime: (seconds: number) => `${seconds}s`,
    onGenerateDraftCards: jest.fn(),
    onSelectDraft: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('[]');
  });

  describe('Initial Load States', () => {
    it('should show loading bar when isGenerating is true', () => {
      render(<Step5Review {...defaultProps} isGenerating={true} />);
      
      expect(screen.getByText('Creating Your Card')).toBeInTheDocument();
      expect(screen.getByText(/Generating your personalized card.../)).toBeInTheDocument();
    });

    it('should show draft selection when not generating and no pending jobs', () => {
      render(<Step5Review {...defaultProps} />);
      
      expect(screen.getByText('Ready to Create Your Card?')).toBeInTheDocument();
      expect(screen.getByText('Create 5 Front Cover Options')).toBeInTheDocument();
    });
  });

  describe('Page Refresh Scenarios', () => {
    it('should show loading state when pending jobs exist in localStorage', async () => {
      // Simulate pending jobs in localStorage
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(['draft-123', 'draft-456']));
      
      render(<Step5Review {...defaultProps} />);
      
      // Should show loading initially
      expect(screen.getByText('Creating Your Card')).toBeInTheDocument();
      
      // After timeout, should stop showing loading if isGenerating is still false
      await waitFor(
        () => {
          expect(screen.queryByText('Creating Your Card')).not.toBeInTheDocument();
        },
        { timeout: 1500 }
      );
    });

    it('should maintain loading state when isGenerating becomes true after refresh', async () => {
      // Simulate pending jobs
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(['draft-123']));
      
      const { rerender } = render(<Step5Review {...defaultProps} />);
      
      // Initially shows loading due to pending jobs
      expect(screen.getByText('Creating Your Card')).toBeInTheDocument();
      
      // Simulate parent component restoring generation state
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      rerender(<Step5Review {...defaultProps} isGenerating={true} generationProgress="Generating draft 1 of 5..." />);
      
      // Should still show loading with updated progress
      expect(screen.getByText('Creating Your Card')).toBeInTheDocument();
      expect(screen.getAllByText(/Generating draft 1 of 5.../)).toHaveLength(2); // Both in header and progress bar
    });

    it('should handle the case where pending jobs exist but backend has no jobs', async () => {
      // Simulate stale pending jobs
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(['draft-old-123']));
      
      render(<Step5Review {...defaultProps} />);
      
      // Should show loading initially
      expect(screen.getByText('Creating Your Card')).toBeInTheDocument();
      
      // After checking and finding no jobs, should show draft selection
      await waitFor(
        () => {
          expect(screen.getByText('Ready to Create Your Card?')).toBeInTheDocument();
        },
        { timeout: 1500 }
      );
    });
  });

  describe('Draft Cards Display', () => {
    it('should show draft cards when they are available', () => {
      const draftCards = [
        { frontCover: 'image1.jpg', id: '1', styleInfo: { styleLabel: 'Modern' } },
        { frontCover: 'image2.jpg', id: '2', styleInfo: { styleLabel: 'Classic' } },
      ];
      
      render(<Step5Review {...defaultProps} draftCards={draftCards} />);
      
      expect(screen.getByText('Choose Your Favorite Design')).toBeInTheDocument();
      expect(screen.getByText('Design 1')).toBeInTheDocument();
      expect(screen.getByText('Design 2')).toBeInTheDocument();
    });

    it('should show loading for remaining drafts when still generating', () => {
      const draftCards = [
        { frontCover: 'image1.jpg', id: '1' },
        { frontCover: 'image2.jpg', id: '2' },
      ];
      
      render(<Step5Review {...defaultProps} draftCards={draftCards} isGenerating={true} />);
      
      // Should show completed drafts and loading for remaining
      expect(screen.getByText('Design 1')).toBeInTheDocument();
      expect(screen.getByText('Design 2')).toBeInTheDocument();
      expect(screen.getAllByText('Creating...')).toHaveLength(3); // 3 remaining drafts
    });
  });

  describe('User Interactions', () => {
    it('should call onGenerateDraftCards when clicking generate button', async () => {
      const user = userEvent.setup();
      const onGenerateDraftCards = jest.fn();
      
      render(<Step5Review {...defaultProps} onGenerateDraftCards={onGenerateDraftCards} />);
      
      const button = screen.getByText('Create 5 Front Cover Options');
      await user.click(button);
      
      expect(onGenerateDraftCards).toHaveBeenCalledTimes(1);
    });

    it('should call onSelectDraft when clicking a draft card', async () => {
      const user = userEvent.setup();
      const onSelectDraft = jest.fn();
      const draftCards = [
        { frontCover: 'image1.jpg', id: '1' },
      ];
      
      render(<Step5Review {...defaultProps} draftCards={draftCards} onSelectDraft={onSelectDraft} />);
      
      const card = screen.getByText('Design 1').closest('div[class*="cursor-pointer"]')!;
      await user.click(card);
      
      expect(onSelectDraft).toHaveBeenCalledWith(0);
    });
  });

  describe('Progress Display', () => {
    it('should show progress percentage correctly', () => {
      render(<Step5Review {...defaultProps} isGenerating={true} progressPercentage={45} />);
      
      expect(screen.getByText('45% Complete')).toBeInTheDocument();
    });

    it('should show elapsed time when provided', () => {
      const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
      
      render(<Step5Review 
        {...defaultProps} 
        isGenerating={true} 
        currentElapsedTime={75}
        formatGenerationTime={formatTime}
      />);
      
      expect(screen.getByText('⏱️ 1:15')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty localStorage gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      expect(() => {
        render(<Step5Review {...defaultProps} />);
      }).not.toThrow();
      
      expect(screen.getByText('Ready to Create Your Card?')).toBeInTheDocument();
    });

    it('should handle malformed localStorage data', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');
      
      expect(() => {
        render(<Step5Review {...defaultProps} />);
      }).not.toThrow();
    });

    it('should disable generate button when email is missing', () => {
      const formDataNoEmail = { ...defaultFormData, userEmail: '' };
      
      render(<Step5Review {...defaultProps} formData={formDataNoEmail} />);
      
      const button = screen.getByText('Create 5 Front Cover Options').closest('button');
      expect(button).toBeDisabled();
      expect(screen.getByText(/Please enter your email address/)).toBeInTheDocument();
    });
  });
});