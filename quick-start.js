#!/usr/bin/env node

/**
 * Quick Start Demo
 * 
 * Demonstrates Discover D-PAS testing capabilities
 */

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   EMV Interop Framework - Discover D-PAS Quick Start Demo     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

Welcome to the enhanced EMV Interoperability Testing Framework!

This framework now includes comprehensive Discover D-PAS support with:
  ✅ D-PAS 1.0, 2.1, 3.0, and C8 card emulators
  ✅ Terminal vendor profiles (Verifone, Ingenico, PAX, etc.)
  ✅ C8 → C6 fallback testing
  ✅ Custom specification loading (JSON/YAML)
  ✅ User-friendly Web UI

═══════════════════════════════════════════════════════════════

OPTION 1: Web UI (Recommended for Non-Developers)
-------------------------------------------------
Run the following command:

    npm run ui

Then open your browser to: http://localhost:3000

The Web UI provides:
  • Point-and-click test execution
  • Real-time results visualization
  • Custom specification management
  • Compatibility matrix generation
  • Built-in help and documentation

═══════════════════════════════════════════════════════════════

OPTION 2: Command Line (For Developers)
----------------------------------------
Run Discover test suite:

    npm run test:discover

Run all tests:

    npm test

Generate compatibility matrix:

    npm run test:matrix

═══════════════════════════════════════════════════════════════

ADDING CUSTOM SPECIFICATIONS
-----------------------------
1. Navigate to: specifications/custom/
2. Edit template files in:
   • applets/      (for card specifications)
   • terminals/    (for terminal profiles)
   • networks/     (for network configs)
3. Reload specs via Web UI or restart framework

═══════════════════════════════════════════════════════════════

DOCUMENTATION
-------------
• Complete Guide: docs/DISCOVER_TESTING_GUIDE.md
• Enhancement Summary: docs/DISCOVER_ENHANCEMENT_SUMMARY.md
• Web UI: http://localhost:3000 (Help tab)

═══════════════════════════════════════════════════════════════

QUICK TEST EXAMPLES
-------------------
`);

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Would you like to:\n  1) Launch Web UI\n  2) Run Discover Test Suite\n  3) Exit\n\nEnter choice (1-3): ', (answer) => {
  rl.close();
  
  const choice = answer.trim();
  
  if (choice === '1') {
    console.log('\n🚀 Launching Web UI...\n');
    require('./ui/server.js');
  } else if (choice === '2') {
    console.log('\n🧪 Running Discover Test Suite...\n');
    require('./tests/run-discover-tests.js');
  } else {
    console.log('\n👋 For more information, see: docs/DISCOVER_TESTING_GUIDE.md\n');
    process.exit(0);
  }
});
