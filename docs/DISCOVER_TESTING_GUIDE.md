# Discover D-PAS Testing Guide

## Overview

This framework has been enhanced to support comprehensive Discover D-PAS testing with the following capabilities:

- **D-PAS Version Support**: 1.0, 2.1, 3.0, and full C8
- **Kernel Testing**: C6 and C8 with fallback support
- **Terminal Vendors**: Verifone, Ingenico, PAX, First Data (Clover)
- **Custom Specifications**: Load your own card applet and terminal configurations
- **Web UI**: User-friendly interface for non-technical users

## Quick Start

### 1. Using the Web UI (Recommended for Non-Developers)

```bash
# Install dependencies (if not already done)
npm install express cors js-yaml

# Start the web server
npm run ui
```

Then open your browser to: **http://localhost:3000**

The web UI provides:
- ✅ Point-and-click test execution
- ✅ Real-time results visualization
- ✅ Compatibility matrix generation
- ✅ Custom specification management
- ✅ No coding required!

### 2. Using the Command Line (For Developers)

```bash
# Run all Discover tests
npm run test:discover

# Run specific scenario
node tests/scenarios/discover-interop-tests.js

# Run with programmatic API
node
> const { runAllDiscoverTests } = require('./tests/scenarios/discover-interop-tests');
> runAllDiscoverTests();
```

## Supported Test Scenarios

### 1. D-PAS 1.0 on Legacy C6 Terminal
Tests backward compatibility with legacy terminals (e.g., Verifone VX520).

**Use Case**: Ensuring new infrastructure works with oldest deployed cards.

**Expected Behavior**:
- ✅ Transaction approved
- ⚠️ Limited CVM support (No CDCVM)
- ✅ Basic contactless functionality

### 2. D-PAS 2.1 on Modern C6 Terminal
Tests current production cards with enhanced CVM support.

**Use Case**: Standard production testing for current ecosystem.

**Expected Behavior**:
- ✅ Transaction approved
- ✅ CDCVM support (if terminal capable)
- ✅ Mobile HCE compatibility

### 3. D-PAS 3.0 C8 Fallback to C6
Tests C8-ready cards falling back to C6 on legacy terminals.

**Use Case**: Ensuring C8-ready cards work on existing terminal base.

**Expected Behavior**:
- ✅ Card detects terminal lacks C8 support
- ✅ Automatically falls back to C6
- ✅ Transaction completed successfully
- ℹ️ Recommendation to upgrade terminal

### 4. D-PAS 3.0 on C8 Terminal
Tests C8-ready cards on C8-capable terminals.

**Use Case**: Validating C8 implementation with forward compatibility.

**Expected Behavior**:
- ✅ C8 kernel selected
- ✅ Enhanced interoperability features active
- ✅ Full CVM support

### 5. Discover C8 Full Implementation
Tests complete C8 specification with C6 fallback capability.

**Use Case**: Future-proofing for C8 rollout.

**Expected Behavior**:
- ✅ Full C8 feature set
- ✅ C6 fallback path validated
- ✅ Multi-network interoperability

### 6. Cross-Vendor Compatibility Matrix
Tests all card versions against all terminal vendors.

**Use Case**: Comprehensive ecosystem compatibility validation.

**Tested Combinations**:
- D-PAS 1.0, 2.1, 3.0 × Verifone (VX520, VX680, VX820, VX Evolution)
- D-PAS 1.0, 2.1, 3.0 × Ingenico (iCT250, iSC250, Desk/5000, Move/5000)
- D-PAS 1.0, 2.1, 3.0 × PAX (A920, A80)
- D-PAS 1.0, 2.1, 3.0 × First Data (Clover Mini, Clover Flex)

## Adding Custom Specifications

### Method 1: Using the Web UI

1. Navigate to the **Custom Specs** tab
2. Note the custom specifications directory path
3. Open the template files in that directory
4. Modify and save with a new filename
5. Click "Reload Custom Specifications"

### Method 2: Manual File Creation

#### Custom Card Applet

Create a file in `specifications/custom/applets/my-discover-card.json`:

