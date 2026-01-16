/**
 * EMV Terminal Emulator
 * 
 * Simulates payment terminals with various kernel configurations.
 * Supports multiple kernels (C2, C3, C4, C5, C6, C7, C8) and legacy terminals.
 */

const { TLVParser, TLVBuilder, DOLParser } = require('../../core/tlv/tlv-parser');
const { CommandAPDU, ResponseAPDU, EMVCommands, SW } = require('../../core/apdu/apdu-handler');
const { 
  EMVProtocolEngine, 
  TransactionContext, 
  TransactionState, 
  CryptogramType, 
  InterfaceType, 
  KernelID 
} = require('../../core/protocol/emv-engine');

// Terminal Types
const TerminalType = {
  ATTENDED_ONLINE: 0x21,
  ATTENDED_OFFLINE: 0x22,
  ATTENDED_BOTH: 0x23,
  UNATTENDED_ONLINE: 0x24,
  UNATTENDED_OFFLINE: 0x25,
  UNATTENDED_BOTH: 0x26
};

// Terminal Capabilities
const TerminalCapabilities = {
  // Byte 1 - Card Data Input
  MANUAL_KEY_ENTRY: 0x80,
  MAG_STRIPE: 0x40,
  ICC: 0x20,
  
  // Byte 2 - CVM Capabilities
  PLAINTEXT_PIN_ICC: 0x80,
  ENCIPHERED_PIN_ONLINE: 0x40,
  SIGNATURE: 0x20,
  ENCIPHERED_PIN_OFFLINE: 0x10,
  NO_CVM_REQUIRED: 0x08,
  
  // Byte 3 - Security
  SDA: 0x80,
  DDA: 0x40,
  CARD_CAPTURE: 0x20,
  CDA: 0x08
};

// Additional Terminal Capabilities
const AdditionalCapabilities = {
  // Byte 1
  CASH: 0x80,
  GOODS: 0x40,
  SERVICES: 0x20,
  CASHBACK: 0x10,
  INQUIRY: 0x08,
  TRANSFER: 0x04,
  PAYMENT: 0x02,
  ADMINISTRATIVE: 0x01,
  
  // Byte 2
  CASH_DEPOSIT: 0x80
};

/**
 * Terminal Configuration
 */
class TerminalConfiguration {
  constructor(options = {}) {
    this.name = options.name || 'Standard POS Terminal';
    this.terminalId = options.terminalId || 'TERM0001';
    
    // Terminal Identification
    this.terminalType = options.terminalType || TerminalType.ATTENDED_ONLINE;
    this.terminalCountryCode = options.terminalCountryCode || '0840';  // USA
    this.merchantCategoryCode = options.merchantCategoryCode || '5999';
    
    // Capabilities (3 bytes)
    this.terminalCapabilities = options.terminalCapabilities || 
      Buffer.from([0xE0, 0xF8, 0xC8]);  // Full capabilities
    
    // Additional Capabilities (5 bytes)
    this.additionalCapabilities = options.additionalCapabilities ||
      Buffer.from([0xFF, 0x80, 0xF0, 0xA0, 0x01]);
    
    // Supported Kernels
    this.supportedKernels = options.supportedKernels || [
      KernelID.C2,  // Mastercard
      KernelID.C3,  // Visa
      KernelID.C4,  // Amex
      KernelID.C6   // Discover
    ];
    
    // C8 Support
    this.supportsC8 = options.supportsC8 || false;
    if (this.supportsC8) {
      this.supportedKernels.push(KernelID.C8);
    }
    
    // Transaction Limits
    this.floorLimit = options.floorLimit || 0;
    this.readerCVMLimit = options.readerCVMLimit || 5000;  // $50.00
    this.readerContactlessLimit = options.readerContactlessLimit || 25000;  // $250.00
    
    // Contactless Configuration
    this.contactlessEnabled = options.contactlessEnabled !== false;
    this.contactlessTransactionLimit = options.contactlessTransactionLimit || 25000;
    this.contactlessCVMLimit = options.contactlessCVMLimit || 5000;
    
    // Terminal Action Codes
    this.tacDefault = options.tacDefault || Buffer.from([0xFC, 0x50, 0xA0, 0x00, 0x00]);
    this.tacDenial = options.tacDenial || Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);
    this.tacOnline = options.tacOnline || Buffer.from([0xFC, 0x50, 0xA8, 0x00, 0x00]);
    
