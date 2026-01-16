#!/usr/bin/env node

/**
 * Discover Test Runner
 * 
 * Simple script to run Discover D-PAS test scenarios
 */

// Check if running as main module
if (require.main === module) {
  const discoverTests = require('./scenarios/discover-interop-tests');
  
  console.log('\nStarting Discover D-PAS Test Suite...\n');
  
  discoverTests.runAllDiscoverTests()
    .then(results => {
      console.log('\n✅ Test suite completed!');
      console.log(`Total: ${results.totalTests}, Passed: ${results.passed}, Failed: ${results.failed}`);
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}
