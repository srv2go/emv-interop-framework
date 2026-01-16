/**
 * Discover-Specific Test Scenarios
 * 
 * Test scenarios for:
 * - D-PAS 1.0 on C6 terminals (legacy compatibility)
 * - D-PAS 2.1 on various terminal types
 * - D-PAS 3.0 with C8 fallback to C6
 * - Cross-vendor terminal compatibility (Verifone, Ingenico, PAX)
 */

const { DiscoverCardEmulator, DiscoverCardProfileFactory } = require('../../emulators/card/discover-card-emulator');
const { TerminalEmulator, TerminalFactory } = require('../../emulators/terminal/terminal-emulator');
const { KernelID } = require('../../core/protocol/emv-engine');
const { TerminalVendorProfiles } = require('../../specifications/spec-definitions');

/**
 * Test Scenario: D-PAS 1.0 on Legacy C6 Terminal
 */
async function testDPAS10_OnLegacyC6() {
  console.log('\n=== Test: D-PAS 1.0 on Legacy C6 Terminal ===');
  
  const results = {
    scenario: 'DPAS 1.0 on Legacy C6',
    passed: false,
    warnings: [],
    details: {}
  };

  try {
    // Create D-PAS 1.0 card
    const cardProfile = DiscoverCardProfileFactory.createDPAS_1_0();
    const card = new DiscoverCardEmulator(cardProfile);

    // Create legacy Verifone VX520 terminal (C6 only)
    const terminal = TerminalFactory.createFromVendorProfile(
      'VERIFONE',
      'VX520',
      { supportedKernels: [KernelID.C6] }
    );

    // Perform transaction
    const txResult = await performTransaction(card, terminal, {
      amount: 2500,  // $25.00
      transactionType: 'PURCHASE'
    });

    results.details = txResult;
    results.passed = txResult.approved;
    
    if (!txResult.cdcvmPerformed) {
      results.warnings.push('CDCVM not available on D-PAS 1.0');
    }

  } catch (error) {
    results.passed = false;
    results.error = error.message;
  }

  return results;
}

/**
 * Test Scenario: D-PAS 2.1 on Modern C6 Terminal
 */
async function testDPAS21_OnModernC6() {
  console.log('\n=== Test: D-PAS 2.1 on Modern C6 Terminal ===');
  
  const results = {
    scenario: 'DPAS 2.1 on Modern C6',
    passed: false,
    warnings: [],
    details: {}
  };

  try {
    // Create D-PAS 2.1 card
    const cardProfile = DiscoverCardProfileFactory.createDPAS_2_1();
    const card = new DiscoverCardEmulator(cardProfile);

    // Create Ingenico Desk/5000 terminal (C6 support)
    const terminal = TerminalFactory.createFromVendorProfile(
      'INGENICO',
      'Desk/5000',
      { supportedKernels: [KernelID.C2, KernelID.C3, KernelID.C6] }
    );

    // Perform transaction
    const txResult = await performTransaction(card, terminal, {
      amount: 4500,  // $45.00
      transactionType: 'PURCHASE'
    });

    results.details = txResult;
    results.passed = txResult.approved;
    
    if (txResult.cdcvmPerformed) {
      results.warnings.push('CDCVM performed successfully');
    }

  } catch (error) {
    results.passed = false;
    results.error = error.message;
  }

  return results;
}

/**
 * Test Scenario: D-PAS 3.0 C8 Fallback to C6
 */