    // Version Information
    this.softwareVersion = options.softwareVersion || '1.0.0';
    this.kernelVersions = options.kernelVersions || {
      [KernelID.C2]: '3.1.0',
      [KernelID.C3]: '2.10.0',
      [KernelID.C4]: '1.0.0',
      [KernelID.C6]: '2.1.0'
    };
    
    // Legacy Mode (simulates older terminals)
    this.legacyMode = options.legacyMode || false;
    this.legacyNetworkPreference = options.legacyNetworkPreference || null;  // e.g., 'VISA'
    
    // Field Validation Settings (for interop testing)
    this.strictFieldValidation = options.strictFieldValidation || false;
    this.customFieldValidators = options.customFieldValidators || {};
  }
  
  /**
   * Check if terminal supports a specific kernel
   */
  supportsKernel(kernelId) {
    return this.supportedKernels.includes(kernelId);
  }
  
  /**
   * Get kernel configuration for a specific kernel
   */
  getKernelConfig(kernelId) {
    const baseConfig = {
      kernelId,
      version: this.kernelVersions[kernelId] || 'Unknown',
      readerContactlessTransactionLimit: this.contactlessTransactionLimit,
      readerCVMRequiredLimit: this.contactlessCVMLimit,
      readerContactlessFloorLimit: this.floorLimit,
      terminalCapabilities: this.terminalCapabilities,
      additionalCapabilities: this.additionalCapabilities,
      tacDefault: this.tacDefault,
      tacDenial: this.tacDenial,
      tacOnline: this.tacOnline
    };
    
    // Add kernel-specific configurations
    switch (kernelId) {
      case KernelID.C2:  // Mastercard
        return {
          ...baseConfig,
          magStripeMinimumSupport: true,
          msdCVMCapability: true,
          kernelConfiguration: 0x20
        };
        
      case KernelID.C3:  // Visa
        return {
          ...baseConfig,
          ttq: Buffer.from([0x36, 0x00, 0x40, 0x00]),  // Terminal Transaction Qualifiers
          fdda: true
        };
        
      case KernelID.C4:  // Amex
        return {
          ...baseConfig,
          amexProprietaryData: Buffer.from([0x00])
        };
        
      case KernelID.C8:  // Common
        return {
          ...baseConfig,
          commonKernelVersion: '1.0',
          interoperabilityMode: true
        };
        
      default:
        return baseConfig;
    }
  }
}

/**
 * Terminal Emulator
 */
class TerminalEmulator {
  constructor(configuration) {
    this.config = configuration;
    this.protocolEngine = new EMVProtocolEngine({
      strictValidation: this.config.strictFieldValidation,
      detectInteropIssues: true
    });
    
    this.currentTransaction = null;
    this.transactionHistory = [];
  }
  
