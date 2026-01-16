/**
 * EMV Interoperability Test Orchestrator
 * 
 * Coordinates testing between card, terminal, and mobile emulators.
 * Runs test scenarios and generates compatibility reports.
 */

const { CardFactory, CardSpecVersion, StandardAIDs } = require('../emulators/card/card-emulator');
const { TerminalFactory } = require('../emulators/terminal/terminal-emulator');
const { MobileEmulatorFactory } = require('../emulators/mobile/mobile-hce-emulator');
const { KernelID } = require('./protocol/emv-engine');

// Test Result Status
const TestStatus = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  WARNING: 'WARNING',
  SKIPPED: 'SKIPPED',
  ERROR: 'ERROR'
};

// Interop Issue Severity
const IssueSeverity = {
  CRITICAL: 'CRITICAL',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

/**
 * Test Scenario Definition
 */
class TestScenario {
  constructor(options = {}) {
    this.id = options.id || `TEST_${Date.now()}`;
    this.name = options.name || 'Unnamed Test';
    this.description = options.description || '';
    this.category = options.category || 'GENERAL';
    this.tags = options.tags || [];
    
    // Components to test
    this.cardConfig = options.cardConfig || null;
    this.terminalConfig = options.terminalConfig || null;
    this.mobileConfig = options.mobileConfig || null;
    
    // Transaction parameters
    this.transactionParams = options.transactionParams || {
      amount: 1000,  // $10.00
      currencyCode: '0840',
      transactionType: 0x00
    };
    
    // Expected outcomes
    this.expectedOutcome = options.expectedOutcome || {
      transactionSuccess: true,
      cryptogramType: null,
      maxInteropIssues: 0
    };
    
    // Validation rules
    this.validationRules = options.validationRules || [];
  }
}

/**
 * Test Result
 */
class TestResult {
  constructor(scenario) {
    this.scenarioId = scenario.id;
    this.scenarioName = scenario.name;
    this.status = TestStatus.SKIPPED;
    this.startTime = null;
    this.endTime = null;
    this.duration = null;
    
    // Transaction result
    this.transactionResult = null;
    
    // Interop issues found
    this.interopIssues = [];
    
    // Validation results
    this.validationResults = [];
    
    // Error information
    this.error = null;
    
    // Detailed logs
    this.logs = [];
  }
  
  addLog(level, message, data = {}) {
    this.logs.push({
      timestamp: Date.now(),
      level,
      message,
      data
    });
  }
  
  calculateStatus() {
    if (this.error) {
      this.status = TestStatus.ERROR;
      return;
    }
    
    const criticalIssues = this.interopIssues.filter(i => i.severity === IssueSeverity.CRITICAL);
    const errorIssues = this.interopIssues.filter(i => i.severity === IssueSeverity.ERROR);
    const failedValidations = this.validationResults.filter(v => !v.passed);
    
    if (criticalIssues.length > 0 || failedValidations.length > 0) {
      this.status = TestStatus.FAILED;
    } else if (errorIssues.length > 0) {
      this.status = TestStatus.WARNING;
    } else {
      this.status = TestStatus.PASSED;
    }
  }
}

/**
 * Test Suite - Collection of related test scenarios
 */
class TestSuite {
  constructor(options = {}) {
    this.id = options.id || `SUITE_${Date.now()}`;
    this.name = options.name || 'Test Suite';
    this.description = options.description || '';
    this.scenarios = options.scenarios || [];
  }
  
  addScenario(scenario) {
    this.scenarios.push(scenario);
  }
}

/**
 * Test Orchestrator
 */
class TestOrchestrator {
  constructor(options = {}) {
    this.options = {
      parallel: false,
      stopOnFailure: false,
      verbose: true,
      generateReport: true,
      ...options
    };
    
    this.results = [];
    this.eventHandlers = new Map();
  }
  
  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }
  
  /**
   * Emit event
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }
  
  /**
   * Run a single test scenario
   */
  async runScenario(scenario) {
    const result = new TestResult(scenario);
    result.startTime = Date.now();
    
    this.emit('scenario:start', { scenario, result });
    
    try {
      // Create emulators based on configuration
      const { card, terminal, mobile } = await this.createEmulators(scenario);
      
      result.addLog('INFO', 'Emulators created', {
        cardType: card?.profile?.name,
        terminalType: terminal?.config?.name,
        mobileType: mobile?.profile?.name
      });
      
      // Determine test type and execute
      let transactionResult;
      
      if (scenario.mobileConfig && scenario.mobileConfig.mode === 'TAP_TO_PHONE') {
        // Test: Card tapping on mobile (TTP) terminal
        transactionResult = await this.executeCardToMobileTest(card, mobile, scenario);
      } else if (scenario.mobileConfig && scenario.terminalConfig) {
        // Test: Mobile tapping on traditional terminal
        transactionResult = await this.executeMobileToTerminalTest(mobile, terminal, scenario);
      } else if (scenario.cardConfig && scenario.terminalConfig) {
        // Test: Card tapping on traditional terminal
        transactionResult = await this.executeCardToTerminalTest(card, terminal, scenario);
      } else {
        throw new Error('Invalid scenario configuration');
      }
      
      result.transactionResult = transactionResult;
      result.interopIssues = transactionResult.interopIssues || [];
      
      // Run validations
      result.validationResults = this.runValidations(scenario, transactionResult);
      
      result.addLog('INFO', 'Transaction completed', {
        success: transactionResult.success,
        cryptogramType: transactionResult.cryptogramType,
        interopIssueCount: result.interopIssues.length
      });
      
    } catch (error) {
      result.error = {
        message: error.message,
        stack: error.stack
      };
      result.addLog('ERROR', 'Test execution failed', { error: error.message });
    }
    
    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;
    result.calculateStatus();
    
    this.results.push(result);
    this.emit('scenario:complete', { scenario, result });
    
    return result;
  }
  
  /**
   * Run a test suite
   */
  async runSuite(suite) {
    this.emit('suite:start', { suite });
    
    const suiteResults = {
      suiteId: suite.id,
      suiteName: suite.name,
      startTime: Date.now(),
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        errors: 0,
        skipped: 0
      }
    };
    
    for (const scenario of suite.scenarios) {
      const result = await this.runScenario(scenario);
      suiteResults.results.push(result);
      
      suiteResults.summary.total++;
      switch (result.status) {
        case TestStatus.PASSED: suiteResults.summary.passed++; break;
        case TestStatus.FAILED: suiteResults.summary.failed++; break;
        case TestStatus.WARNING: suiteResults.summary.warnings++; break;
        case TestStatus.ERROR: suiteResults.summary.errors++; break;
        case TestStatus.SKIPPED: suiteResults.summary.skipped++; break;
      }
      
      if (this.options.stopOnFailure && result.status === TestStatus.FAILED) {
        break;
      }
    }
    
    suiteResults.endTime = Date.now();
    suiteResults.duration = suiteResults.endTime - suiteResults.startTime;
    
    this.emit('suite:complete', { suite, results: suiteResults });
    
    return suiteResults;
  }
  
  /**
   * Create emulators based on scenario configuration
   */
  async createEmulators(scenario) {
    let card = null;
    let terminal = null;
    let mobile = null;
    
    // Create card emulator
    if (scenario.cardConfig) {
      const cfg = scenario.cardConfig;
      
      if (cfg.factory) {
        // Use factory method
        switch (cfg.factory) {
          case 'visa_contactless':
            card = CardFactory.createVisaContactless(cfg.version);
            break;
          case 'mastercard_contactless':
            card = CardFactory.createMastercardContactless(cfg.version);
            break;
          case 'c8_card':
            card = CardFactory.createC8Card(cfg.network);
            break;
          case 'interop_test':
            card = CardFactory.createInteropTestCard(cfg.scenario);
            break;
          default:
            card = CardFactory.createMastercardContactless();
        }
      }
      
      // Apply custom data overrides
      if (cfg.dataOverrides && card) {
        for (const [tag, value] of Object.entries(cfg.dataOverrides)) {
          card.profile.setData(tag, value);
        }
      }
    }
    
    // Create terminal emulator
    if (scenario.terminalConfig) {
      const cfg = scenario.terminalConfig;
      
      if (cfg.factory) {
        switch (cfg.factory) {
          case 'modern':
            terminal = TerminalFactory.createModernTerminal();
            break;
          case 'legacy':
            terminal = TerminalFactory.createLegacyTerminal(cfg.networkPreference);
            break;
          case 'c8_only':
            terminal = TerminalFactory.createC8Terminal();
            break;
          case 'interop_test':
            terminal = TerminalFactory.createInteropTestTerminal(cfg.scenario);
            break;
          default:
            terminal = TerminalFactory.createModernTerminal();
        }
      }
    }
    
    // Create mobile emulator
    if (scenario.mobileConfig) {
      const cfg = scenario.mobileConfig;
      
      if (cfg.factory) {
        switch (cfg.factory) {
          case 'apple_pay':
            mobile = MobileEmulatorFactory.createApplePayEmulator(cfg.network);
            break;
          case 'google_pay':
            mobile = MobileEmulatorFactory.createGooglePayEmulator(cfg.network);
            break;
          case 'tap_to_phone':
            mobile = MobileEmulatorFactory.createTapToPhoneEmulator(cfg);
            break;
          case 'interop_test':
            mobile = MobileEmulatorFactory.createInteropTestMobile(cfg.scenario);
            break;
          default:
            mobile = MobileEmulatorFactory.createApplePayEmulator();
        }
      }
    }
    
    return { card, terminal, mobile };
  }
  
  /**
   * Execute card to terminal test
   */
  async executeCardToTerminalTest(card, terminal, scenario) {
    return await terminal.executeContactlessTransaction(card, scenario.transactionParams);
  }
  
  /**
   * Execute mobile to terminal test
   */
  async executeMobileToTerminalTest(mobile, terminal, scenario) {
    // Authenticate device first
    mobile.authenticateDevice();
    
    return await terminal.executeContactlessTransaction(mobile, scenario.transactionParams);
  }
  
  /**
   * Execute card to mobile (TTP) test
   */
  async executeCardToMobileTest(card, ttpEmulator, scenario) {
    await ttpEmulator.initialize();
    ttpEmulator.startTransaction(
      scenario.transactionParams.amount,
      scenario.transactionParams.currencyCode
    );
    
    const result = await ttpEmulator.processCardTap(card);
    return result.result;
  }
  
  /**
   * Run validation rules against transaction result
   */
  runValidations(scenario, transactionResult) {
    const validationResults = [];
    
    // Built-in validations based on expected outcome
    if (scenario.expectedOutcome) {
      const expected = scenario.expectedOutcome;
      
      // Transaction success validation
      if (expected.transactionSuccess !== undefined) {
        validationResults.push({
          rule: 'TRANSACTION_SUCCESS',
          passed: transactionResult.success === expected.transactionSuccess,
          expected: expected.transactionSuccess,
          actual: transactionResult.success
        });
      }
      
      // Cryptogram type validation
      if (expected.cryptogramType) {
        validationResults.push({
          rule: 'CRYPTOGRAM_TYPE',
          passed: transactionResult.cryptogramType === expected.cryptogramType,
          expected: expected.cryptogramType,
          actual: transactionResult.cryptogramType
        });
      }
      
      // Max interop issues validation
      if (expected.maxInteropIssues !== undefined) {
        const issueCount = (transactionResult.interopIssues || []).length;
        validationResults.push({
          rule: 'MAX_INTEROP_ISSUES',
          passed: issueCount <= expected.maxInteropIssues,
          expected: `<= ${expected.maxInteropIssues}`,
          actual: issueCount
        });
      }
    }
    
    // Custom validation rules
    for (const rule of scenario.validationRules) {
      try {
        const passed = rule.validate(transactionResult);
        validationResults.push({
          rule: rule.name,
          passed,
          description: rule.description
        });
      } catch (error) {
        validationResults.push({
          rule: rule.name,
          passed: false,
          error: error.message
        });
      }
    }
    
    return validationResults;
  }
  
  /**
   * Generate test report
   */
  generateReport(format = 'json') {
    const report = {
      generatedAt: new Date().toISOString(),
      totalTests: this.results.length,
      summary: this.calculateSummary(),
      results: this.results,
      interopIssuesSummary: this.summarizeInteropIssues()
    };
    
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'html':
        return this.generateHTMLReport(report);
      case 'markdown':
        return this.generateMarkdownReport(report);
      default:
        return report;
    }
  }
  
  /**
   * Calculate summary statistics
   */
  calculateSummary() {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.status === TestStatus.PASSED).length,
      failed: this.results.filter(r => r.status === TestStatus.FAILED).length,
      warnings: this.results.filter(r => r.status === TestStatus.WARNING).length,
      errors: this.results.filter(r => r.status === TestStatus.ERROR).length,
      skipped: this.results.filter(r => r.status === TestStatus.SKIPPED).length,
      passRate: this.results.length > 0 
        ? (this.results.filter(r => r.status === TestStatus.PASSED).length / this.results.length * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }
  
  /**
   * Summarize all interop issues found
   */
  summarizeInteropIssues() {
    const allIssues = this.results.flatMap(r => r.interopIssues || []);
    const issuesByType = {};
    
    for (const issue of allIssues) {
      const type = issue.type || 'UNKNOWN';
      if (!issuesByType[type]) {
        issuesByType[type] = {
          count: 0,
          severity: issue.severity,
          examples: []
        };
      }
      issuesByType[type].count++;
      if (issuesByType[type].examples.length < 3) {
        issuesByType[type].examples.push(issue.message);
      }
    }
    
    return {
      totalIssues: allIssues.length,
      bySeverity: {
        critical: allIssues.filter(i => i.severity === IssueSeverity.CRITICAL).length,
        error: allIssues.filter(i => i.severity === IssueSeverity.ERROR).length,
        warning: allIssues.filter(i => i.severity === IssueSeverity.WARNING).length,
        info: allIssues.filter(i => i.severity === IssueSeverity.INFO).length
      },
      byType: issuesByType
    };
  }
  
  /**
   * Generate HTML report
   */
  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>EMV Interoperability Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .passed { color: green; }
    .failed { color: red; }
    .warning { color: orange; }
    .error { color: darkred; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .issue-card { border: 1px solid #ddd; padding: 10px; margin: 10px 0; border-radius: 4px; }
    .severity-CRITICAL { border-left: 4px solid darkred; }
    .severity-ERROR { border-left: 4px solid red; }
    .severity-WARNING { border-left: 4px solid orange; }
    .severity-INFO { border-left: 4px solid blue; }
  </style>
</head>
<body>
  <h1>EMV Interoperability Test Report</h1>
  <p>Generated: ${report.generatedAt}</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Tests: ${report.summary.total}</p>
    <p class="passed">Passed: ${report.summary.passed}</p>
    <p class="failed">Failed: ${report.summary.failed}</p>
    <p class="warning">Warnings: ${report.summary.warnings}</p>
    <p class="error">Errors: ${report.summary.errors}</p>
    <p>Pass Rate: ${report.summary.passRate}</p>
  </div>
  
  <h2>Interoperability Issues Summary</h2>
  <p>Total Issues Found: ${report.interopIssuesSummary.totalIssues}</p>
  <ul>
    <li>Critical: ${report.interopIssuesSummary.bySeverity.critical}</li>
    <li>Error: ${report.interopIssuesSummary.bySeverity.error}</li>
    <li>Warning: ${report.interopIssuesSummary.bySeverity.warning}</li>
    <li>Info: ${report.interopIssuesSummary.bySeverity.info}</li>
  </ul>
  
  <h2>Test Results</h2>
  <table>
    <tr>
      <th>Scenario</th>
      <th>Status</th>
      <th>Duration (ms)</th>
      <th>Issues</th>
    </tr>
    ${report.results.map(r => `
    <tr>
      <td>${r.scenarioName}</td>
      <td class="${r.status.toLowerCase()}">${r.status}</td>
      <td>${r.duration || 'N/A'}</td>
      <td>${(r.interopIssues || []).length}</td>
    </tr>
    `).join('')}
  </table>
  
  <h2>Issue Details by Type</h2>
  ${Object.entries(report.interopIssuesSummary.byType).map(([type, data]) => `
  <div class="issue-card severity-${data.severity}">
    <h3>${type}</h3>
    <p>Count: ${data.count} | Severity: ${data.severity}</p>
    <p>Examples:</p>
    <ul>
      ${data.examples.map(ex => `<li>${ex}</li>`).join('')}
    </ul>
  </div>
  `).join('')}
</body>
</html>`;
  }
  
  /**
   * Generate Markdown report
   */
  generateMarkdownReport(report) {
    return `
# EMV Interoperability Test Report

Generated: ${report.generatedAt}

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${report.summary.total} |
| Passed | ${report.summary.passed} |
| Failed | ${report.summary.failed} |
| Warnings | ${report.summary.warnings} |
| Errors | ${report.summary.errors} |
| Pass Rate | ${report.summary.passRate} |

## Interoperability Issues

Total Issues: ${report.interopIssuesSummary.totalIssues}

- Critical: ${report.interopIssuesSummary.bySeverity.critical}
- Error: ${report.interopIssuesSummary.bySeverity.error}
- Warning: ${report.interopIssuesSummary.bySeverity.warning}
- Info: ${report.interopIssuesSummary.bySeverity.info}

## Test Results

| Scenario | Status | Duration | Issues |
|----------|--------|----------|--------|
${report.results.map(r => `| ${r.scenarioName} | ${r.status} | ${r.duration || 'N/A'}ms | ${(r.interopIssues || []).length} |`).join('\n')}

## Issue Details

${Object.entries(report.interopIssuesSummary.byType).map(([type, data]) => `
### ${type}
- Count: ${data.count}
- Severity: ${data.severity}
- Examples:
${data.examples.map(ex => `  - ${ex}`).join('\n')}
`).join('\n')}
`;
  }
  
  /**
   * Clear all results
   */
  clearResults() {
    this.results = [];
  }
}

/**
 * Pre-built Test Scenarios for common interop testing
 */
const PredefinedScenarios = {
  /**
   * C8 Kernel Fallback Test
   */
  c8KernelFallback: new TestScenario({
    id: 'C8_FALLBACK_001',
    name: 'C8 Kernel Fallback to C2',
    description: 'Tests that a C8 card correctly falls back to C2 kernel on legacy terminal',
    category: 'KERNEL_FALLBACK',
    tags: ['C8', 'fallback', 'legacy'],
    cardConfig: {
      factory: 'c8_card',
      network: 'MC'
    },
    terminalConfig: {
      factory: 'legacy',
      networkPreference: null
    },
    expectedOutcome: {
      transactionSuccess: true,
      maxInteropIssues: 2  // Expected: kernel mismatch warning
    }
  }),
  
  /**
   * PAR Field Handling Test
   */
  parFieldHandling: new TestScenario({
    id: 'PAR_001',
    name: 'PAR Field on Legacy Terminal',
    description: 'Tests that PAR (Payment Account Reference) is handled correctly on legacy terminals',
    category: 'FIELD_VALIDATION',
    tags: ['PAR', 'legacy', 'tokenization'],
    cardConfig: {
      factory: 'interop_test',
      scenario: 'PAR_PRESENT'
    },
    terminalConfig: {
      factory: 'legacy'
    },
    expectedOutcome: {
      transactionSuccess: true
    }
  }),
  
  /**
   * FFI Form Factor Test
   */
  ffiFormFactor: new TestScenario({
    id: 'FFI_001',
    name: 'Non-standard FFI Handling',
    description: 'Tests terminal handling of non-standard Form Factor Indicator values',
    category: 'FIELD_VALIDATION',
    tags: ['FFI', 'form_factor'],
    cardConfig: {
      factory: 'interop_test',
      scenario: 'FFI_NON_STANDARD'
    },
    terminalConfig: {
      factory: 'interop_test',
      scenario: 'STRICT_VALIDATION'
    },
    expectedOutcome: {
      transactionSuccess: true,
      maxInteropIssues: 1
    }
  }),
  
  /**
   * Visa-leaning Terminal with MC Card
   */
  visaLeaningTerminal: new TestScenario({
    id: 'NETWORK_001',
    name: 'Visa-preferring Terminal with Mastercard',
    description: 'Tests that Visa-leaning legacy terminals correctly process Mastercard transactions',
    category: 'NETWORK_INTEROP',
    tags: ['visa', 'mastercard', 'legacy'],
    cardConfig: {
      factory: 'mastercard_contactless',
      version: CardSpecVersion.MC_CTLS_3_1
    },
    terminalConfig: {
      factory: 'interop_test',
      scenario: 'VISA_LEANING_LEGACY'
    },
    expectedOutcome: {
      transactionSuccess: true
    }
  }),
  
  /**
   * Mobile HCE to Legacy Terminal
   */
  mobileToLegacy: new TestScenario({
    id: 'MOBILE_001',
    name: 'Apple Pay on Legacy Terminal',
    description: 'Tests mobile HCE payment on legacy terminal without C8 support',
    category: 'MOBILE_INTEROP',
    tags: ['mobile', 'hce', 'apple_pay', 'legacy'],
    mobileConfig: {
      factory: 'apple_pay',
      network: 'MASTERCARD'
    },
    terminalConfig: {
      factory: 'legacy'
    },
    expectedOutcome: {
      transactionSuccess: true
    }
  }),
  
  /**
   * Card to Tap-to-Phone
   */
  cardToTTP: new TestScenario({
    id: 'TTP_001',
    name: 'Physical Card on Tap-to-Phone',
    description: 'Tests physical card acceptance on mobile Tap-to-Phone terminal',
    category: 'TAP_TO_PHONE',
    tags: ['ttp', 'softpos', 'mobile_acceptance'],
    cardConfig: {
      factory: 'mastercard_contactless',
      version: CardSpecVersion.MC_CTLS_3_1
    },
    mobileConfig: {
      factory: 'tap_to_phone',
      mode: 'TAP_TO_PHONE'
    },
    expectedOutcome: {
      transactionSuccess: true
    }
  }),
  
  /**
   * Mobile to Tap-to-Phone (Mobile-to-Mobile)
   */
  mobileToTTP: new TestScenario({
    id: 'TTP_002',
    name: 'Mobile Wallet on Tap-to-Phone',
    description: 'Tests mobile wallet payment on mobile Tap-to-Phone terminal',
    category: 'TAP_TO_PHONE',
    tags: ['ttp', 'softpos', 'mobile_to_mobile'],
    mobileConfig: {
      factory: 'google_pay',
      network: 'MASTERCARD'
    },
    terminalConfig: null,  // Use TTP as terminal
    expectedOutcome: {
      transactionSuccess: true
    }
  })
};

/**
 * Pre-built Test Suites
 */
const PredefinedSuites = {
  /**
   * Kernel Compatibility Suite
   */
  kernelCompatibility: new TestSuite({
    id: 'SUITE_KERNEL',
    name: 'Kernel Compatibility Tests',
    description: 'Tests kernel fallback and compatibility scenarios',
    scenarios: [
      PredefinedScenarios.c8KernelFallback
    ]
  }),
  
  /**
   * Field Validation Suite
   */
  fieldValidation: new TestSuite({
    id: 'SUITE_FIELDS',
    name: 'Field Validation Tests',
    description: 'Tests field handling and validation across specifications',
    scenarios: [
      PredefinedScenarios.parFieldHandling,
      PredefinedScenarios.ffiFormFactor
    ]
  }),
  
  /**
   * Mobile Interoperability Suite
   */
  mobileInterop: new TestSuite({
    id: 'SUITE_MOBILE',
    name: 'Mobile Interoperability Tests',
    description: 'Tests mobile payment interoperability',
    scenarios: [
      PredefinedScenarios.mobileToLegacy,
      PredefinedScenarios.cardToTTP,
      PredefinedScenarios.mobileToTTP
    ]
  }),
  
  /**
   * Full Interoperability Suite
   */
  fullInterop: new TestSuite({
    id: 'SUITE_FULL',
    name: 'Full Interoperability Test Suite',
    description: 'Comprehensive interoperability testing',
    scenarios: Object.values(PredefinedScenarios)
  })
};

module.exports = {
  TestOrchestrator,
  TestScenario,
  TestSuite,
  TestResult,
  TestStatus,
  IssueSeverity,
  PredefinedScenarios,
  PredefinedSuites
};
