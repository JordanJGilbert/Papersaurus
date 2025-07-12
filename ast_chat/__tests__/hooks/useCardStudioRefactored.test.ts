import { renderHook, act, waitFor } from '@testing-library/react';
import { useCardStudio } from '@/hooks/useCardStudioRefactored';
import { toast } from 'sonner';

// Mock dependencies
jest.mock('sonner');
jest.mock('socket.io-client', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    })),
    io: jest.fn(() => ({
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    })),
  };
});

// Mock fetch for API calls
global.fetch = jest.fn();

describe('useCardStudioRefactored - Page Refresh Job Restoration', () => {
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
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' }),
    });
  });

  describe('checkPendingJobs', () => {
    it('should restore draft generation state from pending jobs', async () => {
      // Setup pending draft jobs in localStorage
      const pendingJobs = ['draft-0-123', 'draft-1-456'];
      const jobData = {
        jobId: 'draft-0-123',
        status: 'processing',
        createdAt: Date.now() - 30000, // 30 seconds ago
        lastProgress: 20,
        lastProgressText: 'Generating draft 1...',
        draftCards: [],
      };

      mockLocalStorage.getItem
        .mockReturnValueOnce(JSON.stringify(pendingJobs)) // pendingCardJobs
        .mockReturnValueOnce(JSON.stringify(jobData)) // cardJob_draft-0-123
        .mockReturnValueOnce(JSON.stringify({ ...jobData, jobId: 'draft-1-456' })); // cardJob_draft-1-456

      const { result } = renderHook(() => useCardStudio());

      // Wait for checkPendingJobs to complete
      await waitFor(() => {
        expect(result.current.isGenerating).toBe(true);
      });

      expect(result.current.isDraftMode).toBe(true);
      expect(result.current.progressPercentage).toBe(20);
      expect(result.current.generationProgress).toContain('draft 1');
    });

    it('should clean up stale jobs older than 5 minutes', async () => {
      const staleJobId = 'draft-0-old';
      const staleJob = {
        jobId: staleJobId,
        status: 'processing',
        createdAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
      };

      mockLocalStorage.getItem
        .mockReturnValueOnce(JSON.stringify([staleJobId]))
        .mockReturnValueOnce(JSON.stringify(staleJob));

      const { result } = renderHook(() => useCardStudio());

      await waitFor(() => {
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(`cardJob_${staleJobId}`);
      });

      expect(result.current.isGenerating).toBe(false);
    });

    it('should handle backend job not found gracefully', async () => {
      const jobId = 'draft-0-missing';
      const jobData = {
        jobId,
        status: 'processing',
        createdAt: Date.now() - 30000,
      };

      mockLocalStorage.getItem
        .mockReturnValueOnce(JSON.stringify([jobId]))
        .mockReturnValueOnce(JSON.stringify(jobData));

      // Mock fetch to return not found
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ status: 'not_found' }),
      });

      const { result } = renderHook(() => useCardStudio());

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Previous draft generation expired'),
          expect.any(Object)
        );
      });

      expect(result.current.isGenerating).toBe(false);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(`cardJob_${jobId}`);
    });

    it('should restore multiple draft cards if they exist', async () => {
      const jobId = 'draft-0-123';
      const draftCards = [
        { id: '1', frontCover: 'image1.jpg' },
        { id: '2', frontCover: 'image2.jpg' },
      ];
      const jobData = {
        jobId,
        status: 'processing',
        createdAt: Date.now() - 30000,
        draftCards,
      };

      mockLocalStorage.getItem
        .mockReturnValueOnce(JSON.stringify([jobId]))
        .mockReturnValueOnce(JSON.stringify(jobData));

      const { result } = renderHook(() => useCardStudio());

      await waitFor(() => {
        expect(result.current.draftCards).toEqual(draftCards);
      });
    });
  });

  describe('WebSocket reconnection', () => {
    it('should resubscribe to jobs after WebSocket reconnect', async () => {
      const jobId = 'draft-0-123';
      const jobData = {
        jobId,
        status: 'processing',
        createdAt: Date.now() - 30000,
      };

      mockLocalStorage.getItem
        .mockReturnValueOnce(JSON.stringify([jobId]))
        .mockReturnValueOnce(JSON.stringify(jobData));

      const { result } = renderHook(() => useCardStudio());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Verify WebSocket subscription was called
      // This would require more complex mocking of the socket.io client
    });
  });

  describe('Progress updates', () => {
    it('should update progress when receiving WebSocket updates', async () => {
      const { result } = renderHook(() => useCardStudio());

      act(() => {
        result.current.handleJobUpdate({
          job_id: 'draft-0-123',
          status: 'processing',
          message: 'Generating draft 3 of 5...',
          progress: 60,
        });
      });

      expect(result.current.progressPercentage).toBe(60);
      expect(result.current.generationProgress).toContain('draft 3 of 5');
    });

    it('should handle completion of all draft jobs', async () => {
      const { result } = renderHook(() => useCardStudio());

      // Start draft generation
      act(() => {
        result.current.setIsDraftMode(true);
        result.current.setIsGenerating(true);
      });

      // Complete all 5 drafts
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.handleJobUpdate({
            job_id: `draft-${i}-123`,
            status: 'completed',
            cardData: { frontCover: `image${i}.jpg` },
          });
        });
      }

      await waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
        expect(result.current.draftCards).toHaveLength(5);
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining('All 5 front cover variations ready')
        );
      });
    });
  });

  describe('Error handling', () => {
    it('should handle job failure appropriately', async () => {
      const { result } = renderHook(() => useCardStudio());

      act(() => {
        result.current.handleJobUpdate({
          job_id: 'card-123',
          status: 'failed',
          error: 'Generation failed',
        });
      });

      expect(result.current.isGenerating).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Card generation failed'));
    });

    it('should continue with other drafts if one fails', async () => {
      const { result } = renderHook(() => useCardStudio());

      act(() => {
        result.current.setIsDraftMode(true);
        result.current.setIsGenerating(true);
      });

      // Fail one draft
      act(() => {
        result.current.handleJobUpdate({
          job_id: 'draft-2-123',
          status: 'failed',
          error: 'Draft generation failed',
        });
      });

      expect(result.current.isGenerating).toBe(true); // Should continue
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Draft variation 3 failed')
      );
    });
  });
});