```json
{
  "name": "My Discover D-PAS 2.5",
  "network": "DISCOVER",
  "version": "2.5.0",
  "aid": "A0000001523010",
  "kernelSupport": ["C6"],
  "specifications": {
    "specVersion": "CUSTOM_DPAS_2.5",
    "releaseDate": "2025-01-01",
    "features": ["Enhanced CDCVM", "Custom feature"]
  },
  "staticData": {
    "50": {
      "tag": "50",
      "description": "Application Label",
      "value": "DISCOVER"
    },
    "9F09": {
      "tag": "9F09",
      "description": "Application Version",
      "value": "0025"
    },
    "9F12": {
      "tag": "9F12",
      "description": "Application Preferred Name",
      "value": "DISCOVER"
    },
    "DF8117": {
      "tag": "DF8117",
      "description": "Card Transaction Qualifiers",
      "value": "C080"
    }
  },
  "cvmList": [
    { "method": "CDCVM", "condition": "IF_SUPPORTED" },
    { "method": "NO_CVM", "condition": "IF_UNDER_LIMIT" },
    { "method": "SIGNATURE", "condition": "IF_TERMINAL_SUPPORTS" }
  ],
  "transactionLimits": {
    "cvm": 5000,
    "contactless": 20000
  }
}
```

#### Custom Terminal Profile

Create a file in `specifications/custom/terminals/my-terminal.json`:

```json
{
  "vendor": "MY_VENDOR",
  "name": "My Custom Terminal Vendor",
  "models": {
    "Model-X1000": {
      "kernelSupport": ["C2", "C3", "C6"],
      "firmwareVersions": ["1.0", "1.1"],
      "c8Support": false,
      "c8FallbackSupport": false,
      "contactless": true,
      "contact": true,
      "capabilities": {
        "terminalType": "ATTENDED_ONLINE",
        "terminalCapabilities": "E0F8C8",
        "cvmSupport": ["SIGNATURE", "ONLINE_PIN", "NO_CVM"]
      }
    }
  }
}
```

#### Network Configuration (YAML)

Create a file in `specifications/custom/networks/my-discover-config.yaml`:

```yaml
network: DISCOVER
version: "3.5"

specifications:
  kernelId: C6
  c8Fallback: true
  fallbackPath:
    - C8
    - C6

fieldDefinitions:
  track2Separator: "D"
  panMaxLength: 19
  iadFormat:
    length: 32
    derivationKeyIndex:
      offset: 0
      length: 2
    cryptogramVersion:
      offset: 2
      length: 1

specificTags:
  DPAS_CTQ: "DF8117"
  FFI: "9F6E"

transactionRules:
  cvmThreshold: 5000
  contactlessLimit: 20000
  allowNoCVM: true
```

### Loading Custom Specifications Programmatically

```javascript
const { getSpecLoader } = require('./specifications/spec-loader');

const loader = getSpecLoader();

// Load a specific applet
loader.loadCardApplet('./specifications/custom/applets/my-discover-card.json');

// Load a terminal profile
loader.loadTerminalProfile('./specifications/custom/terminals/my-terminal.json');

// Load all custom specs
const results = loader.loadAllCustomSpecs();
console.log('Loaded:', results);

// Get specific applet
const myApplet = loader.getCardApplet('DISCOVER', '2.5.0');

// Get terminal profile
const myTerminal = loader.getTerminalProfile('MY_VENDOR');
```

## Testing Your Custom Specifications

### Using Custom Applet in Tests

```javascript
const { DiscoverCardEmulator, CardProfile } = require('./emulators/card/discover-card-emulator');
const { getSpecLoader } = require('./specifications/spec-loader');

// Load your custom applet
const loader = getSpecLoader();
const customApplet = loader.getCardApplet('DISCOVER', '2.5.0');

// Create card profile from custom applet
const profile = new CardProfile({
  name: customApplet.name,
  specVersion: customApplet.specifications.specVersion,
  primaryAID: customApplet.aid,
  // ... map other fields from customApplet
});

// Create emulator
const card = new DiscoverCardEmulator(profile);

// Run tests
// ... perform transactions
```

## Terminal Vendor Compatibility

### Supported Vendors and Models

#### Verifone
- **VX520**: C2, C3, C4, C6 (Legacy, no C8)
- **VX680**: C2, C3, C4, C6 (Legacy, no C8)
- **VX820**: C2, C3, C4, C6 (Legacy, no C8)
- **VX Evolution**: C2, C3, C4, C5, C6, C7, **C8** ✅