async function testDPAS30_C8FallbackToC6() {
  console.log('\n=== Test: D-PAS 3.0 C8 Fallback to C6 ===');
  
  const results = {
    scenario: 'DPAS 3.0 C8 → C6 Fallback',
    passed: false,
    warnings: [],
    details: {}
  };

  try {
    // Create D-PAS 3.0 card (C8 ready)
    const cardProfile = DiscoverCardProfileFactory.createDPAS_3_0();
    const card = new DiscoverCardEmulator(cardProfile);

    // Create legacy terminal without C8 support
    const terminal = TerminalFactory.createFromVendorProfile(
      'VERIFONE',
      'VX820',
      { supportedKernels: [KernelID.C2, KernelID.C3, KernelID.C6] }
    );

    // Card should fall back to C6
    const selectedKernel = card.selectKernel(terminal.config.supportedKernels);
    
    if (selectedKernel !== KernelID.C6) {
      results.warnings.push(`Expected C6, got ${selectedKernel}`);
    }

    // Perform transaction
    const txResult = await performTransaction(card, terminal, {
      amount: 7500,  // $75.00
      transactionType: 'PURCHASE'
    });

    results.details = txResult;
    results.details.kernelUsed = selectedKernel;
    results.passed = txResult.approved && selectedKernel === KernelID.C6;

  } catch (error) {
    results.passed = false;
    results.error = error.message;
  }

  return results;
}

/**
 * Test Scenario: D-PAS 3.0 on C8 Terminal
 */
async function testDPAS30_OnC8Terminal() {
  console.log('\n=== Test: D-PAS 3.0 on C8 Terminal ===');
  
  const results = {
    scenario: 'DPAS 3.0 on C8 Terminal',
    passed: false,
    warnings: [],
    details: {}
  };

  try {
    // Create D-PAS 3.0 card
    const cardProfile = DiscoverCardProfileFactory.createDPAS_3_0();
    const card = new DiscoverCardEmulator(cardProfile);

    // Create C8-capable terminal
    const terminal = TerminalFactory.createFromVendorProfile(
      'PAX',
      'A920',
      { supportedKernels: [KernelID.C2, KernelID.C3, KernelID.C6, KernelID.C8] }
    );

    // Card should prefer C8 when available
    const selectedKernel = card.selectKernel(terminal.config.supportedKernels);
    
    if (selectedKernel !== KernelID.C8) {
      results.warnings.push(`Expected C8, got ${selectedKernel}`);
    }

    // Perform transaction
    const txResult = await performTransaction(card, terminal, {
      amount: 15000,  // $150.00
      transactionType: 'PURCHASE'
    });

    results.details = txResult;
    results.details.kernelUsed = selectedKernel;
    results.passed = txResult.approved;

  } catch (error) {
    results.passed = false;
    results.error = error.message;
  }

  return results;
}

/**
 * Test Scenario: Discover C8 Full on C8 Terminal
 */
async function testDiscoverC8_OnC8Terminal() {
  console.log('\n=== Test: Discover C8 Full on C8 Terminal ===');
  
  const results = {
    scenario: 'Discover C8 on C8 Terminal',
    passed: false,
    warnings: [],
    details: {}
  };

  try {
    // Create full Discover C8 card
    const cardProfile = DiscoverCardProfileFactory.createC8();
    const card = new DiscoverCardEmulator(cardProfile);

    // Create C8-capable terminal
    const terminal = TerminalFactory.createFromVendorProfile(
      'PAX',
      'A920',
      { supportedKernels: [KernelID.C8, KernelID.C6] }
    );

    // Perform transaction
    const txResult = await performTransaction(card, terminal, {
      amount: 20000,  // $200.00
      transactionType: 'PURCHASE'
    });

    results.details = txResult;
    results.passed = txResult.approved;

  } catch (error) {
    results.passed = false;
    results.error = error.message;
  }

  return results;
}

/**
 * Test Scenario: Cross-Vendor Terminal Compatibility Matrix
 */
