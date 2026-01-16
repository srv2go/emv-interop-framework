# EMV Interoperability Testing Framework - Architecture Guide

## Overview

This framework enables testing of EMV payment specification interoperability across:
- **Card Specifications**: Contact/Contactless applets (Visa, Mastercard, Amex, Discover, JCB, UnionPay)
- **Terminal Kernels**: C2 through C8 (including common contactless kernel)
- **Mobile Payments**: Apple Pay, Google Pay, and Tap-on-Phone (SoftPOS) solutions

## Directory Structure

```
emv-interop-framework/
├── core/                          # Core protocol implementations
│   ├── tlv/tlv-parser.js          # TLV encoding/decoding (BER-TLV)
│   ├── apdu/apdu-handler.js       # APDU command/response handling
│   ├── protocol/emv-engine.js     # EMV transaction state machine
│   └── test-orchestrator.js       # Test execution and reporting
├── emulators/                     # Hardware emulators
│   ├── card/card-emulator.js      # Card/applet emulation
│   ├── terminal/terminal-emulator.js  # Terminal emulation
│   └── mobile/mobile-hce-emulator.js  # Mobile HCE emulation
├── specifications/                # EMV specification definitions
│   └── spec-definitions.js        # Kernel specs, field definitions
├── tests/                         # Test files
│   ├── examples/                  # Example test scripts
│   └── run-all-tests.js           # Full test runner
├── tools/                         # CLI tools
│   └── cli.js                     # Command-line interface
├── config/                        # Configuration
│   └── default.yaml               # Default settings
├── index.js                       # Main entry point
└── package.json                   # Dependencies
```

## Key Components

### 1. TLV Parser (`core/tlv/tlv-parser.js`)
Handles BER-TLV encoding per ISO/IEC 7816-4:
- `TLVParser.parse()` - Parse hex string to TLV objects
- `TLVBuilder` - Construct TLV data
- `DOLParser` - Parse Data Object Lists (PDOL, CDOL)

### 2. APDU Handler (`core/apdu/apdu-handler.js`)
ISO 7816-4 APDU processing:
- `CommandAPDU` / `ResponseAPDU` - APDU objects
- `EMVCommands` - Pre-built commands (SELECT, GPO, READ RECORD, etc.)
- Status word handling and validation

### 3. EMV Protocol Engine (`core/protocol/emv-engine.js`)
Transaction state machine:
- States: IDLE → SELECT → GPO → READ → ODA → CVM → AC → COMPLETE
- Interoperability issue detection
- Kernel fallback handling
- Timing analysis

### 4. Test Orchestrator (`core/test-orchestrator.js`)
Test execution framework:
- `TestScenario` - Test case definition
- `TestSuite` - Group of scenarios
- Validation engine
- Report generation (JSON, HTML, Markdown)

## Detected Interoperability Issues

| Issue Type | Severity | Description |
|------------|----------|-------------|
| KERNEL_FALLBACK | WARNING | C8 card falling back to legacy kernel |
| FFI_INVALID | WARNING | Invalid Form Factor Indicator format |
| PAR_NOT_RECOGNIZED | INFO | PAR tag not recognized by terminal |
| TRACK2_FORMAT | WARNING | Track 2 separator mismatch |
| CVM_MISMATCH | ERROR | CVM capability mismatch |
| C8_NOT_SUPPORTED | WARNING | Terminal doesn't support C8 kernel |
| NETWORK_SPECIFIC_VALIDATION | WARNING | Cross-network field validation issues |

## Supported Kernels

| Kernel | Network | Version | Status |
|--------|---------|---------|--------|
| C2 | Mastercard | 3.1 | Current |
| C3 | Visa | 2.10 | Current |
| C4 | Amex | 1.0 | Current |
| C5 | JCB | 2.0 | Current |
| C6 | Discover | 2.1 | Current |
| C7 | UnionPay | 1.0 | Current |
| C8 | Common | 1.0 | Future |

## Quick Start

```javascript
const { 
  CardFactory, 
  TerminalFactory, 
  TestOrchestrator,
  PredefinedScenarios 
} = require('./index');

// Basic transaction test
const card = CardFactory.createMastercardContactless();
const terminal = TerminalFactory.createModernTerminal();
const result = await terminal.executeContactlessTransaction(card, { amount: 2500 });

// Run predefined scenario
const orchestrator = new TestOrchestrator();
const scenarioResult = await orchestrator.runScenario(PredefinedScenarios.c8KernelFallback);
```

## CLI Commands

```bash
# Run test suite
node tools/cli.js run-suite fullInterop --report --report-format html

# Run single scenario  
node tools/cli.js run-scenario c8KernelFallback -v

# Generate compatibility matrix
node tools/cli.js matrix -o matrix.json

# Interactive APDU testing
node tools/cli.js interactive

# List available tests
node tools/cli.js list-tests
```
