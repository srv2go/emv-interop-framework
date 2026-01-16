/**
 * EMV Interop Framework Web UI Server
 * 
 * Provides a user-friendly web interface for:
 * - Configuring test scenarios
 * - Running tests
 * - Viewing results
 * - Managing custom specifications
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const { getSpecLoader } = require('../specifications/spec-loader');
const discoverTests = require('../tests/scenarios/discover-interop-tests');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize specification loader
const specLoader = getSpecLoader();

// API Routes

/**
 * GET /api/specifications
 * Get all loaded specifications
 */
app.get('/api/specifications', (req, res) => {
  try {
    const specs = specLoader.getAllSpecs();
    res.json({
      success: true,
      data: specs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/specifications/custom-directory
 * Get path to custom specifications directory
 */
app.get('/api/specifications/custom-directory', (req, res) => {
  try {
    const directory = specLoader.getSpecDirectory();
    res.json({
      success: true,
      data: { directory }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/specifications/reload
 * Reload all custom specifications
 */
app.post('/api/specifications/reload', (req, res) => {
  try {
    const results = specLoader.loadAllCustomSpecs();
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/test-scenarios
 * Get available test scenarios
 */
app.get('/api/test-scenarios', (req, res) => {
  const scenarios = [
    {
      id: 'dpas10_legacy_c6',
      name: 'D-PAS 1.0 on Legacy C6',
      description: 'Test D-PAS 1.0 card on legacy C6 terminal (e.g., Verifone VX520)',
      cardVersion: 'D-PAS 1.0',
      terminalKernel: 'C6'
    },
    {
      id: 'dpas21_modern_c6',
      name: 'D-PAS 2.1 on Modern C6',
      description: 'Test D-PAS 2.1 card on modern C6 terminal with CDCVM support',
      cardVersion: 'D-PAS 2.1',
      terminalKernel: 'C6'
    },
    {
      id: 'dpas30_c8_fallback',
      name: 'D-PAS 3.0 C8→C6 Fallback',
      description: 'Test C8-ready card falling back to C6 on legacy terminal',
      cardVersion: 'D-PAS 3.0',
      terminalKernel: 'C6 (fallback from C8)'
    },
    {
      id: 'dpas30_c8_terminal',
      name: 'D-PAS 3.0 on C8 Terminal',
      description: 'Test D-PAS 3.0 card on C8-capable terminal',
      cardVersion: 'D-PAS 3.0',
      terminalKernel: 'C8'
    },
    {
      id: 'discover_c8_full',
      name: 'Discover C8 Full',
      description: 'Test full Discover C8 implementation',
      cardVersion: 'C8',
      terminalKernel: 'C8'
    },
    {
      id: 'cross_vendor_matrix',
      name: 'Cross-Vendor Compatibility Matrix',
      description: 'Test all card versions against all terminal vendors',
      cardVersion: 'All',
      terminalKernel: 'All'
    }
  ];

  res.json({
    success: true,
    data: scenarios
  });
});

/**
 * POST /api/test/run
 * Run a specific test scenario
 */
app.post('/api/test/run', async (req, res) => {
  try {
    const { scenarioId } = req.body;

    let result;
    switch (scenarioId) {
      case 'dpas10_legacy_c6':
        result = await discoverTests.testDPAS10_OnLegacyC6();
        break;
      case 'dpas21_modern_c6':
        result = await discoverTests.testDPAS21_OnModernC6();
        break;
      case 'dpas30_c8_fallback':
        result = await discoverTests.testDPAS30_C8FallbackToC6();
        break;
      case 'dpas30_c8_terminal':
        result = await discoverTests.testDPAS30_OnC8Terminal();
        break;
      case 'discover_c8_full':
        result = await discoverTests.testDiscoverC8_OnC8Terminal();
        break;
      case 'cross_vendor_matrix':
        result = await discoverTests.testCrossVendorCompatibility();
        break;
      default:
        throw new Error(`Unknown scenario: ${scenarioId}`);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/test/run-all
 * Run all Discover test scenarios
 */
app.post('/api/test/run-all', async (req, res) => {
  try {
    const results = await discoverTests.runAllDiscoverTests();
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/terminal-vendors
 * Get available terminal vendors
 */
app.get('/api/terminal-vendors', (req, res) => {
  const specs = specLoader.getAllSpecs();
  const vendors = Object.keys(specs.terminals).map(vendorKey => {
    const vendor = specs.terminals[vendorKey];
    return {
      id: vendorKey,
      name: vendor.name,
      models: Object.keys(vendor.models).map(modelKey => ({
        id: modelKey,
        name: modelKey,
        ...vendor.models[modelKey]
      }))
    };
  });

  res.json({
    success: true,
    data: vendors
  });
});

/**
 * GET /api/card-versions
 * Get available card versions
 */
app.get('/api/card-versions', (req, res) => {
  const versions = [
    {
      id: 'dpas_1_0',
      name: 'D-PAS 1.0',
      network: 'Discover',
      kernel: 'C6',
      features: ['Basic D-PAS', 'Legacy']
    },
    {
      id: 'dpas_2_1',
      name: 'D-PAS 2.1',
      network: 'Discover',
      kernel: 'C6',
      features: ['Enhanced CVM', 'CDCVM', 'Mobile HCE']
    },
    {
      id: 'dpas_3_0',
      name: 'D-PAS 3.0',
      network: 'Discover',
      kernel: 'C6',
      features: ['C8 Ready', 'Enhanced CVM', 'CDCVM', 'Fallback Support']
    },
    {
      id: 'discover_c8',
      name: 'Discover C8',
      network: 'Discover',
      kernel: 'C8',
      features: ['Full C8', 'C6 Fallback', 'All CVM Methods']
    }
  ];

  res.json({
    success: true,
    data: versions
  });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║   EMV Interop Framework Web UI                 ║`);
  console.log(`╚════════════════════════════════════════════════╝`);
  console.log(`\n🚀 Server running at: http://localhost:${PORT}`);
  console.log(`📁 Custom specs directory: ${specLoader.getSpecDirectory()}\n`);
});

module.exports = app;