  /**
   * Execute a contactless transaction with a card emulator
   * @param {CardEmulator} card - Card emulator instance
   * @param {Object} transactionData - Transaction details
   * @returns {Object} Transaction result
   */
  async executeContactlessTransaction(card, transactionData = {}) {
    const ctx = this.protocolEngine.createTransaction(InterfaceType.CONTACTLESS);
    this.currentTransaction = ctx;
    
    // Set up terminal data
    const terminalData = this.buildTerminalData(transactionData);
    
    try {
      // Step 1: Select PPSE
      ctx.timings.selectStart = Date.now();
      const ppseResponse = await this.sendCommand(card, EMVCommands.selectPPSE());
      ctx.timings.selectEnd = Date.now();
      
      if (!ppseResponse.isSuccess) {
        return this.buildErrorResult(ctx, 'PPSE_SELECT_FAILED', ppseResponse);
      }
      
      // Parse PPSE and select appropriate kernel
      const selectedApp = this.selectApplicationFromPPSE(ppseResponse, ctx);
      if (!selectedApp) {
        return this.buildErrorResult(ctx, 'NO_SUPPORTED_APPLICATION');
      }
      
      // Check kernel fallback scenarios
      this.checkKernelFallback(ctx, selectedApp);
      
      // Step 2: Select Application
      const selectResponse = await this.sendCommand(card, EMVCommands.select(selectedApp.aid));
      
      if (!selectResponse.isSuccess) {
        return this.buildErrorResult(ctx, 'APPLICATION_SELECT_FAILED', selectResponse);
      }
      
      this.protocolEngine.processSelectResponse(ctx, selectResponse);
      
      // Step 3: GET PROCESSING OPTIONS
      ctx.timings.gpoStart = Date.now();
      const gpoData = this.protocolEngine.buildGPOData(ctx, terminalData);
      const gpoCommand = EMVCommands.getProcessingOptions(gpoData);
      const gpoResponse = await this.sendCommand(card, gpoCommand);
      ctx.timings.gpoEnd = Date.now();
      
      if (!gpoResponse.isSuccess) {
        return this.buildErrorResult(ctx, 'GPO_FAILED', gpoResponse);
      }
      
      this.protocolEngine.processGPOResponse(ctx, gpoResponse);
      
      // Step 4: READ RECORDS (if required)
      ctx.timings.readStart = Date.now();
      const readCommands = this.protocolEngine.generateReadCommands(ctx);
      
      for (const readCmd of readCommands) {
        const readResponse = await this.sendCommand(card, readCmd.command);
        this.protocolEngine.processReadRecordResponse(ctx, readResponse, readCmd.sfi, readCmd.record);
      }
      ctx.timings.readEnd = Date.now();
      
      // Step 5: Perform field validation (interop testing)
      this.validateFields(ctx);
      
      // Step 6: Cardholder Verification (if required)
      const cvmResult = this.performCVM(ctx, transactionData.amount);
      ctx.cvmResult = cvmResult;
      
      // Step 7: Terminal Risk Management
      this.performTerminalRiskManagement(ctx, transactionData);
      
      // Step 8: Terminal Action Analysis
      const cryptogramRequest = this.determineTerminalAction(ctx);
      
      // Step 9: GENERATE AC
      ctx.timings.genACStart = Date.now();
      const genACData = this.protocolEngine.buildGenACData(ctx, terminalData);
      
      if (!genACData) {
        return this.buildErrorResult(ctx, 'GENERATE_AC_BUILD_FAILED');
      }
      
      const genACResponse = await this.sendCommand(
        card, 
        EMVCommands.generateAC(cryptogramRequest, genACData)
      );
      ctx.timings.genACEnd = Date.now();
      
      if (!genACResponse.isSuccess) {
        return this.buildErrorResult(ctx, 'GENERATE_AC_FAILED', genACResponse);
      }
      
      this.protocolEngine.processGenACResponse(ctx, genACResponse);
      
      // Calculate total time
      ctx.timings.totalTime = ctx.timings.genACEnd - ctx.timings.selectStart;
      
      // Build and return result
      const result = this.protocolEngine.getTransactionResult(ctx);
      this.transactionHistory.push(result);
      
      return result;
      
    } catch (error) {
      ctx.errors.push({
        phase: 'EXECUTION',
        message: error.message,
        stack: error.stack
      });
      return this.protocolEngine.getTransactionResult(ctx);
    }
  }
  
  /**
   * Send command to card and return response
   */
  async sendCommand(card, command) {
    return card.processCommand(command);
  }
  
