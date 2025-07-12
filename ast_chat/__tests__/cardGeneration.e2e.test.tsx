import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CardWizard from '@/components/wizard/CardWizardRefactored';
import { io } from 'socket.io-client';

// Mock data
const mockDraftCard = {
  id: 'draft-1',
  prompt: 'Test birthday card',
  frontCover: 'data:image/jpeg;base64,mockFrontCover',
  backCover: '',
  leftPage: '',
  rightPage: '',
  createdAt: new Date(),
};

const mockFinalCard = {
  id: 'card-1',
  prompt: 'Test birthday card',
  frontCover: 'data:image/jpeg;base64,mockFrontCover',
  backCover: 'data:image/jpeg;base64,mockBackCover',
  leftPage: 'data:image/jpeg;base64,mockLeftPage',
  rightPage: 'data:image/jpeg;base64,mockRightPage',
  createdAt: new Date(),
  shareUrl: 'https://vibecarding.com/cards/card-1',
};

// Helper to simulate WebSocket messages
const simulateWebSocketMessage = (type: string, data: any) => {
  const socket = (io as jest.Mock).mock.results[0].value;
  const handlers = (socket.on as jest.Mock).mock.calls;
  const handler = handlers.find(call => call[0] === type)?.[1];
  if (handler) {
    handler(data);
  }
};

// Helper to wait for progress updates
const waitForProgress = async (targetProgress: number) => {
  await waitFor(() => {
    const progressBar = screen.getByRole('progressbar');
    const currentProgress = parseInt(progressBar.getAttribute('aria-valuenow') || '0');
    expect(currentProgress).toBeGreaterThanOrEqual(targetProgress);
  }, { timeout: 10000 });
};

