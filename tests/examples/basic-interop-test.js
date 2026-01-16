#!/usr/bin/env node

/**
 * EMV Interoperability Testing - Basic Example
 * 
 * This example demonstrates how to use the EMV Interoperability Testing Framework
 * to test various card-terminal combinations and identify potential issues.
 */

// Import framework components
const {
  // Card Emulators
  CardFactory,
  CardSpecVersion,
  StandardAIDs,
  
  // Terminal Emulators
  TerminalFactory,
  
  // Mobile Emulators
  MobileEmulatorFactory,
  
  // Test Orchestration
  TestOrchestrator,
  TestScenario,
  TestSuite,
  PredefinedScenarios,
  PredefinedSuites,
  
  // Core Components
  TLVParser,
  EMVCommands,
  KernelID
} = require('../../index');

// Helper for console output
const log = {
  header: (msg) => console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[✓] ${msg}`),
  warning: (msg) => console.log(`[⚠] ${msg}`),
  error: (msg) => console.log(`[✗] ${msg}`)
};

/**
 * Example 1: Basic Card-Terminal Transaction Test
 */
async function example1_BasicTransaction() {
  log.header('Example 1: Basic Card-Terminal Transaction');
  
  // Create a Mastercard contactless card
  const card = CardFactory.createMastercardContactless(CardSpecVersion.MC_CTLS_3_1);
  log.info(`Created card: ${card.profile.name} (${card.profile.specVersion})`);
  
  // Create a modern terminal with full kernel support
  const terminal = TerminalFactory.createModernTerminal();
  log.info(`Created terminal: ${terminal.config.name}`);
  
  // Execute a contactless transaction
  log.info('Executing contactless transaction...');
  const result = await terminal.executeContactlessTransaction(card, {
    amount: 2500,  // $25.00
    currencyCode: '0840'
  });
  
  // Display results
  if (result.success) {
    log.success(`Transaction successful!`);
    log.info(`Cryptogram Type: ${result.cryptogramType}`);
    log.info(`Cryptogram: ${result.cryptogram}`);
    log.info(`Total Time: ${result.timings?.totalTime}ms`);
  } else {
    log.error(`Transaction failed`);
    result.errors.forEach(err => log.error(`  ${err.message}`));
  }
  
  // Check for interoperability issues
  if (result.interopIssues && result.interopIssues.length > 0) {
    log.warning(`Found ${result.interopIssues.length} interoperability issues:`);
    result.interopIssues.forEach(issue => {
      log.warning(`  - ${issue.type}: ${issue.message}`);
    });
  }
  
  return result;
}

/**
 * Example 2: C8 Kernel Fallback Test
 */
async function example2_KernelFallback() {
  log.header('Example 2: C8 Kernel Fallback Test');
  
  // Create a C8 card (common kernel)
  const c8Card = CardFactory.createC8Card('MC');
  log.info(`Created C8 card with kernel ID: ${c8Card.profile.kernelId}`);
  
  // Create a legacy terminal that doesn't support C8
  const legacyTerminal = TerminalFactory.createLegacyTerminal();
  log.info(`Created legacy terminal (no C8 support)`);
  log.info(`Supported kernels: ${legacyTerminal.config.supportedKernels.join(', ')}`);
  
  // Execute transaction - should trigger fallback
  log.info('Executing transaction (expecting kernel fallback)...');
  const result = await legacyTerminal.executeContactlessTransaction(c8Card, {
    amount: 1000
  });
  
  // Check for fallback
  const fallbackIssue = result.interopIssues?.find(i => 
    i.type === 'KERNEL_MISMATCH' || i.type === 'C8_NOT_SUPPORTED'
  );
  
  if (fallbackIssue) {
    log.warning('Kernel fallback detected:');
    log.warning(`  ${fallbackIssue.message}`);
    log.info(`  Recommendation: ${fallbackIssue.recommendation}`);
  }
  
  log.info(`Final kernel used: ${result.kernel}`);
  log.info(`Transaction success: ${result.success}`);
  
  return result;
}

/**
 * Example 3: Mobile HCE Payment Test
 */
async function example3_MobilePayment() {
  log.header('Example 3: Mobile HCE (Apple Pay Style) Test');
  
  // Create an Apple Pay emulator
  const applePay = MobileEmulatorFactory.createApplePayEmulator('MASTERCARD');
  log.info(`Created mobile emulator: ${applePay.profile.name}`);
  log.info(`Platform: ${applePay.deviceConfig.platform}`);
  log.info(`Tokenized: ${applePay.profile.isTokenized}`);
  
  // Authenticate device (simulates Face ID / Touch ID)
  const authResult = applePay.authenticateDevice();
  log.info(`Device authentication: ${authResult.method} - ${authResult.success ? 'Success' : 'Failed'}`);
  
  // Create terminal
  const terminal = TerminalFactory.createModernTerminal();
  
  // Execute transaction
  log.info('Executing mobile payment...');
  const result = await terminal.executeContactlessTransaction(applePay, {
    amount: 5000
  });
  
  if (result.success) {
    log.success('Mobile payment successful!');
    
    // Check for PAR (Payment Account Reference)
    const par = result.cardData?.['DF8101'];
    if (par) {
      log.info(`PAR present: ${par.substring(0, 20)}...`);
    }
    
    // Check for FFI (Form Factor Indicator)
    const ffi = result.cardData?.['9F6E'];
    if (ffi) {
      log.info(`FFI (Mobile form factor): ${ffi}`);
    }
  }
  
  return result;
}

/**
 * Example 4: Tap-to-Phone (SoftPOS) Test
 */
async function example4_TapToPhone() {
  log.header('Example 4: Tap-to-Phone (SoftPOS) Test');
  
  // Create a physical card
  const card = CardFactory.createVisaContactless(CardSpecVersion.VISA_CTLS_2_10);
  log.info(`Created physical card: ${card.profile.name}`);
  
  // Create Tap-to-Phone terminal (merchant's phone)
  const ttp = MobileEmulatorFactory.createTapToPhoneEmulator({
    merchantId: 'MERCHANT123',
    terminalId: 'TTP001',
    supportsC8: false
  });
  
  // Initialize TTP
  await ttp.initialize();
  log.info(`TTP initialized - Merchant: ${ttp.merchantId}`);
  
  // Start transaction
  const txn = ttp.startTransaction(1500, '0840');
  log.info(`Transaction started: ${txn.transactionId}`);
  
  // Process card tap
  log.info('Processing card tap...');
  const result = await ttp.processCardTap(card);
  
  if (result.status === 'COMPLETED') {
    log.success('Tap-to-Phone transaction completed!');
    log.info(`Duration: ${result.endTime - result.startTime}ms`);
  } else {
    log.error(`Transaction status: ${result.status}`);
  }
  
  return result;
}

/**
 * Example 5: Using Test Orchestrator with Scenarios
 */
async function example5_TestOrchestrator() {
  log.header('Example 5: Test Orchestrator with Predefined Scenarios');
  
  // Create orchestrator with event handlers
  const orchestrator = new TestOrchestrator({ verbose: true });
  
  orchestrator.on('scenario:start', ({ scenario }) => {
    log.info(`Starting scenario: ${scenario.name}`);
  });
  
  orchestrator.on('scenario:complete', ({ result }) => {
    if (result.status === 'PASSED') {
      log.success(`${result.scenarioName}: PASSED`);
    } else if (result.status === 'FAILED') {
      log.error(`${result.scenarioName}: FAILED`);
    } else {
      log.warning(`${result.scenarioName}: ${result.status}`);
    }
  });
  
  // Run predefined scenarios
  const scenarios = [
    PredefinedScenarios.c8KernelFallback,
    PredefinedScenarios.parFieldHandling,
    PredefinedScenarios.visaLeaningTerminal
  ];
  
  for (const scenario of scenarios) {
    await orchestrator.runScenario(scenario);
  }
  
  // Generate summary report
  const report = orchestrator.generateReport('json');
  const summary = JSON.parse(report).summary;
  
  log.header('Test Summary');
  log.info(`Total: ${summary.total}`);
  log.success(`Passed: ${summary.passed}`);
  log.error(`Failed: ${summary.failed}`);
  log.warning(`Warnings: ${summary.warnings}`);
  log.info(`Pass Rate: ${summary.passRate}`);
  
  return orchestrator.results;
}

/**
 * Example 6: Custom Test Scenario
 */
async function example6_CustomScenario() {
  log.header('Example 6: Custom Test Scenario');
  
  // Create a custom test scenario
  const customScenario = new TestScenario({
    id: 'CUSTOM_001',
    name: 'Custom FFI Validation Test',
    description: 'Tests terminal handling of custom FFI values',
    category: 'CUSTOM',
    tags: ['custom', 'ffi'],
    
    cardConfig: {
      factory: 'mastercard_contactless',
      dataOverrides: {
        '9F6E': 'FF700000'  // Custom FFI value
      }
    },
    
    terminalConfig: {
      factory: 'interop_test',
      scenario: 'STRICT_VALIDATION'
    },
    
    transactionParams: {
      amount: 1000,
      currencyCode: '0840'
    },
    
    expectedOutcome: {
      transactionSuccess: true,
      maxInteropIssues: 2
    },
    
    validationRules: [
      {
        name: 'FFI_PRESENT',
        description: 'Verify FFI is in transaction data',
        validate: (result) => result.cardData?.['9F6E'] !== undefined
      }
    ]
  });
  
  const orchestrator = new TestOrchestrator({ verbose: true });
  const result = await orchestrator.runScenario(customScenario);
  
  log.info(`Scenario: ${result.scenarioName}`);
  log.info(`Status: ${result.status}`);
  log.info(`Validations passed: ${result.validationResults.filter(v => v.passed).length}/${result.validationResults.length}`);
  
  return result;
}

/**
 * Example 7: Low-level APDU Interaction
 */
async function example7_LowLevelAPDU() {
  log.header('Example 7: Low-level APDU Interaction');
  
  const card = CardFactory.createMastercardContactless();
  
  // Step 1: Select PPSE
  log.info('Step 1: SELECT PPSE');
  const selectPPSE = EMVCommands.selectPPSE();
  log.info(`Command: ${selectPPSE.toHex()}`);
  
  const ppseResponse = card.processCommand(selectPPSE);
  log.info(`Response SW: ${ppseResponse.sw.toString(16).toUpperCase()}`);
  
  // Parse PPSE response
  const ppseTLV = TLVParser.parse(ppseResponse.data.toString('hex'));
  log.info('PPSE contains:');
  ppseTLV.forEach(tlv => {
    log.info(`  ${tlv.tagHex}: ${tlv.name}`);
  });
  
  // Step 2: Select Application
  log.info('\nStep 2: SELECT Application');
  const selectApp = EMVCommands.select(StandardAIDs.MASTERCARD_CREDIT);
  const selectResponse = card.processCommand(selectApp);
  log.info(`Response SW: ${selectResponse.sw.toString(16).toUpperCase()}`);
  
  // Step 3: GET PROCESSING OPTIONS
  log.info('\nStep 3: GET PROCESSING OPTIONS');
  const gpoCommand = EMVCommands.getProcessingOptions('8300');
  const gpoResponse = card.processCommand(gpoCommand);
  log.info(`Response SW: ${gpoResponse.sw.toString(16).toUpperCase()}`);
  
  // Parse GPO response
  const gpoTLV = TLVParser.parse(gpoResponse.data.toString('hex'));
  
  // Find AIP and AFL
  const aip = TLVParser.findTag(gpoTLV, '82');
  const afl = TLVParser.findTag(gpoTLV, '94');
  
  if (aip) {
    log.info(`AIP: ${aip.valueHex}`);
  }
  if (afl) {
    log.info(`AFL: ${afl.valueHex}`);
  }
  
  // Step 4: READ RECORD
  log.info('\nStep 4: READ RECORD');
  const readCommand = EMVCommands.readRecord(1, 1);
  const readResponse = card.processCommand(readCommand);
  log.info(`Response SW: ${readResponse.sw.toString(16).toUpperCase()}`);
  
  // Parse record
  const recordTLV = TLVParser.parse(readResponse.data.toString('hex'));
  log.info('Record contains:');
  recordTLV.forEach(tlv => {
    if (tlv.constructed && tlv.children) {
      tlv.children.forEach(child => {
        log.info(`  ${child.tagHex}: ${child.name}`);
      });
    }
  });
  
  return { ppseResponse, selectResponse, gpoResponse, readResponse };
}

/**
 * Main - Run all examples
 */
async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     EMV Interoperability Testing Framework - Examples        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  try {
    // Run examples
    await example1_BasicTransaction();
    await example2_KernelFallback();
    await example3_MobilePayment();
    await example4_TapToPhone();
    await example5_TestOrchestrator();
    await example6_CustomScenario();
    await example7_LowLevelAPDU();
    
    log.header('All Examples Completed Successfully!');
    
  } catch (error) {
    log.error(`Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run examples
main();