  /**
   * Build terminal data for PDOL/CDOL
   */
  buildTerminalData(transactionData = {}) {
    const now = new Date();
    
    return {
      // Amount Authorized (9F02) - 6 bytes BCD
      '9F02': (transactionData.amount || 100).toString().padStart(12, '0'),
      
      // Amount Other (9F03) - 6 bytes BCD
      '9F03': (transactionData.cashback || 0).toString().padStart(12, '0'),
      
      // Terminal Country Code (9F1A) - 2 bytes
      '9F1A': this.config.terminalCountryCode,
      
      // Terminal Verification Results (95) - 5 bytes
      '95': '0000000000',
      
      // Transaction Currency Code (5F2A) - 2 bytes
      '5F2A': transactionData.currencyCode || '0840',  // USD
      
      // Transaction Date (9A) - 3 bytes YYMMDD
      '9A': this.formatDate(now),
      
      // Transaction Type (9C) - 1 byte
      '9C': (transactionData.transactionType || 0x00).toString(16).padStart(2, '0'),
      
      // Unpredictable Number (9F37) - 4 bytes
      '9F37': this.generateUnpredictableNumber(),
      
      // Terminal Capabilities (9F33) - 3 bytes
      '9F33': this.config.terminalCapabilities.toString('hex'),
      
      // Additional Terminal Capabilities (9F40) - 5 bytes
      '9F40': this.config.additionalCapabilities.toString('hex'),
      
      // Terminal Type (9F35) - 1 byte
      '9F35': this.config.terminalType.toString(16).padStart(2, '0'),
      
      // Transaction Time (9F21) - 3 bytes HHMMSS
      '9F21': this.formatTime(now),
      
      // Merchant Category Code (9F15) - 2 bytes
      '9F15': this.config.merchantCategoryCode,
      
      // Terminal Transaction Qualifiers (Visa) (9F66) - 4 bytes
      '9F66': '36004000'
    };
  }
  
  /**
   * Format date as YYMMDD
   */
  formatDate(date) {
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return yy + mm + dd;
  }
  
  /**
   * Format time as HHMMSS
   */
  formatTime(date) {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return hh + mm + ss;
  }
  
  /**
   * Generate unpredictable number
   */
  generateUnpredictableNumber() {
    const bytes = require('crypto').randomBytes(4);
    return bytes.toString('hex').toUpperCase();
  }
  
  /**
   * Select application from PPSE response
   */
  selectApplicationFromPPSE(ppseResponse, ctx) {
    const tlvData = TLVParser.parse(ppseResponse.data.toString('hex'));
    ctx.addCardData(tlvData);
    
    // Find all directory entries (tag 61)
    const directoryEntries = TLVParser.findAllTags(tlvData, '61');
    
    const applications = [];
    
    for (const entry of directoryEntries) {
      const aid = TLVParser.findTag(entry.children, '4F');
      const priority = TLVParser.findTag(entry.children, '87');
      const kernelId = TLVParser.findTag(entry.children, '9F2A');
      
      if (aid) {
        applications.push({
          aid: aid.valueHex,
          priority: priority ? parseInt(priority.valueHex, 16) : 0xFF,
          kernelId: kernelId ? parseInt(kernelId.valueHex, 16) : null
        });
      }
    }
    
    // Sort by priority
    applications.sort((a, b) => a.priority - b.priority);
    
    // Select first supported application
    for (const app of applications) {
      const kernelToUse = app.kernelId || this.determineKernelFromAID(app.aid);
      
      // Check if we support this kernel
      if (this.config.supportsKernel(kernelToUse)) {
        ctx.kernel = kernelToUse;
        ctx.selectedAID = app.aid;
        return app;
      }
      
      // Check for C8 fallback
      if (this.config.supportsC8 && kernelToUse === KernelID.C8) {
        ctx.kernel = kernelToUse;
        ctx.selectedAID = app.aid;
        return app;
      }
    }
    
    // Try legacy mode fallback
    if (this.config.legacyMode && applications.length > 0) {
      const app = applications[0];
      ctx.kernel = this.determineKernelFromAID(app.aid);
      ctx.selectedAID = app.aid;
      
      ctx.recordInteropIssue({
        type: 'LEGACY_FALLBACK',
        severity: 'WARNING',
        message: `Legacy terminal selecting application without kernel support check`,
        recommendation: 'Update terminal to properly check kernel support'
      });
      
      return app;
    }
    
    return null;
  }
  