describe('Card Generation E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    
    // Mock fetch responses
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/chat') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            content: "Happy Birthday! Wishing you a day filled with joy and laughter!",
            model: "gemini-2.5-pro"
          })
        });
      }
      
      if (url === '/api/generate-draft-cards-async') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'processing',
            job_id: 'draft-job-123',
            message: 'Draft generation started'
          })
        });
      }
      
      if (url === '/api/generate-card-async') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'processing',
            job_id: 'final-job-123',
            message: 'Card generation started'
          })
        });
      }
      
      if (url === '/api/send-thank-you-email') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            message: 'Email sent'
          })
        });
      }
      
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });
  });

  test('Complete card generation flow with time-based progress', async () => {
    const user = userEvent.setup();
    
    render(<CardWizard />);
    
    // Step 1: Card Basics
    expect(screen.getByText('Card Basics')).toBeInTheDocument();
    
    // Select card type and tone
    const birthdayButton = screen.getByRole('button', { name: /birthday/i });
    await user.click(birthdayButton);
    
    const funnyButton = screen.getByRole('button', { name: /funny/i });
    await user.click(funnyButton);
    
    // Fill in recipient details
    const toField = screen.getByPlaceholderText(/who is this card for/i);
    await user.type(toField, 'John');
    
    const fromField = screen.getByPlaceholderText(/who is this card from/i);
    await user.type(fromField, 'Jane');
    
    // Continue to next step
    const continueButton = screen.getByRole('button', { name: /continue/i });
    await user.click(continueButton);
    
    // Step 2: Content & Message
    await waitFor(() => {
      expect(screen.getByText('Content & Message')).toBeInTheDocument();
    });
    
    // Add description
    const descriptionField = screen.getByPlaceholderText(/describe your card/i);
    await user.type(descriptionField, 'A fun birthday card with balloons and cake');
    
    // Get AI help for message
    const getHelpButton = screen.getByRole('button', { name: /get help/i });
    await user.click(getHelpButton);
    
    await waitFor(() => {
      const messageField = screen.getByPlaceholderText(/write your message/i);
      expect(messageField).toHaveValue("Happy Birthday! Wishing you a day filled with joy and laughter!");
    });
    
    await user.click(screen.getByRole('button', { name: /continue/i }));
    
    // Step 3: Personalization (skip)
    await waitFor(() => {
      expect(screen.getByText('Personalization')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /skip/i }));
    
    // Step 4: Email Address
    await waitFor(() => {
      expect(screen.getByText('Email Address')).toBeInTheDocument();
    });
    
    const emailField = screen.getByPlaceholderText(/enter your email/i);
    await user.type(emailField, 'test@example.com');
    
    await user.click(screen.getByRole('button', { name: /continue/i }));
    
    // Step 5: Draft Selection
    await waitFor(() => {
      expect(screen.getByText('Choose Your Design')).toBeInTheDocument();
    });
    
    // Click generate drafts
    const generateDraftsButton = screen.getByRole('button', { name: /generate variations/i });
    await user.click(generateDraftsButton);
    
    // Verify progress starts at 0
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });
    
    // Simulate time-based progress (should increment ~2.2% per second)
    await act(async () => {
      jest.advanceTimersByTime(5000); // 5 seconds = ~11% progress
    });
    
    await waitForProgress(10);
    
    // Simulate draft completions via WebSocket
    for (let i = 0; i < 5; i++) {
      simulateWebSocketMessage('job_update', {
        job_id: 'draft-job-123',
        type: 'draft_complete',
        draft_index: i,
        draft_card: {
          ...mockDraftCard,
          id: `draft-${i}`,
          frontCover: `data:image/jpeg;base64,mockDraft${i}`
        }
      });
      
      await waitFor(() => {
        expect(screen.getByText(`${i + 1}/5 variations complete`)).toBeInTheDocument();
      });
    }
    
    // All drafts complete
    simulateWebSocketMessage('job_update', {
      job_id: 'draft-job-123',
      type: 'all_drafts_complete',
      message: 'All drafts generated successfully'
    });
    
    // Wait for draft cards to appear
    await waitFor(() => {
      const draftImages = screen.getAllByRole('img', { name: /draft variation/i });
      expect(draftImages).toHaveLength(5);
    });
    
    // Select a draft
    const firstDraft = screen.getAllByRole('img', { name: /draft variation/i })[0];
    await user.click(firstDraft);
    
    // Should auto-advance to Step 6
    await waitFor(() => {
      expect(screen.getByText('Final Generation')).toBeInTheDocument();
    });
    
    // Click generate final card
    const generateFinalButton = screen.getByRole('button', { name: /generate final card/i });
    await user.click(generateFinalButton);
    
    // Verify final card progress starts
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });
    
    // Simulate time-based progress for final card (1.1% per second)
    await act(async () => {
      jest.advanceTimersByTime(10000); // 10 seconds = ~11% progress
    });
    
    await waitForProgress(10);
    
    // Simulate final card completion
    simulateWebSocketMessage('job_update', {
      job_id: 'final-job-123',
      type: 'card_complete',
      card_data: mockFinalCard,
      generationTimeSeconds: 45
    });
    
    // Verify card is displayed
    await waitFor(() => {
      expect(screen.getByText('Your Card is Ready!')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /front cover/i })).toBeInTheDocument();
    });
    
    // Verify localStorage has the completed card
    const savedCard = JSON.parse(localStorage.getItem('lastCompletedCard') || '{}');
    expect(savedCard.id).toBe('card-1');
    expect(savedCard.isFinalCard).toBe(true);
  });

  test('Resume draft generation after page refresh', async () => {
    // Set up localStorage with pending draft job
    const pendingJob = {
      jobId: 'draft-job-456',
      jobType: 'draft',
      startTime: Date.now() - 15000, // Started 15 seconds ago
      formData: {
        selectedType: 'birthday',
        selectedTone: 'funny',
        toField: 'Alice',
        fromField: 'Bob',
        userEmail: 'test@example.com',
        finalCardMessage: 'Happy Birthday Alice!',
        prompt: 'Birthday card with confetti'
      }
    };
    
    localStorage.setItem('pendingJobs', JSON.stringify([pendingJob]));
    localStorage.setItem('cardFormData', JSON.stringify(pendingJob.formData));
    
    render(<CardWizard />);
    
    // Should auto-navigate to Step 5
    await waitFor(() => {
      expect(screen.getByText('Choose Your Design')).toBeInTheDocument();
      expect(screen.getByText(/generating variations/i)).toBeInTheDocument();
    });
    
    // Progress should continue from where it left off (~33% after 15 seconds)
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar');
      const progress = parseInt(progressBar.getAttribute('aria-valuenow') || '0');
      expect(progress).toBeGreaterThan(30);
    });
    
    // Simulate receiving draft updates
    for (let i = 0; i < 5; i++) {
      simulateWebSocketMessage('job_update', {
        job_id: 'draft-job-456',
        type: 'draft_complete',
        draft_index: i,
        draft_card: {
          ...mockDraftCard,
          id: `draft-${i}`
        }
      });
    }
    
    // Verify all drafts are displayed
    await waitFor(() => {
      const draftImages = screen.getAllByRole('img', { name: /draft variation/i });
      expect(draftImages).toHaveLength(5);
    });
  });

  test('Handle final card completion without UI update bug', async () => {
    // Set up completed card in localStorage
    const completedCard = {
      ...mockFinalCard,
      completedAt: Date.now(),
      isFinalCard: true
    };
    
    localStorage.setItem('lastCompletedCard', JSON.stringify(completedCard));
    localStorage.setItem('cardFormData', JSON.stringify({
      selectedType: 'birthday',
      selectedTone: 'funny',
      toField: 'Alice',
      fromField: 'Bob',
      userEmail: 'test@example.com',
      finalCardMessage: 'Happy Birthday!',
      prompt: 'Birthday card'
    }));
    
    render(<CardWizard />);
    
    // Should auto-navigate to Step 6 and show completed card
    await waitFor(() => {
      expect(screen.getByText('Your Card is Ready!')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /front cover/i })).toHaveAttribute('src', mockFinalCard.frontCover);
    });
    
    // Verify print button is available
    expect(screen.getByRole('button', { name: /print card/i })).toBeInTheDocument();
  });

  test('Progress bar updates correctly with time-based increments', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    
    // Set up wizard at step 5
    localStorage.setItem('cardFormData', JSON.stringify({
      selectedType: 'birthday',
      selectedTone: 'funny',
      toField: 'Test',
      fromField: 'Tester',
      userEmail: 'test@example.com',
      finalCardMessage: 'Happy Birthday!',
      prompt: 'Test card'
    }));
    
    render(<CardWizard />);
    
    // Navigate to step 5
    await act(async () => {
      const wizard = screen.getByTestId('card-wizard');
      fireEvent.click(screen.getByText('5')); // Click step indicator
    });
    
    // Start draft generation
    const generateButton = screen.getByRole('button', { name: /generate variations/i });
    await user.click(generateButton);
    
    // Check initial progress
    let progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    
    // Advance time and check progress increments
    await act(async () => {
      jest.advanceTimersByTime(1000); // 1 second
    });
    
    progressBar = screen.getByRole('progressbar');
    const progress1s = parseInt(progressBar.getAttribute('aria-valuenow') || '0');
    expect(progress1s).toBeGreaterThan(0);
    expect(progress1s).toBeLessThan(5); // Should be ~2.2%
    
    // Advance more time
    await act(async () => {
      jest.advanceTimersByTime(9000); // 9 more seconds (total 10s)
    });
    
    progressBar = screen.getByRole('progressbar');
    const progress10s = parseInt(progressBar.getAttribute('aria-valuenow') || '0');
    expect(progress10s).toBeGreaterThan(20); // Should be ~22%
    expect(progress10s).toBeLessThan(30);
    
    // Verify progress caps at 95%
    await act(async () => {
      jest.advanceTimersByTime(50000); // 50 more seconds (total 60s)
    });
    
    progressBar = screen.getByRole('progressbar');
    const progressMax = parseInt(progressBar.getAttribute('aria-valuenow') || '0');
    expect(progressMax).toBe(95); // Should cap at 95%
    
    jest.useRealTimers();
  });
});