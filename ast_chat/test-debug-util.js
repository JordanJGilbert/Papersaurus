#!/usr/bin/env node

/**
 * Debug utility to test card generation flow and identify issues
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, checks) {
  log(`\nChecking ${filePath}...`, 'cyan');
  
  try {
    const content = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        log(`  ✓ ${check.description}`, 'green');
      } else {
        log(`  ✗ ${check.description}`, 'red');
        if (check.fix) {
          log(`    Fix: ${check.fix}`, 'yellow');
        }
      }
    });
  } catch (error) {
    log(`  ✗ File not found or cannot read`, 'red');
  }
}

// Check critical files for common issues
function runDiagnostics() {
  log('Running VibeCarding Diagnostics...', 'magenta');
  log('================================', 'magenta');
  
  // Check useCardStudioRefactored.ts
  checkFile('hooks/useCardStudioRefactored.ts', [
    {
      pattern: /setProgressPercentage\(100\)/,
      description: 'Sets progress to 100% on completion',
      fix: 'Add setProgressPercentage(100) in handleFinalCardCompletion'
    },
    {
      pattern: /localStorage\.setItem\('lastCompletedCard'/,
      description: 'Saves completed card to localStorage',
      fix: 'Add localStorage save in card completion handler'
    },
    {
      pattern: /setIsCardCompleted\(true\)/,
      description: 'Sets isCardCompleted flag',
      fix: 'Ensure setIsCardCompleted(true) is called on completion'
    }
  ]);
  
  // Check useDraftGeneration.ts
  checkFile('hooks/cardStudio/useDraftGeneration.ts', [
    {
      pattern: /setInterval.*progressPercentage/,
      description: 'Has time-based progress for drafts',
      fix: 'Add setInterval to increment progress'
    },
    {
      pattern: /clearInterval.*progressInterval/,
      description: 'Clears progress interval on completion',
      fix: 'Add clearInterval when generation completes'
    },
    {
      pattern: /2\.2.*per second|2\.2%/,
      description: 'Uses 2.2% increment for draft progress',
      fix: 'Set increment to 2.2 for 45-second average'
    }
  ]);
  
  // Check useCardGeneration.ts  
  checkFile('hooks/cardStudio/useCardGeneration.ts', [
    {
      pattern: /setInterval.*progressPercentage/,
      description: 'Has time-based progress for final cards',
      fix: 'Add setInterval to increment progress'
    },
    {
      pattern: /1\.1.*per second|1\.1%/,
      description: 'Uses 1.1% increment for final card progress',
      fix: 'Set increment to 1.1 for 90-second average'
    },
    {
      pattern: /handleFinalCardCompletion/,
      description: 'Has handleFinalCardCompletion function',
      fix: 'Ensure this function exists and is exported'
    }
  ]);
  
  // Check CardWizardEffects.tsx
  checkFile('components/wizard/CardWizardEffects.tsx', [
    {
      pattern: /restorePendingJobs/,
      description: 'Restores pending jobs on mount',
      fix: 'Add useEffect to check pending jobs'
    },
    {
      pattern: /goToStep\(6\).*isCardCompleted/,
      description: 'Auto-navigates to Step 6 when card completes',
      fix: 'Add navigation logic when card is completed'
    },
    {
      pattern: /lastCompletedCard/,
      description: 'Checks for completed cards in localStorage',
      fix: 'Add localStorage check for completed cards'
    }
  ]);
  
  // Check WebSocket handling
  checkFile('hooks/cardStudio/useWebSocket.ts', [
    {
      pattern: /lastJobUpdateRef/,
      description: 'Has lastJobUpdateRef for stale detection',
      fix: 'Add useRef for tracking last update time'
    },
    {
      pattern: /activeJobIds.*Map/,
      description: 'Uses Map for multiple job subscriptions',
      fix: 'Change activeJobIds to Map type'
    },
    {
      pattern: /reconnection.*exponential/i,
      description: 'Has reconnection with backoff',
      fix: 'Add exponential backoff for reconnection'
    }
  ]);
  
  log('\n\nChecking for common runtime issues...', 'cyan');
  
  // Check for common patterns that cause issues
  const issuePatterns = [
    {
      file: 'hooks/useCardStudioRefactored.ts',
      pattern: /draftGeneration\.setIsGeneratingDrafts/,
      issue: 'Using old method name setIsGeneratingDrafts',
      fix: 'Change to draftGeneration.setIsGenerating'
    },
    {
      file: 'hooks/useCardStudioRefactored.ts',
      pattern: /setProgressPercentage.*message.*progress/,
      issue: 'WebSocket overriding time-based progress',
      fix: 'Comment out WebSocket progress updates'
    },
    {
      file: 'hooks/cardStudio/useDraftGeneration.ts',
      pattern: /draftCards\[draftIndex\]/,
      issue: 'Checking current state instead of updated array',
      fix: 'Count updated array after adding new draft'
    }
  ];
  
  issuePatterns.forEach(({ file, pattern, issue, fix }) => {
    try {
      const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
      if (pattern.test(content)) {
        log(`\n⚠️  ${issue}`, 'yellow');
        log(`   File: ${file}`, 'yellow');
        log(`   Fix: ${fix}`, 'green');
      }
    } catch (error) {
      // Ignore file read errors
    }
  });
  
  log('\n\nTest Commands:', 'magenta');
  log('1. Run unit tests: npm test', 'blue');
  log('2. Run e2e tests: npm test cardGeneration.e2e', 'blue');
  log('3. Test in browser: npm run dev', 'blue');
  log('4. Check WebSocket: Open DevTools > Network > WS', 'blue');
  
  log('\n\nDebug Steps:', 'magenta');
  log('1. Clear localStorage and cookies', 'blue');
  log('2. Open browser DevTools Console', 'blue');
  log('3. Start card generation and watch for:', 'blue');
  log('   - Progress percentage updates', 'cyan');
  log('   - WebSocket messages', 'cyan');
  log('   - Console errors', 'cyan');
  log('   - localStorage saves', 'cyan');
}

// Run diagnostics
runDiagnostics();