  /**
   * Determine kernel from AID (when kernel ID not provided)
   */
  determineKernelFromAID(aid) {
    const aidUpper = aid.toUpperCase();
    
    // Mastercard
    if (aidUpper.startsWith('A000000004')) {
      return KernelID.C2;
    }
    
    // Visa
    if (aidUpper.startsWith('A000000003')) {
      return KernelID.C3;
    }
    
    // Amex
    if (aidUpper.startsWith('A000000025')) {
      return KernelID.C4;
    }
    
    // JCB
    if (aidUpper.startsWith('A000000065')) {
      return KernelID.C5;
    }
    
    // Discover
    if (aidUpper.startsWith('A000000152')) {
      return KernelID.C6;
    }
    
    // UnionPay
    if (aidUpper.startsWith('A000000333')) {
      return KernelID.C7;
    }
    
    // Default to C2 (Mastercard-like)
    return KernelID.C2;
  }
  
  /**
   * Check for kernel fallback scenarios
   */
  checkKernelFallback(ctx, selectedApp) {
    const requestedKernel = selectedApp.kernelId;
    const actualKernel = ctx.kernel;
    
    if (requestedKernel && requestedKernel !== actualKernel) {
      ctx.recordInteropIssue({
        type: 'KERNEL_MISMATCH',
        severity: 'WARNING',
        message: `Card requested kernel ${requestedKernel}, using kernel ${actualKernel}`,
        requestedKernel,
        actualKernel,
        recommendation: 'Verify kernel fallback behavior is correct'
      });
    }
    
    // Check C8 fallback specifically
    if (requestedKernel === KernelID.C8 && !this.config.supportsC8) {
      ctx.recordInteropIssue({
        type: 'C8_NOT_SUPPORTED',
        severity: 'WARNING',
        message: 'Card supports C8 kernel but terminal does not',
        recommendation: 'Terminal should be updated to support C8 common kernel'
      });
    }
  }
  
  /**
   * Validate fields for interop issues
   */
  validateFields(ctx) {
    // Check for PAR handling
    const par = ctx.getCardData('DF8101');
    if (par && this.config.legacyMode) {
      ctx.recordInteropIssue({
        type: 'LEGACY_PAR_HANDLING',
        severity: 'WARNING',
        message: 'Legacy terminal may not correctly handle PAR (tag DF8101)',
        recommendation: 'Verify PAR is correctly passed to acquirer/network'
      });
    }
    
    // Check FFI
    const ffi = ctx.getCardData('9F6E');
    if (ffi) {
      this.validateFFI(ctx, ffi);
    }
    
    // Check Track 2 format
    const track2 = ctx.getCardData('57');
    if (track2) {
      this.validateTrack2(ctx, track2);
    }
    
    // Legacy network preference enforcement
    if (this.config.legacyNetworkPreference) {
      this.checkNetworkPreferenceEnforcement(ctx);
    }
    
    // Custom field validators
    for (const [tag, validator] of Object.entries(this.config.customFieldValidators)) {
      const value = ctx.getCardData(tag);
      if (value) {
        const result = validator(value, ctx);
        if (result.issue) {
          ctx.recordInteropIssue(result.issue);
        }
      }
    }
  }
  
  /**
   * Validate FFI field
   */
  validateFFI(ctx, ffiHex) {
    const ffi = Buffer.from(ffiHex, 'hex');
    
    if (ffi.length < 4) {
      ctx.recordInteropIssue({
        type: 'FFI_INVALID_LENGTH',
        severity: 'ERROR',
        message: `FFI length ${ffi.length} is invalid (expected 4)`,
        recommendation: 'Card applet should return 4-byte FFI'
      });
    }
    
    // Check form factor validity
    const formFactor = ffi[1] & 0x0F;
    const validFormFactors = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06];
    
