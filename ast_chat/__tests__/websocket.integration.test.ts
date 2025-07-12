import { renderHook, act } from '@testing-library/react-hooks';
import { useCardStudio } from '@/hooks/useCardStudioRefactored';
import { io } from 'socket.io-client';

// Mock socket instance
let mockSocket: any;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  
  // Create mock socket
  mockSocket = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  };
  
  (io as jest.Mock).mockReturnValue(mockSocket);
});

describe('WebSocket Integration Tests', () => {
  test('Draft generation progress updates correctly', async () => {
    const { result } = renderHook(() => useCardStudio());
    
    // Start draft generation
    act(() => {
      result.current.setUserEmail('test@example.com');
      result.current.setSelectedType('birthday');
      result.current.setSelectedTone('funny');
      result.current.setFinalCardMessage('Happy Birthday!');
    });
    
    await act(async () => {
      await result.current.handleGenerateDraftCards();
    });
    
    // Verify initial state
    expect(result.current.isGenerating).toBe(true);
    expect(result.current.isDraftMode).toBe(true);
    expect(result.current.progressPercentage).toBe(0);
    
    // Simulate time passing (1 second)
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    
    // Progress should have increased
    expect(result.current.progressPercentage).toBeGreaterThan(0);
    expect(result.current.progressPercentage).toBeLessThan(5);
    
    // Simulate draft completion messages
    const jobId = mockSocket.emit.mock.calls.find(call => call[0] === 'subscribe')?.[1]?.id;
    
    for (let i = 0; i < 5; i++) {
      const socketHandler = mockSocket.on.mock.calls.find(call => call[0] === 'job_update')?.[1];
      
      act(() => {
        socketHandler({
          job_id: jobId,
          type: 'draft_complete',
          draft_index: i,
          draft_card: {
            id: `draft-${i}`,
            prompt: 'Test card',
            frontCover: `data:image/jpeg;base64,mock${i}`,
            backCover: '',
            leftPage: '',
            rightPage: '',
            createdAt: new Date()
          }
        });
      });
      
      // Check draft count
      expect(result.current.draftCards.filter(Boolean).length).toBe(i + 1);
    }
    
    // All drafts complete
    const socketHandler = mockSocket.on.mock.calls.find(call => call[0] === 'job_update')?.[1];
    act(() => {
      socketHandler({
        job_id: jobId,
        type: 'all_drafts_complete',
        message: 'All drafts generated'
      });
    });
    
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isDraftMode).toBe(true);
    expect(result.current.draftCards.filter(Boolean).length).toBe(5);
  });
  
  test('Final card generation progress and completion', async () => {
    const { result } = renderHook(() => useCardStudio());
    
    // Set up initial state with selected draft
    act(() => {
      result.current.setUserEmail('test@example.com');
      result.current.setDraftCards([
        { id: 'draft-1', frontCover: 'mock1', prompt: 'Test' },
        null, null, null, null
      ]);
      result.current.setSelectedDraftIndex(0);
      result.current.setIsDraftMode(true);
    });
    
    // Generate final card from draft
    await act(async () => {
      await result.current.handleGenerateFinalFromDraft(0);
    });
    
    // Verify state
    expect(result.current.isGeneratingFinalCard).toBe(true);
    expect(result.current.progressPercentage).toBe(0);
    
    // Simulate time-based progress
    await act(async () => {
      jest.advanceTimersByTime(5000); // 5 seconds
    });
    
    // Progress should be ~5.5% (1.1% per second)
    expect(result.current.progressPercentage).toBeGreaterThan(5);
    expect(result.current.progressPercentage).toBeLessThan(7);
    
    // Simulate card completion
    const jobId = mockSocket.emit.mock.calls.find(call => call[0] === 'subscribe')?.[1]?.id;
    const socketHandler = mockSocket.on.mock.calls.find(call => call[0] === 'job_update')?.[1];
    
    act(() => {
      socketHandler({
        job_id: jobId,
        type: 'card_complete',
        card_data: {
          id: 'final-1',
          prompt: 'Test card',
          frontCover: 'data:image/jpeg;base64,mockFront',
          backCover: 'data:image/jpeg;base64,mockBack',
          leftPage: 'data:image/jpeg;base64,mockLeft',
          rightPage: 'data:image/jpeg;base64,mockRight',
          createdAt: new Date(),
          shareUrl: 'https://vibecarding.com/cards/final-1'
        },
        generationTimeSeconds: 45
      });
    });
    
    // Verify completion
    expect(result.current.isGeneratingFinalCard).toBe(false);
    expect(result.current.isCardCompleted).toBe(true);
    expect(result.current.generatedCard).toBeTruthy();
    expect(result.current.progressPercentage).toBe(100);
    
    // Verify card saved to localStorage
    const savedCard = JSON.parse(localStorage.getItem('lastCompletedCard') || '{}');
    expect(savedCard.id).toBe('final-1');
    expect(savedCard.isFinalCard).toBe(true);
  });
  
  test('Handles disconnection and reconnection', async () => {
    const { result } = renderHook(() => useCardStudio());
    
    // Start generation
    act(() => {
      result.current.setUserEmail('test@example.com');
    });
    
    await act(async () => {
      await result.current.handleGenerateDraftCards();
    });
    
    const jobId = mockSocket.emit.mock.calls.find(call => call[0] === 'subscribe')?.[1]?.id;
    
    // Simulate disconnect
    const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];
    act(() => {
      mockSocket.connected = false;
      disconnectHandler();
    });
    
    // Should attempt reconnection
    expect(mockSocket.connect).toHaveBeenCalled();
    
    // Simulate reconnect
    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
    act(() => {
      mockSocket.connected = true;
      connectHandler();
    });
    
    // Should resubscribe to job
    const resubscribeCalls = mockSocket.emit.mock.calls.filter(call => 
      call[0] === 'subscribe' && call[1]?.id === jobId
    );
    expect(resubscribeCalls.length).toBeGreaterThan(1);
  });
  
  test('Progress continues incrementing during network issues', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useCardStudio());
    
    // Start generation
    act(() => {
      result.current.setUserEmail('test@example.com');
    });
    
    await act(async () => {
      await result.current.handleGenerateDraftCards();
    });
    
    // Initial progress
    expect(result.current.progressPercentage).toBe(0);
    
    // Simulate network delay (no WebSocket updates)
    await act(async () => {
      jest.advanceTimersByTime(10000); // 10 seconds
    });
    
    // Progress should still increment based on time
    expect(result.current.progressPercentage).toBeGreaterThan(20);
    expect(result.current.progressPercentage).toBeLessThan(25);
    
    // Simulate very long delay
    await act(async () => {
      jest.advanceTimersByTime(40000); // 40 more seconds (total 50s)
    });
    
    // Should cap at 95%
    expect(result.current.progressPercentage).toBe(95);
    
    jest.useRealTimers();
  });
});