#### Ingenico
- **iCT250**: C2, C3, C4, C6 (Legacy, no C8)
- **iSC250**: C2, C3, C4, C6 (Legacy, no C8)
- **Desk/5000**: C2, C3, C4, C5, C6, C7, **C8** ✅
- **Move/5000**: C2, C3, C4, C5, C6, C7, **C8** ✅

#### PAX Technology
- **A920**: C2, C3, C4, C5, C6, C7, **C8** ✅
- **A80**: C2, C3, C4, C5, C6, C7, **C8** ✅

#### First Data (Clover)
- **Clover Mini**: C2, C3, C4, C6 (no C8)
- **Clover Flex**: C2, C3, C4, C6 (no C8)

## Troubleshooting

### Common Issues

#### 1. Custom Specification Not Loading

**Symptom**: Custom spec file exists but doesn't appear in the framework

**Solutions**:
- Ensure file is in correct directory (`applets/`, `terminals/`, or `networks/`)
- Check file extension (.json, .yaml, or .yml)
- Verify JSON/YAML syntax is valid
- Don't use `template-` prefix (those are ignored)
- Click "Reload Custom Specifications" in UI or call `loader.loadAllCustomSpecs()`

#### 2. Test Fails on C8 Fallback

**Symptom**: D-PAS 3.0 card doesn't fall back to C6

**Solutions**:
- Verify terminal's `supportedKernels` includes C6
- Check card's `supportsC8` flag is true
- Ensure kernel selection logic in card emulator is working
- Review terminal vendor profile configuration

#### 3. CDCVM Not Working

**Symptom**: CDCVM not performed even though supported

**Solutions**:
- Verify card version is D-PAS 2.1 or higher
- Check terminal capabilities include CDCVM support
- Ensure transaction amount doesn't require higher CVM
- Review CVM list priority in card profile

#### 4. Web UI Not Starting

**Symptom**: `npm run ui` fails or browser can't connect

**Solutions**:
```bash
# Install missing dependencies
npm install express cors js-yaml

# Check if port 3000 is available
# On Windows PowerShell:
Get-NetTCPConnection -LocalPort 3000

# Try different port
PORT=3001 node ui/server.js
```

## API Reference

### Programmatic Usage

```javascript
// Import modules
const { 
  DiscoverCardEmulator, 
  DiscoverCardProfileFactory 
} = require('./emulators/card/discover-card-emulator');

const { TerminalFactory } = require('./emulators/terminal/terminal-emulator');

// Create D-PAS 2.1 card
const card = new DiscoverCardEmulator(
  DiscoverCardProfileFactory.createDPAS_2_1()
);

// Create Verifone VX Evolution terminal
const terminal = TerminalFactory.createFromVendorProfile(
  'VERIFONE', 
  'VX Evolution'
);

// Test kernel selection
const kernel = card.selectKernel(terminal.getConfiguration().supportedKernels);
console.log('Selected kernel:', kernel); // Should be C8 if supported

// Test backward compatibility
const compat = card.testBackwardCompatibility('C6');
console.log('Compatible:', compat.compatible);
console.log('Warnings:', compat.warnings);
```

## Best Practices

### For Testing New Applet Versions

1. **Start with Legacy Compatibility**: Test against oldest supported terminals first
2. **Validate Fallback Paths**: Ensure C8 → C6 fallback works correctly
3. **Test Cross-Vendor**: Don't assume all vendors implement specs identically
4. **Document Deviations**: Note any vendor-specific behaviors in your custom spec
5. **Use Compatibility Matrix**: Run full matrix test before production deployment

### For Production Validation

1. **Test Representative Sample**: Test at least one terminal from each major vendor
2. **Include Edge Cases**: Test transaction limits, CVM thresholds, and fallback scenarios
3. **Verify Cryptogram Types**: Ensure correct TC/ARQC/AAC generation
4. **Check Data Elements**: Validate all mandatory and optional tags
5. **Performance Testing**: Test transaction time and success rates

## Support and Contribution

For questions or issues:
1. Check the **Help** tab in the Web UI
2. Review test output for specific error messages
3. Examine template files for correct specification format
4. Consult EMVCo specifications for tag definitions

## Next Steps

1. ✅ Run the compatibility matrix test to establish baseline
2. ✅ Create custom specification for your specific applet version
3. ✅ Test against all supported terminal vendors
4. ✅ Document any compatibility issues discovered
5. ✅ Use findings to refine applet implementation

---

**Framework Version**: 1.0.0 (Discover Enhanced)  
**Last Updated**: November 28, 2025