    if (!validFormFactors.includes(formFactor)) {
      ctx.recordInteropIssue({
        type: 'FFI_UNKNOWN_FORM_FACTOR',
        severity: 'WARNING',
        message: `Unrecognized form factor value: ${formFactor}`,
        recommendation: 'Use standard form factor values'
      });
    }
  }
  
  /**
   * Validate Track 2 data
   */
  validateTrack2(ctx, track2Hex) {
    // Track 2 should use 'D' as separator, not '='
    if (track2Hex.includes('3D')) {  // '=' in hex
      ctx.recordInteropIssue({
        type: 'TRACK2_SEPARATOR',
        severity: 'WARNING',
        message: 'Track 2 using = separator instead of D',
        recommendation: 'Use D separator per EMV specification'
      });
    }
    
    // Check Track 2 length
    const maxTrack2Length = 19 + 1 + 4 + 3 + 1 + 11;  // PAN + sep + expiry + service + sep + discretionary
    if (track2Hex.length / 2 > maxTrack2Length) {
      ctx.recordInteropIssue({
        type: 'TRACK2_LENGTH',
        severity: 'WARNING',
        message: `Track 2 length ${track2Hex.length / 2} exceeds maximum`,
        recommendation: 'Verify Track 2 data format'
      });
    }
  }
  
  /**
   * Check for legacy network preference enforcement
   */
  checkNetworkPreferenceEnforcement(ctx) {
    const aid = ctx.selectedAID;
    
    if (this.config.legacyNetworkPreference === 'VISA' && !aid.startsWith('A000000003')) {
      ctx.recordInteropIssue({
        type: 'NETWORK_PREFERENCE_MISMATCH',
        severity: 'INFO',
        message: 'Legacy Visa-preferring terminal processing non-Visa application',
        recommendation: 'Verify field validation does not apply Visa-specific rules to other networks'
      });
    }
  }
  
  /**
   * Perform Cardholder Verification Method
   */
  performCVM(ctx, amount) {
    // Simplified CVM for emulation
    const cvmList = ctx.getCardData('8E');
    
    if (!cvmList) {
      return { method: 'NO_CVM', success: true };
    }
    
    // Check if amount exceeds CVM limit
    if (amount && amount < this.config.contactlessCVMLimit) {
      return { method: 'NO_CVM_REQUIRED', success: true };
    }
    
    // Default to signature for attended terminal
    if (this.config.terminalType === TerminalType.ATTENDED_ONLINE ||
        this.config.terminalType === TerminalType.ATTENDED_BOTH) {
      return { method: 'SIGNATURE', success: true };
    }
    
    return { method: 'NO_CVM', success: true };
  }
  
  /**
   * Perform Terminal Risk Management
   */
  performTerminalRiskManagement(ctx, transactionData) {
    let tvr = Buffer.alloc(5);
    
    // Check floor limit
    const amount = transactionData.amount || 0;
    if (amount > this.config.floorLimit) {
      tvr[3] |= 0x80;  // Transaction exceeds floor limit
    }
    
    // Random selection for online
    if (Math.random() < 0.1) {  // 10% random selection
      tvr[3] |= 0x20;  // Random selection for online
    }
    
    ctx.tvr = tvr;
    ctx.cardData.set('95', tvr.toString('hex').toUpperCase());
  }
  
  /**
   * Determine terminal action (what cryptogram to request)
   */
  determineTerminalAction(ctx) {
    const tvr = ctx.tvr;
    const iacDefault = Buffer.from(ctx.getCardData('9F0D') || 'FC50A00000', 'hex');
    const iacDenial = Buffer.from(ctx.getCardData('9F0E') || '0000000000', 'hex');
    const iacOnline = Buffer.from(ctx.getCardData('9F0F') || 'F850A49800', 'hex');
    
    // Check for denial
    for (let i = 0; i < 5; i++) {
      if ((tvr[i] & iacDenial[i] & this.config.tacDenial[i]) !== 0) {
        return CryptogramType.AAC;  // Decline
      }
    }
    
    // Check for online
    for (let i = 0; i < 5; i++) {
      if ((tvr[i] & (iacOnline[i] | this.config.tacOnline[i])) !== 0) {
        return CryptogramType.ARQC;  // Go online
      }
    }
    
    // Offline approval
    return CryptogramType.TC;
  }
  
  /**
   * Build error result
   */
  buildErrorResult(ctx, errorCode, response = null) {
    ctx.state = TransactionState.ERROR;
    ctx.errors.push({
      code: errorCode,
      sw: response?.sw,
      message: response?.getStatusDescription() || errorCode
    });
    
    return this.protocolEngine.getTransactionResult(ctx);
  }
  
  /**
   * Get transaction history
   */
  getTransactionHistory() {
    return this.transactionHistory;
  }
  
  /**
   * Clear transaction history
   */
  clearHistory() {
    this.transactionHistory = [];
  }
}