async function testCrossVendorCompatibility() {
  console.log('\n=== Test: Cross-Vendor Terminal Compatibility ===');
  
  const results = {
    scenario: 'Cross-Vendor Compatibility Matrix',
    matrix: {},
    summary: { passed: 0, failed: 0, warnings: 0 }
  };

  const cardVersions = [
    { name: 'DPAS 1.0', factory: DiscoverCardProfileFactory.createDPAS_1_0 },
    { name: 'DPAS 2.1', factory: DiscoverCardProfileFactory.createDPAS_2_1 },
    { name: 'DPAS 3.0', factory: DiscoverCardProfileFactory.createDPAS_3_0 }
  ];

  const terminals = [
    { vendor: 'VERIFONE', model: 'VX520', kernels: [KernelID.C6] },
    { vendor: 'VERIFONE', model: 'VX Evolution', kernels: [KernelID.C6, KernelID.C8] },
    { vendor: 'INGENICO', model: 'iCT250', kernels: [KernelID.C6] },
    { vendor: 'INGENICO', model: 'Desk/5000', kernels: [KernelID.C6, KernelID.C8] },
    { vendor: 'PAX', model: 'A920', kernels: [KernelID.C6, KernelID.C8] }
  ];

  for (const cardSpec of cardVersions) {
    results.matrix[cardSpec.name] = {};

    for (const termSpec of terminals) {
      const testKey = `${termSpec.vendor} ${termSpec.model}`;
      
      try {
        const cardProfile = cardSpec.factory();
        const card = new DiscoverCardEmulator(cardProfile);
        
        const terminal = TerminalFactory.createFromVendorProfile(
          termSpec.vendor,
          termSpec.model,
          { supportedKernels: termSpec.kernels }
        );

        const txResult = await performTransaction(card, terminal, {
          amount: 3500,
          transactionType: 'PURCHASE'
        });

        results.matrix[cardSpec.name][testKey] = {
          passed: txResult.approved,
          kernel: txResult.kernelUsed || 'N/A',
          warnings: txResult.warnings || []
        };

        if (txResult.approved) {
          results.summary.passed++;
        } else {
          results.summary.failed++;
        }

      } catch (error) {
        results.matrix[cardSpec.name][testKey] = {
          passed: false,
          error: error.message
        };
        results.summary.failed++;
      }
    }
  }

  return results;
}

/**
 * Helper: Perform a simulated transaction
 */
async function performTransaction(card, terminal, txConfig) {
  // Simulated transaction logic
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = {
        approved: true,
        amount: txConfig.amount,
        transactionType: txConfig.transactionType,
        kernelUsed: card.selectKernel(terminal.config.supportedKernels),
        cdcvmPerformed: false,
        cryptogramType: 'TC',
        warnings: []
      };

      // Simulate compatibility checks
      const compatCheck = card.testBackwardCompatibility(
        result.kernelUsed || 'C6'
      );

      if (!compatCheck.compatible) {
        result.approved = false;
        result.warnings = compatCheck.warnings;
      }

      resolve(result);
    }, 100);
  });
}

/**
 * Run all Discover test scenarios
 */
async function runAllDiscoverTests() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   DISCOVER D-PAS INTEROPERABILITY TEST SUITE   ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const allResults = [];

  // Run individual tests
  allResults.push(await testDPAS10_OnLegacyC6());
  allResults.push(await testDPAS21_OnModernC6());
  allResults.push(await testDPAS30_C8FallbackToC6());
  allResults.push(await testDPAS30_OnC8Terminal());
  allResults.push(await testDiscoverC8_OnC8Terminal());

  // Run compatibility matrix
  const matrixResults = await testCrossVendorCompatibility();
  allResults.push(matrixResults);

  // Generate summary
  const passedCount = allResults.filter(r => {
    // For matrix results, check if summary.passed > 0
    if (r.summary) {
      return r.summary.passed > 0 && r.summary.failed === 0;
    }
    // For regular results, check passed flag
    return r.passed === true;
  }).length;
  
  const failedCount = allResults.filter(r => {
    if (r.summary) {
      return r.summary.failed > 0;
    }
    return r.passed === false || r.error;
  }).length;

  const summary = {
    totalTests: allResults.length,
    passed: passedCount,
    failed: failedCount,
    timestamp: new Date().toISOString(),
    results: allResults
  };

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║              TEST SUMMARY                      ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`Total Scenarios: ${summary.totalTests}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);

  return summary;
}

module.exports = {
  testDPAS10_OnLegacyC6,
  testDPAS21_OnModernC6,
  testDPAS30_C8FallbackToC6,
  testDPAS30_OnC8Terminal,
  testDiscoverC8_OnC8Terminal,
  testCrossVendorCompatibility,
  runAllDiscoverTests
};
