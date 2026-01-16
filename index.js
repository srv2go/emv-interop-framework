/**
 * EMV Interoperability Testing Framework
 * 
 * A comprehensive framework for testing interoperability between
 * EMV payment specifications, kernels, and implementations.
 * 
 * @module emv-interop-framework
 */

// Core Components
const { TLVParser, TLVBuilder, DOLParser, EMV_TAGS, TAG_CLASS } = require('./core/tlv/tlv-parser');
const { CommandAPDU, ResponseAPDU, EMVCommands, CLA, INS, SW } = require('./core/apdu/apdu-handler');
const { 
  EMVProtocolEngine, 
  TransactionContext, 
  TransactionState, 
  CryptogramType, 
  InterfaceType, 
  KernelID 
} = require('./core/protocol/emv-engine');

// Emulators
const { 
  CardEmulator, 
  CardProfile, 
  CardFactory, 
  CardSpecVersion, 
  StandardAIDs 
} = require('./emulators/card/card-emulator');

const { 
  TerminalEmulator, 
  TerminalConfiguration, 
  TerminalFactory, 
  TerminalType, 
  TerminalCapabilities, 
  AdditionalCapabilities 
} = require('./emulators/terminal/terminal-emulator');

const { 
  MobileHCEEmulator, 
  MobileCardProfile, 
  MobileDeviceConfig, 
  DeviceAccountReference, 
  TapToPhoneEmulator, 
  MobileEmulatorFactory, 
  MobilePlatform, 
  HCEMode, 
  MobileSDKVersion, 
  TokenServiceProvider 
} = require('./emulators/mobile/mobile-hce-emulator');

// Test Orchestration
const { 
  TestOrchestrator, 
  TestScenario, 
  TestSuite, 
  TestResult, 
  TestStatus, 
  IssueSeverity, 
  PredefinedScenarios, 
  PredefinedSuites 
} = require('./core/test-orchestrator');

// Specifications
const { 
  KernelSpecifications, 
  NetworkFieldDefinitions, 
  FormFactorDefinitions, 
  InteropIssueDefinitions, 
  TestTransactionConfigs, 
  AIDKernelMapping,
  getKernelForAID,
  getNetworkForAID,
  isKernelSupported,
  getKernelFallbackPath
} = require('./specifications/spec-definitions');

/**
 * Quick start helper - run a basic interop test
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test results
 */
async function quickTest(options = {}) {
  const orchestrator = new TestOrchestrator({ verbose: options.verbose });
  
  // Create default scenario
  const scenario = new TestScenario({
    name: 'Quick Interoperability Test',
    cardConfig: {
      factory: options.cardType || 'mastercard_contactless'
    },
    terminalConfig: {
      factory: options.terminalType || 'modern'
    },
    transactionParams: {
      amount: options.amount || 1000,
      currencyCode: options.currencyCode || '0840'
    }
  });
  
  return await orchestrator.runScenario(scenario);
}

/**
 * Run full interoperability test suite
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Suite results
 */
async function runFullTestSuite(options = {}) {
  const orchestrator = new TestOrchestrator(options);
  return await orchestrator.runSuite(PredefinedSuites.fullInterop);
}

/**
 * Generate compatibility matrix
 * @param {Object} options - Matrix options
 * @returns {Promise<Object>} Compatibility matrix
 */
async function generateCompatibilityMatrix(options = {}) {
  const { commands } = require('./tools/cli');
  return await commands.generateMatrix(options);
}

// Export everything
module.exports = {
  // Core - TLV
  TLVParser,
  TLVBuilder,
  DOLParser,
  EMV_TAGS,
  TAG_CLASS,
  
  // Core - APDU
  CommandAPDU,
  ResponseAPDU,
  EMVCommands,
  CLA,
  INS,
  SW,
  
  // Core - Protocol
  EMVProtocolEngine,
  TransactionContext,
  TransactionState,
  CryptogramType,
  InterfaceType,
  KernelID,
  
  // Emulators - Card
  CardEmulator,
  CardProfile,
  CardFactory,
  CardSpecVersion,
  StandardAIDs,
  
  // Emulators - Terminal
  TerminalEmulator,
  TerminalConfiguration,
  TerminalFactory,
  TerminalType,
  TerminalCapabilities,
  AdditionalCapabilities,
  
  // Emulators - Mobile
  MobileHCEEmulator,
  MobileCardProfile,
  MobileDeviceConfig,
  DeviceAccountReference,
  TapToPhoneEmulator,
  MobileEmulatorFactory,
  MobilePlatform,
  HCEMode,
  MobileSDKVersion,
  TokenServiceProvider,
  
  // Test Orchestration
  TestOrchestrator,
  TestScenario,
  TestSuite,
  TestResult,
  TestStatus,
  IssueSeverity,
  PredefinedScenarios,
  PredefinedSuites,
  
  // Specifications
  KernelSpecifications,
  NetworkFieldDefinitions,
  FormFactorDefinitions,
  InteropIssueDefinitions,
  TestTransactionConfigs,
  AIDKernelMapping,
  getKernelForAID,
  getNetworkForAID,
  isKernelSupported,
  getKernelFallbackPath,
  
  // Helper Functions
  quickTest,
  runFullTestSuite,
  generateCompatibilityMatrix
};