/**
 * Terminal Factory - Creates terminals with predefined configurations
 */
class TerminalFactory {
  /**
   * Create terminal from vendor profile
   */
  static createFromVendorProfile(vendor, model, overrides = {}) {
    const { TerminalVendorProfiles } = require('../../specifications/spec-definitions');
    
    const vendorProfile = TerminalVendorProfiles[vendor];
    if (!vendorProfile) {
      throw new Error(`Unknown vendor: ${vendor}`);
    }
    
    const modelProfile = vendorProfile.models[model];
    if (!modelProfile) {
      throw new Error(`Unknown model ${model} for vendor ${vendor}`);
    }
    
    return new TerminalEmulator(new TerminalConfiguration({
      name: `${vendorProfile.name} ${model}`,
      supportedKernels: overrides.supportedKernels || modelProfile.kernelSupport,
      supportsC8: overrides.supportsC8 !== undefined ? overrides.supportsC8 : modelProfile.c8Support,
      softwareVersion: modelProfile.firmwareVersions[0],
      ...overrides
    }));
  }

  /**
   * Create a modern terminal with full kernel support
   */
  static createModernTerminal() {
    return new TerminalEmulator(new TerminalConfiguration({
      name: 'Modern POS Terminal',
      supportedKernels: [KernelID.C2, KernelID.C3, KernelID.C4, KernelID.C5, KernelID.C6, KernelID.C7],
      supportsC8: true,
      softwareVersion: '3.0.0'
    }));
  }
  
  /**
   * Create a legacy terminal with limited kernel support
   */
  static createLegacyTerminal(networkPreference = null) {
    return new TerminalEmulator(new TerminalConfiguration({
      name: 'Legacy POS Terminal',
      supportedKernels: [KernelID.C2, KernelID.C3],
      supportsC8: false,
      legacyMode: true,
      legacyNetworkPreference: networkPreference,
      softwareVersion: '1.5.0',
      kernelVersions: {
        [KernelID.C2]: '2.0.0',
        [KernelID.C3]: '2.5.0'
      }
    }));
  }
  
  /**
   * Create a C8-only terminal
   */
  static createC8Terminal() {
    return new TerminalEmulator(new TerminalConfiguration({
      name: 'C8 Common Kernel Terminal',
      supportedKernels: [KernelID.C8],
      supportsC8: true,
      softwareVersion: '4.0.0',
      kernelVersions: {
        [KernelID.C8]: '1.0.0'
      }
    }));
  }
  
  /**
   * Create a terminal for specific interop testing
   */
  static createInteropTestTerminal(scenario) {
    const baseConfig = {
      name: `Interop Test Terminal - ${scenario}`,
      strictFieldValidation: true
    };
    
    switch (scenario) {
      case 'VISA_LEANING_LEGACY':
        return new TerminalEmulator(new TerminalConfiguration({
          ...baseConfig,
          supportedKernels: [KernelID.C3, KernelID.C2],
          legacyMode: true,
          legacyNetworkPreference: 'VISA',
          supportsC8: false
        }));
        
      case 'C8_FALLBACK_TEST':
        return new TerminalEmulator(new TerminalConfiguration({
          ...baseConfig,
          supportedKernels: [KernelID.C2, KernelID.C3],
          supportsC8: false  // C8 not supported, will force fallback
        }));
        
      case 'STRICT_VALIDATION':
        return new TerminalEmulator(new TerminalConfiguration({
          ...baseConfig,
          strictFieldValidation: true,
          customFieldValidators: {
            '9F6E': (value, ctx) => {
              // Strict FFI validation
              if (value.length !== 8) {
                return {
                  issue: {
                    type: 'FFI_STRICT_VALIDATION',
                    severity: 'ERROR',
                    message: 'FFI does not match expected format'
                  }
                };
              }
              return {};
            }
          }
        }));
        
      default:
        return this.createModernTerminal();
    }
  }
}

module.exports = {
  TerminalEmulator,
  TerminalConfiguration,
  TerminalFactory,
  TerminalType,
  TerminalCapabilities,
  AdditionalCapabilities
};
