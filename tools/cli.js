#!/usr/bin/env node

/**
 * EMV Interoperability Testing Framework CLI
 * 
 * Command-line interface for running interoperability tests,
 * generating reports, and managing test configurations.
 */

const fs = require('fs');
const path = require('path');

// Import framework components
const { 
  TestOrchestrator, 
  TestScenario, 
  TestSuite,
  PredefinedScenarios,
  PredefinedSuites 
} = require('../core/test-orchestrator');

const { CardFactory, CardSpecVersion } = require('../emulators/card/card-emulator');
const { TerminalFactory } = require('../emulators/terminal/terminal-emulator');
const { MobileEmulatorFactory } = require('../emulators/mobile/mobile-hce-emulator');
const { KernelSpecifications } = require('../specifications/spec-definitions');

// CLI Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// CLI Helper Functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('\n' + '='.repeat(60));
  log(message, 'bright');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

// CLI Commands
const commands = {
  /**
   * Run predefined test suite
   */
  async runSuite(suiteName, options) {
    logHeader(`Running Test Suite: ${suiteName}`);
    
    const suite = PredefinedSuites[suiteName];
    if (!suite) {
      logError(`Unknown suite: ${suiteName}`);
      logInfo(`Available suites: ${Object.keys(PredefinedSuites).join(', ')}`);
      return;
    }
    
    const orchestrator = new TestOrchestrator({
      verbose: options.verbose,
      stopOnFailure: options.stopOnFailure
    });
    
    // Register event handlers
    orchestrator.on('scenario:start', ({ scenario }) => {
      logInfo(`Starting: ${scenario.name}`);
    });
    
    orchestrator.on('scenario:complete', ({ result }) => {
      if (result.status === 'PASSED') {
        logSuccess(`${result.scenarioName}: PASSED (${result.duration}ms)`);
      } else if (result.status === 'FAILED') {
        logError(`${result.scenarioName}: FAILED`);
        if (result.error) {
          logError(`  Error: ${result.error.message}`);
        }
      } else if (result.status === 'WARNING') {
        logWarning(`${result.scenarioName}: WARNING (${result.interopIssues.length} issues)`);
      }
    });
    
    const results = await orchestrator.runSuite(suite);
    
    // Print summary
    logHeader('Test Results Summary');
    console.log(`Total Tests: ${results.summary.total}`);
    logSuccess(`Passed: ${results.summary.passed}`);
    logError(`Failed: ${results.summary.failed}`);
    logWarning(`Warnings: ${results.summary.warnings}`);
    console.log(`Duration: ${results.duration}ms`);
    
    // Generate report if requested
    if (options.report) {
      const report = orchestrator.generateReport(options.reportFormat || 'json');
      const reportPath = options.reportPath || `./reports/report_${Date.now()}.${options.reportFormat || 'json'}`;
      
      // Ensure directory exists
      const dir = path.dirname(reportPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, report);
      logInfo(`Report saved to: ${reportPath}`);
    }
    
    return results;
  },
  
  /**
   * Run a single predefined scenario
   */
  async runScenario(scenarioName, options) {
    logHeader(`Running Scenario: ${scenarioName}`);
    
    const scenario = PredefinedScenarios[scenarioName];
    if (!scenario) {
      logError(`Unknown scenario: ${scenarioName}`);
      logInfo(`Available scenarios: ${Object.keys(PredefinedScenarios).join(', ')}`);
      return;
    }
    
    const orchestrator = new TestOrchestrator({ verbose: options.verbose });
    const result = await orchestrator.runScenario(scenario);
    
    // Print detailed result
    logHeader('Scenario Result');
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.duration}ms`);
    
    if (result.interopIssues.length > 0) {
      logHeader('Interoperability Issues Found');
      result.interopIssues.forEach((issue, i) => {
        console.log(`\n${i + 1}. ${issue.type}`);
        console.log(`   Severity: ${issue.severity}`);
        console.log(`   Message: ${issue.message}`);
        if (issue.recommendation) {
          console.log(`   Recommendation: ${issue.recommendation}`);
        }
      });
    }
    
    if (result.validationResults.length > 0) {
      logHeader('Validation Results');
      result.validationResults.forEach(v => {
        if (v.passed) {
          logSuccess(`${v.rule}: PASSED`);
        } else {
          logError(`${v.rule}: FAILED (expected: ${v.expected}, actual: ${v.actual})`);
        }
      });
    }
    
    return result;
  },
  
  /**
   * Run a custom test configuration
   */
  async runCustom(configPath, options) {
    logHeader(`Running Custom Test: ${configPath}`);
    
    if (!fs.existsSync(configPath)) {
      logError(`Config file not found: ${configPath}`);
      return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const scenario = new TestScenario(config);
    
    const orchestrator = new TestOrchestrator({ verbose: options.verbose });
    const result = await orchestrator.runScenario(scenario);
    
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  /**
   * Generate compatibility matrix
   */
  async generateMatrix(options) {
    logHeader('Generating Compatibility Matrix');
    
    const matrix = {
      generatedAt: new Date().toISOString(),
      cardSpecs: [],
      terminalConfigs: [],
      results: []
    };
    
    // Define test matrix
    const cardConfigs = [
      { name: 'Visa CTLS 2.10', factory: 'visa_contactless', version: CardSpecVersion.VISA_CTLS_2_10 },
      { name: 'MC CTLS 3.1', factory: 'mastercard_contactless', version: CardSpecVersion.MC_CTLS_3_1 },
      { name: 'C8 Card', factory: 'c8_card', network: 'MC' }
    ];
    
    const terminalConfigs = [
      { name: 'Modern Terminal', factory: 'modern' },
      { name: 'Legacy Terminal', factory: 'legacy' },
      { name: 'C8 Terminal', factory: 'c8_only' }
    ];
    
    matrix.cardSpecs = cardConfigs.map(c => c.name);
    matrix.terminalConfigs = terminalConfigs.map(t => t.name);
    
    const orchestrator = new TestOrchestrator({ verbose: false });
    
    for (const cardCfg of cardConfigs) {
      for (const termCfg of terminalConfigs) {
        logInfo(`Testing: ${cardCfg.name} -> ${termCfg.name}`);
        
        const scenario = new TestScenario({
          id: `MATRIX_${cardCfg.name}_${termCfg.name}`,
          name: `${cardCfg.name} on ${termCfg.name}`,
          cardConfig: cardCfg,
          terminalConfig: termCfg,
          transactionParams: { amount: 1000, currencyCode: '0840' }
        });
        
        const result = await orchestrator.runScenario(scenario);
        
        matrix.results.push({
          card: cardCfg.name,
          terminal: termCfg.name,
          success: result.transactionResult?.success || false,
          status: result.status,
          issues: result.interopIssues.length
        });
      }
    }
    
    // Print matrix
    logHeader('Compatibility Matrix');
    console.log('\n' + ' '.repeat(20) + matrix.terminalConfigs.join(' | '));
    console.log('-'.repeat(80));
    
    for (const cardSpec of matrix.cardSpecs) {
      const row = matrix.results.filter(r => r.card === cardSpec);
      const cells = row.map(r => {
        if (r.success && r.issues === 0) return '  ✓  ';
        if (r.success && r.issues > 0) return ` ⚠${r.issues}  `;
        return '  ✗  ';
      });
      console.log(cardSpec.padEnd(20) + cells.join(' | '));
    }
    
    // Save if requested
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(matrix, null, 2));
      logInfo(`Matrix saved to: ${options.output}`);
    }
    
    return matrix;
  },
  
  /**
   * List available tests
   */
  listTests() {
    logHeader('Available Test Scenarios');
    Object.entries(PredefinedScenarios).forEach(([key, scenario]) => {
      console.log(`\n${colors.cyan}${key}${colors.reset}`);
      console.log(`  Name: ${scenario.name}`);
      console.log(`  Category: ${scenario.category}`);
      console.log(`  Description: ${scenario.description}`);
      if (scenario.tags.length > 0) {
        console.log(`  Tags: ${scenario.tags.join(', ')}`);
      }
    });
    
    logHeader('Available Test Suites');
    Object.entries(PredefinedSuites).forEach(([key, suite]) => {
      console.log(`\n${colors.cyan}${key}${colors.reset}`);
      console.log(`  Name: ${suite.name}`);
      console.log(`  Description: ${suite.description}`);
      console.log(`  Scenarios: ${suite.scenarios.length}`);
    });
  },
  
  /**
   * List kernel specifications
   */
  listKernels() {
    logHeader('EMV Kernel Specifications');
    
    Object.entries(KernelSpecifications).forEach(([id, spec]) => {
      console.log(`\n${colors.cyan}${id} - ${spec.name}${colors.reset}`);
      console.log(`  Network: ${spec.network}`);
      console.log(`  Versions:`);
      Object.entries(spec.versions).forEach(([ver, info]) => {
        const status = info.deprecated ? '(deprecated)' : '';
        console.log(`    ${ver}: ${info.releaseDate} ${status}`);
        console.log(`      Features: ${info.features.join(', ')}`);
      });
      if (spec.fallbackKernels) {
        console.log(`  Fallback Kernels: ${spec.fallbackKernels.join(', ')}`);
      }
    });
  },
  
  /**
   * Interactive APDU testing
   */
  async interactiveTest(options) {
    logHeader('Interactive APDU Test Mode');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Create default card and terminal
    const card = CardFactory.createMastercardContactless();
    logInfo('Created Mastercard contactless card emulator');
    
    console.log('\nAvailable commands:');
    console.log('  SELECT <AID>     - Select application');
    console.log('  GPO              - Get Processing Options');
    console.log('  READ <SFI> <REC> - Read Record');
    console.log('  APDU <hex>       - Send raw APDU');
    console.log('  RESET            - Reset card state');
    console.log('  EXIT             - Exit interactive mode');
    
    const { CommandAPDU, ResponseAPDU, EMVCommands } = require('../core/apdu/apdu-handler');
    
    const prompt = () => {
      rl.question('\nAPDU> ', async (input) => {
        const parts = input.trim().split(' ');
        const cmd = parts[0].toUpperCase();
        
        try {
          let response;
          
          switch (cmd) {
            case 'SELECT':
              response = card.processCommand(EMVCommands.select(parts[1] || '325041592E5359532E4444463031'));
              break;
              
            case 'GPO':
              response = card.processCommand(EMVCommands.getProcessingOptions('8300'));
              break;
              
            case 'READ':
              const sfi = parseInt(parts[1]) || 1;
              const rec = parseInt(parts[2]) || 1;
              response = card.processCommand(EMVCommands.readRecord(rec, sfi));
              break;
              
            case 'APDU':
              response = card.processCommand(parts.slice(1).join(''));
              break;
              
            case 'RESET':
              card.reset();
              logInfo('Card state reset');
              prompt();
              return;
              
            case 'EXIT':
              rl.close();
              return;
              
            default:
              logError('Unknown command');
              prompt();
              return;
          }
          
          // Display response
          console.log(`Response: ${response.toHex()}`);
          console.log(`SW: ${response.sw.toString(16).toUpperCase()} (${response.getStatusDescription()})`);
          
          if (response.data.length > 0) {
            console.log(`Data: ${response.data.toString('hex').toUpperCase()}`);
            
            // Try to parse as TLV
            try {
              const { TLVParser } = require('../core/tlv/tlv-parser');
              const tlv = TLVParser.parse(response.data.toString('hex'));
              console.log('Parsed TLV:');
              tlv.forEach(t => {
                console.log(`  ${t.tagHex}: ${t.name} = ${t.valueHex}`);
              });
            } catch (e) {
              // Not valid TLV, ignore
            }
          }
          
        } catch (error) {
          logError(`Error: ${error.message}`);
        }
        
        prompt();
      });
    };
    
    prompt();
  },
  
  /**
   * Show help
   */
  help() {
    console.log(`
${colors.bright}EMV Interoperability Testing Framework CLI${colors.reset}

Usage: emv-interop <command> [options]

Commands:
  run-suite <name>       Run a predefined test suite
  run-scenario <name>    Run a single predefined scenario
  run-custom <config>    Run tests from a JSON config file
  matrix                 Generate compatibility matrix
  list-tests             List available tests and suites
  list-kernels           List kernel specifications
  interactive            Start interactive APDU testing
  help                   Show this help message

Options:
  --verbose, -v          Enable verbose output
  --report, -r           Generate test report
  --report-format <fmt>  Report format (json, html, markdown)
  --report-path <path>   Report output path
  --stop-on-failure      Stop suite on first failure
  --output, -o <path>    Output path for matrix

Examples:
  emv-interop run-suite fullInterop --report --report-format html
  emv-interop run-scenario c8KernelFallback -v
  emv-interop matrix -o matrix.json
  emv-interop interactive
`);
  }
};

// Parse command line arguments
function parseArgs(args) {
  const options = {
    verbose: false,
    report: false,
    reportFormat: 'json',
    reportPath: null,
    stopOnFailure: false,
    output: null
  };
  
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--report' || arg === '-r') {
      options.report = true;
    } else if (arg === '--report-format') {
      options.reportFormat = args[++i];
    } else if (arg === '--report-path') {
      options.reportPath = args[++i];
    } else if (arg === '--stop-on-failure') {
      options.stopOnFailure = true;
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else {
      positional.push(arg);
    }
  }
  
  return { positional, options };
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    commands.help();
    return;
  }
  
  const { positional, options } = parseArgs(args);
  const command = positional[0];
  
  try {
    switch (command) {
      case 'run-suite':
        await commands.runSuite(positional[1], options);
        break;
        
      case 'run-scenario':
        await commands.runScenario(positional[1], options);
        break;
        
      case 'run-custom':
        await commands.runCustom(positional[1], options);
        break;
        
      case 'matrix':
        await commands.generateMatrix(options);
        break;
        
      case 'list-tests':
        commands.listTests();
        break;
        
      case 'list-kernels':
        commands.listKernels();
        break;
        
      case 'interactive':
        await commands.interactiveTest(options);
        break;
        
      case 'help':
      default:
        commands.help();
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { commands, parseArgs };

// Run if called directly
if (require.main === module) {
  main();
}
