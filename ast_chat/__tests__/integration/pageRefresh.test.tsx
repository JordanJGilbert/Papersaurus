import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import CardWizard from '@/components/wizard/CardWizard';

// Mock socket.io
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
};

jest.mock('socket.io-client', () => {
  return {
    __esModule: true,
    default: jest.fn(() => mockSocket),
    io: jest.fn(() => mockSocket),
  };
});

// Mock API responses
global.fetch = jest.fn();

describe('Page Refresh During Card Generation - Integration Test', () => {
  const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });
  });

  it('should restore generation state after page refresh during draft generation', async () => {
    // Step 1: Simulate state before page refresh
    const pendingJobs = ['draft-0-abc', 'draft-1-def', 'draft-2-ghi'];
    const jobsData = {
      'cardJob_draft-0-abc': {
        jobId: 'draft-0-abc',
        status: 'processing',
        createdAt: Date.now() - 15000,
        lastProgress: 30,
        lastProgressText: 'Generating draft 1 of 5...',
        draftCards: [{ id: '1', frontCover: 'image1.jpg' }],
      },
      'cardJob_draft-1-def': {
        jobId: 'draft-1-def',
        status: 'processing',
        createdAt: Date.now() - 10000,
      },
      'cardJob_draft-2-ghi': {
        jobId: 'draft-2-ghi',
        status: 'processing',
        createdAt: Date.now() - 5000,
      },
    };

    // Mock localStorage to return pending jobs
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'pendingCardJobs') return JSON.stringify(pendingJobs);
      if (key === 'cardFormData') return JSON.stringify({
        selectedType: 'birthday',
        selectedTone: 'funny',
        userEmail: 'test@example.com',
        completedSteps: [1, 2, 3, 4],
        currentStep: 5,
      });
      if (jobsData[key]) return JSON.stringify(jobsData[key]);
      return null;
    });

    // Mock API to confirm jobs exist
    (fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/job-status/')) {
        const jobId = url.split('/').pop();
        if (pendingJobs.includes(jobId)) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'processing' }),
          });
        }
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'success' }),
      });
    });

    // Step 2: Render component (simulating page load after refresh)
    render(<CardWizard />);

    // Step 3: Verify loading state is shown immediately
    await waitFor(() => {
      expect(screen.getByText(/Creating Your Card/i)).toBeInTheDocument();
    }, { timeout: 2000 });

    // Verify progress is restored
    expect(screen.getByText(/30% Complete/i)).toBeInTheDocument();

    // Step 4: Simulate WebSocket updates for remaining drafts
    act(() => {
      const onMessage = mockSocket.on.mock.calls.find(call => call[0] === 'job_update')?.[1];
      if (onMessage) {
        // Complete first draft
        onMessage({
          job_id: 'draft-0-abc',
          status: 'completed',
          cardData: { frontCover: 'image1-final.jpg' },
        });
        
        // Complete second draft
        onMessage({
          job_id: 'draft-1-def',
          status: 'completed',
          cardData: { frontCover: 'image2-final.jpg' },
        });
      }
    });

    // Step 5: Verify draft cards are displayed
    await waitFor(() => {
      expect(screen.getByText('Design 1')).toBeInTheDocument();
      expect(screen.getByText('Design 2')).toBeInTheDocument();
    });

    // Verify remaining drafts show loading
    expect(screen.getAllByText('Creating...')).toHaveLength(3);
  });

  it('should handle case where backend jobs are gone after server restart', async () => {
    // Simulate pending jobs that no longer exist on backend
    const stalePendingJobs = ['draft-0-old', 'draft-1-old'];
    
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'pendingCardJobs') return JSON.stringify(stalePendingJobs);
      if (key === 'cardFormData') return JSON.stringify({
        selectedType: 'birthday',
        userEmail: 'test@example.com',
        completedSteps: [1, 2, 3, 4],
        currentStep: 5,
      });
      if (key.startsWith('cardJob_')) {
        return JSON.stringify({
          jobId: key.replace('cardJob_', ''),
          status: 'processing',
          createdAt: Date.now() - 30000,
        });
      }
      return null;
    });

    // Mock API to return not found
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status: 'not_found' }),
    });

    render(<CardWizard />);

    // Should show loading briefly
    expect(screen.getByText(/Creating Your Card/i)).toBeInTheDocument();

    // Then show error and allow restart
    await waitFor(() => {
      expect(screen.getByText(/Ready to Create Your Card/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify localStorage was cleaned up
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('cardJob_draft-0-old');
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('cardJob_draft-1-old');
  });

  it('should properly transition from loading to draft selection when no jobs exist', async () => {
    // No pending jobs
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'pendingCardJobs') return '[]';
      if (key === 'cardFormData') return JSON.stringify({
        selectedType: 'birthday',
        userEmail: 'test@example.com',
        completedSteps: [1, 2, 3, 4],
        currentStep: 5,
      });
      return null;
    });

    render(<CardWizard />);

    // Should show draft selection immediately
    await waitFor(() => {
      expect(screen.getByText(/Ready to Create Your Card/i)).toBeInTheDocument();
      expect(screen.getByText(/Create 5 Front Cover Options/i)).toBeInTheDocument();
    });

    // Should not show loading state
    expect(screen.queryByText(/Creating Your Card/i)).not.toBeInTheDocument();
  });
});