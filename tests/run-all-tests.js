#!/usr/bin/env node

/**
 * EMV Interoperability Testing Framework - Test Runner
 * 
 * Runs all test suites and generates comprehensive reports.
 */

const fs = require('fs');
const path = require('path');

const {
  TestOrchestrator,
  PredefinedSuites,
  TestStatus
} = require('../core/test-orchestrator');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function runAllTests() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║         EMV Interoperability Testing Framework                    ║', 'cyan');
  log('║                    Full Test Suite Runner                         ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════╝', 'cyan');
  console.log('\n');
  
  const startTime = Date.now();
  const orchestrator = new TestOrchestrator({
    verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
    generateReport: true
  });
  
  // Event handlers
  orchestrator.on('scenario:start', ({ scenario }) => {
    log(`  ▶ ${scenario.name}`, 'blue');
  });
  
  orchestrator.on('scenario:complete', ({ result }) => {
    const icon = result.status === TestStatus.PASSED ? '✓' : 
                 result.status === TestStatus.FAILED ? '✗' :
                 result.status === TestStatus.WARNING ? '⚠' : '○';
    const color = result.status === TestStatus.PASSED ? 'green' : 
                  result.status === TestStatus.FAILED ? 'red' :
                  result.status === TestStatus.WARNING ? 'yellow' : 'reset';
    
    log(`    ${icon} ${result.status} (${result.duration}ms)`, color);
    
    if (result.interopIssues?.length > 0) {
      log(`      ${result.interopIssues.length} interop issues found`, 'yellow');
    }
  });
  
  // Run all predefined suites
  const allResults = [];
  
  for (const [suiteName, suite] of Object.entries(PredefinedSuites)) {
    log(`\n${'─'.repeat(60)}`, 'cyan');
    log(`Running Suite: ${suite.name}`, 'bright');
    log(`${'─'.repeat(60)}`, 'cyan');
    log(`Description: ${suite.description}`);
    log(`Scenarios: ${suite.scenarios.length}\n`);
    
    const results = await orchestrator.runSuite(suite);
    allResults.push({ suiteName, ...results });
  }
  
  const endTime = Date.now();
  const totalDuration = endTime - startTime;
  
  // Print overall summary
  log('\n' + '═'.repeat(60), 'cyan');
  log('                    OVERALL SUMMARY', 'bright');
  log('═'.repeat(60), 'cyan');
  
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;
  let totalErrors = 0;
  
  allResults.forEach(suiteResult => {
    totalTests += suiteResult.summary.total;
    totalPassed += suiteResult.summary.passed;
    totalFailed += suiteResult.summary.failed;
    totalWarnings += suiteResult.summary.warnings;
    totalErrors += suiteResult.summary.errors;
    
    log(`\n${suiteResult.suiteName}:`, 'cyan');
    log(`  Total: ${suiteResult.summary.total} | ` +
        `Passed: ${suiteResult.summary.passed} | ` +
        `Failed: ${suiteResult.summary.failed} | ` +
        `Warnings: ${suiteResult.summary.warnings}`);
  });
  
  log('\n' + '─'.repeat(60));
  log(`TOTAL TESTS:    ${totalTests}`, 'bright');
  log(`PASSED:         ${totalPassed}`, totalPassed > 0 ? 'green' : 'reset');
  log(`FAILED:         ${totalFailed}`, totalFailed > 0 ? 'red' : 'reset');
  log(`WARNINGS:       ${totalWarnings}`, totalWarnings > 0 ? 'yellow' : 'reset');
  log(`ERRORS:         ${totalErrors}`, totalErrors > 0 ? 'red' : 'reset');
  log(`PASS RATE:      ${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0}%`, 'bright');
  log(`TOTAL DURATION: ${totalDuration}ms`);
  log('─'.repeat(60) + '\n');
  
  // Generate reports
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // JSON Report
  const jsonReport = orchestrator.generateReport('json');
  const jsonPath = path.join(reportsDir, `report_${Date.now()}.json`);
  fs.writeFileSync(jsonPath, jsonReport);
  log(`JSON Report: ${jsonPath}`, 'blue');
  
  // HTML Report
  const htmlReport = orchestrator.generateReport('html');
  const htmlPath = path.join(reportsDir, `report_${Date.now()}.html`);
  fs.writeFileSync(htmlPath, htmlReport);
  log(`HTML Report: ${htmlPath}`, 'blue');
  
  // Markdown Report
  const mdReport = orchestrator.generateReport('markdown');
  const mdPath = path.join(reportsDir, `report_${Date.now()}.md`);
  fs.writeFileSync(mdPath, mdReport);
  log(`Markdown Report: ${mdPath}`, 'blue');
  
  console.log('\n');
  
  // Exit with appropriate code
  if (totalFailed > 0 || totalErrors > 0) {
    process.exit(1);
  }
  
  return allResults;
}

// Run tests
runAllTests().catch(err => {
  log(`Error: ${err.message}`, 'red');
  console.error(err.stack);
  process.exit(1);
});
