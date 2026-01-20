# EMV Interoperability Testing Framework

## Overview

A comprehensive testing framework designed to validate interoperability between different EMV payment specification versions, kernels (C2, C6, C8), card applets, terminal implementations, and mobile HCE solutions.

## Problem Statement

The payment ecosystem faces significant challenges when new specifications are introduced:

1. **Kernel Version Fragmentation**: New kernels (e.g., C8) must coexist with legacy kernels (C6) DPAS 1.0 ecosystem
2. **Specification Drift**: Different networks implement specifications with subtle variations
3. **Field Validation Inconsistencies**: Legacy terminals may enforce scheme-specific field validations
4. **Fallback Behavior**: C8 → C6 → Legacy fallback paths need validation
5. **Cross-Network Compatibility**: Visa, Mastercard, Amex, Discover specifications differ

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EMV INTEROP TESTING FRAMEWORK                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  CARD EMULATOR  │  │TERMINAL EMULATOR│  │ MOBILE EMULATOR │            │
│  │                 │  │                 │  │     (HCE)       │            │
│  │ • Contact ICC   │  │ • Kernel C2     │  │ • iOS SDK Sim   │            │
│  │ • Contactless   │  │ • Kernel C6     │  │ • Android HCE   │            │
│  │ • Multiple AIDs │  │ • Kernel C8     │  │ • Tap-on-Phone  │            │
│  │ • Form Factors  │  │ • Legacy POS    │  │ • Multiple Vers │            │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘            │
│           │                    │                    │                      │
│           └────────────────────┼────────────────────┘                      │
│                                ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     PROTOCOL ENGINE                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │  │
│  │  │   TLV    │  │   APDU   │  │  CRYPTO  │  │   EMV FLOW       │    │  │
│  │  │  Parser  │  │  Handler │  │  Engine  │  │   State Machine  │    │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                  SPECIFICATION REPOSITORY                            │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │  │
│  │  │ Kernel Specs   │  │ Network Specs  │  │ Applet Specs   │        │  │
│  │  │ C2/C6/C8/etc   │  │ Visa/MC/Amex   │  │ Contact/CTLS   │        │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    TEST ORCHESTRATOR                                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │  │
│  │  │ Scenario │  │ Validator│  │ Reporter │  │   Comparator     │    │  │
│  │  │ Runner   │  │          │  │          │  │   (Diff Engine)  │    │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
emv-interop-framework/
├── core/
│   ├── protocol/          # EMV protocol implementation
│   ├── tlv/               # TLV encoding/decoding
│   ├── apdu/              # APDU command/response handling
│   └── crypto/            # Cryptographic operations
├── emulators/
│   ├── card/              # Card emulator (contact/contactless)
│   ├── terminal/          # Terminal emulator (multi-kernel)
│   └── mobile/            # Mobile HCE emulator
├── specifications/
│   ├── kernels/           # EMV kernel specifications
│   ├── applets/           # Card applet specifications
│   └── schemas/           # JSON schemas for validation
├── tests/
│   ├── scenarios/         # Test scenarios
│   ├── fixtures/          # Test data
│   └── reports/           # Test reports
├── config/                # Configuration files
├── docs/                  # Documentation
└── tools/                 # CLI tools and utilities
```

## Key Components

### 1. TLV Engine (Tag-Length-Value)
- Parse and construct BER-TLV encoded data
- Support for EMV-specific tag classes
- Nested TLV handling (constructed tags)

### 2. APDU Handler
- ISO 7816-4 command/response APDU processing
- Case 1-4 APDU support
- Secure messaging (SM) support

### 3. Kernel Support Matrix

| Kernel | Network    | Spec Version | Status     |
|--------|------------|--------------|------------|
| C2     | Mastercard | 3.1          | Legacy     |
| C3     | Visa       | 2.10         | Current    |
| C4     | Amex       | 1.0          | Current    |
| C5     | JCB        | 2.0          | Current    |
| C6     | Discover   | 2.1          | Current    |
| C7     | UnionPay   | 1.0          | Current    |
| C8     | Common     | 1.0          | Future     |

### 4. Form Factor Identifier (FFI) Support
- Payment Device characteristics
- Consumer Device CVM support
- Device type identification

## Quick Start

### For Non-Technical Users (Web UI)

```bash
# Install dependencies
npm install

# Start the web interface
npm run ui
```

Then open your browser to: **http://localhost:3000**

The web UI provides a user-friendly interface for:
- 🧪 Running test scenarios with one click
- 📊 Viewing compatibility matrices
- ⚙️ Managing custom specifications
- 📋 Analyzing test results

### For Developers (Command Line)

```bash
# Install dependencies
npm install

# Run a basic interoperability test
npm run test:interop -- --card-spec visa-ctls-v3.1 --terminal-kernel C8

# Run Discover-specific tests
npm run test:discover

# Generate compatibility matrix
npm run test:matrix

# Run full test suite
npm test
```

## 🆕 Discover D-PAS Testing

This framework includes comprehensive support for **Discover D-PAS** testing:

### Supported D-PAS Versions
- **D-PAS 1.0**: Legacy compatibility testing
- **D-PAS 2.1**: Current production (CDCVM, Mobile HCE)
- **D-PAS 3.0**: C8-ready with C6 fallback
- **Discover C8**: Full Common Kernel implementation

### Supported Terminal Vendors
- ✅ Verifone (VX520, VX680, VX820, VX Evolution)
- ✅ Ingenico (iCT250, iSC250, Desk/5000, Move/5000)
- ✅ PAX Technology (A920, A80)
- ✅ First Data / Clover (Clover Mini, Clover Flex)

### Key Features
- **C8 → C6 Fallback Testing**: Validate backward compatibility
- **Cross-Vendor Matrix**: Test all card versions against all terminals
- **Custom Specifications**: Load your own applet configurations
- **Production-Ready**: Test against real terminal vendor profiles

### Quick Test Examples

```bash
# Test D-PAS 1.0 on legacy terminals
npm run test:discover

# Use the Web UI for point-and-click testing
npm run ui
```

For detailed Discover testing documentation, see [DISCOVER_TESTING_GUIDE.md](docs/DISCOVER_TESTING_GUIDE.md)

## Adding Custom Specifications

You can add your own card applet and terminal specifications without modifying code:

1. **Via Web UI**: Navigate to the "Custom Specs" tab and follow the instructions
2. **Manually**: Place JSON/YAML files in `specifications/custom/` directory

Template files are automatically created for:
- Card applets (`custom/applets/`)
- Terminal profiles (`custom/terminals/`)
- Network configurations (`custom/networks/`)

See the [Discover Testing Guide](docs/DISCOVER_TESTING_GUIDE.md) for detailed examples.

## Configuration

See `config/default.yaml` for configuration options including:
- Kernel specifications
- Network parameters
- Field validation rules
- Fallback behavior settings

## License

Proprietary - For internal development use only.
