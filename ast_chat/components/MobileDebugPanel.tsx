"use client";

import React, { useState, useEffect } from 'react';
import { X, Bug, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface LogEntry {
  id: number;
  type: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: string;
}

export default function MobileDebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV !== 'development') return;

    // Store original console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    // Flag to prevent recursive logging
    let isInternalLog = false;

    // Helper to add log entry
    const addLog = (type: LogEntry['type'], args: any[]) => {
      if (isInternalLog) return; // Prevent recursion
      
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      // Use setTimeout to break out of the React render cycle
      setTimeout(() => {
        isInternalLog = true;
        setLogs(prev => {
          const newLogs = [...prev.slice(-50), { // Keep last 50 logs
            id: Date.now() + Math.random(), // Use timestamp + random for ID
            type,
            message,
            timestamp: new Date().toLocaleTimeString()
          }];
          isInternalLog = false;
          return newLogs;
        });
      }, 0);
    };

    // Override console methods
    console.log = (...args) => {
      originalLog(...args);
      if (!isInternalLog) addLog('log', args);
    };

    console.error = (...args) => {
      originalError(...args);
      if (!isInternalLog) addLog('error', args);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      if (!isInternalLog) addLog('warn', args);
    };

    console.info = (...args) => {
      originalInfo(...args);
      if (!isInternalLog) addLog('info', args);
    };

    // Cleanup
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, []);

  // Don't render in production
  if (process.env.NODE_ENV !== 'development') return null;

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      default: return 'text-gray-300';
    }
  };

  const copyLogsToClipboard = async () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    try {
      await navigator.clipboard.writeText(logText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  return (
    <>
      {/* Floating Debug Button */}
      {!isVisible && (
        <button
          onClick={() => setIsVisible(true)}
          className="fixed bottom-4 right-4 z-50 bg-purple-600 text-white p-3 rounded-full shadow-lg"
        >
          <Bug className="w-5 h-5" />
        </button>
      )}

      {/* Debug Panel */}
      {isVisible && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 ${
          isMinimized ? 'h-12' : 'h-64'
        } transition-all duration-200`}>
          {/* Header */}
          <div className="flex items-center justify-between p-2 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-gray-300">Debug Console</span>
              <span className="text-xs text-gray-500">({logs.length} logs)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 hover:bg-gray-800 rounded"
              >
                {isMinimized ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              <button
                onClick={copyLogsToClipboard}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 flex items-center gap-1"
                disabled={logs.length === 0}
              >
                {isCopied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={() => setLogs([])}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-400"
              >
                Clear
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-1 hover:bg-gray-800 rounded"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Logs */}
          {!isMinimized && (
            <div className="overflow-y-auto h-full pb-12 p-2 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center mt-8">No logs yet...</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="py-1 border-b border-gray-800">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-600 flex-shrink-0">{log.timestamp}</span>
                      <span className={`font-semibold flex-shrink-0 ${getLogColor(log.type)}`}>
                        [{log.type.toUpperCase()}]
                      </span>
                      <pre className="whitespace-pre-wrap break-all text-gray-300 flex-1">
                        {log.message}
                      </pre>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}