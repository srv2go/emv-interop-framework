/**
 * Mobile HCE (Host Card Emulation) Emulator
 * 
 * Simulates mobile payment solutions including iOS Apple Pay-style HCE,
 * Android HCE, and tap-on-phone merchant acceptance scenarios.
 */

const { TLVParser, TLVBuilder, DOLParser } = require('../../core/tlv/tlv-parser');
const { CommandAPDU, ResponseAPDU, EMVCommands, SW } = require('../../core/apdu/apdu-handler');
const { KernelID, InterfaceType } = require('../../core/protocol/emv-engine');
const { CardEmulator, CardProfile, StandardAIDs } = require('../card/card-emulator');
const crypto = require('crypto');

// Mobile Platform Types
const MobilePlatform = {
  IOS: 'iOS',
  ANDROID: 'Android',
  GENERIC: 'Generic'
};

// HCE Mode
const HCEMode = {
  PAYMENT: 'PAYMENT',           // Consumer payment (Apple Pay, Google Pay)
  TAP_TO_PHONE: 'TAP_TO_PHONE', // Merchant acceptance (SoftPOS)
  DUAL: 'DUAL'                  // Both modes
};

// Mobile SDK Versions
const MobileSDKVersion = {
  // iOS
  IOS_PASSKIT_1_0: 'iOS_PassKit_1.0',
  IOS_PASSKIT_2_0: 'iOS_PassKit_2.0',
  IOS_PASSKIT_3_0: 'iOS_PassKit_3.0',
  
  // Android
  ANDROID_HCE_1_0: 'Android_HCE_1.0',
  ANDROID_HCE_2_0: 'Android_HCE_2.0',
  GOOGLE_PAY_1_0: 'Google_Pay_1.0',
  GOOGLE_PAY_2_0: 'Google_Pay_2.0',
  
  // Tap to Phone
  TAP_TO_PHONE_1_0: 'Tap_to_Phone_1.0',
  TAP_TO_PHONE_2_0: 'Tap_to_Phone_2.0'
};

// Token Service Provider IDs
const TokenServiceProvider = {
  VISA_VTS: 'VISA_VTS',
  MASTERCARD_MDES: 'MC_MDES',
  AMEX_AETS: 'AMEX_AETS',
  NETWORK_AGNOSTIC: 'NETWORK_AGNOSTIC'
};

/**
 * Device Account Reference (for tokenized payments)
 */
class DeviceAccountReference {
  constructor(options = {}) {
    this.dpan = options.dpan || this.generateDPAN();
    this.fpan = options.fpan || null;  // Funding PAN (if known)
    this.par = options.par || this.generatePAR();
    this.tokenRequestorId = options.tokenRequestorId || '50110030273';
    this.tokenServiceProvider = options.tokenServiceProvider || TokenServiceProvider.MASTERCARD_MDES;
    this.tokenExpiryDate = options.tokenExpiryDate || this.generateExpiryDate();
    this.tokenStatus = options.tokenStatus || 'ACTIVE';
  }
  
  generateDPAN() {
    // Generate a test DPAN (device PAN)
    const prefix = '5413';  // Mastercard test prefix
    const middle = Array(11).fill(0).map(() => Math.floor(Math.random() * 10)).join('');
    const partial = prefix + middle;
    const checkDigit = this.calculateLuhn(partial);
    return partial + checkDigit;
  }
  
  generatePAR() {
    // Generate 29-character alphanumeric PAR
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return 'PAR' + Array(26).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
  
  generateExpiryDate() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 3);
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    return yy + mm + '31';
  }
  
  calculateLuhn(number) {
    const digits = number.split('').reverse().map(Number);
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = digits[i];
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }
}

/**
 * Mobile Device Configuration
 */
class MobileDeviceConfig {
  constructor(options = {}) {
    this.platform = options.platform || MobilePlatform.IOS;
    this.mode = options.mode || HCEMode.PAYMENT;
    this.sdkVersion = options.sdkVersion || MobileSDKVersion.IOS_PASSKIT_3_0;
    
    // Device identification
    this.deviceId = options.deviceId || crypto.randomBytes(16).toString('hex');
    this.deviceModel = options.deviceModel || 'iPhone 15 Pro';
    this.osVersion = options.osVersion || '17.0';
    
    // NFC Configuration
    this.nfcEnabled = options.nfcEnabled !== false;
    this.nfcProtocol = options.nfcProtocol || 'ISO_14443_4';
    
    // Security Configuration
    this.secureElementType = options.secureElementType || 'eSE';  // eSE, TEE, HCE
    this.deviceAuthenticationMethod = options.deviceAuthenticationMethod || 'FACE_ID';
    
    // Form Factor Indicator for mobile
    this.formFactorIndicator = options.formFactorIndicator || this.getDefaultFFI();
    
    // Supported networks
    this.supportedNetworks = options.supportedNetworks || ['VISA', 'MASTERCARD', 'AMEX'];
    
    // Token configuration
    this.tokenServiceProviders = options.tokenServiceProviders || [
      TokenServiceProvider.VISA_VTS,
      TokenServiceProvider.MASTERCARD_MDES
    ];
  }
  
  getDefaultFFI() {
    // Form Factor Indicator for mobile device
    // Byte 1: Consumer Device CVM capability
    // Byte 2: Form Factor (0x02 = Mobile Phone)
    // Byte 3-4: Consumer Device Number
    
    let cdcvm = 0x00;
    
    if (this.deviceAuthenticationMethod === 'FACE_ID' ||
        this.deviceAuthenticationMethod === 'TOUCH_ID' ||
        this.deviceAuthenticationMethod === 'FINGERPRINT') {
      cdcvm |= 0x80;  // On-device biometric
    }
    
    if (this.deviceAuthenticationMethod === 'PASSCODE' ||
        this.deviceAuthenticationMethod === 'PIN') {
      cdcvm |= 0x40;  // On-device PIN/passcode
    }
    
    return Buffer.from([cdcvm, 0x02, 0x00, 0x00]).toString('hex');
  }
}

/**
 * Mobile HCE Card Profile
 * Extends CardProfile with mobile-specific data
 */
class MobileCardProfile extends CardProfile {
  constructor(options = {}) {
    super(options);
    
    this.deviceConfig = options.deviceConfig || new MobileDeviceConfig();
    this.deviceAccountRef = options.deviceAccountRef || new DeviceAccountReference();
    
    // Mobile-specific configuration
    this.isTokenized = options.isTokenized !== false;
    this.supportsDynamicCVM = options.supportsDynamicCVM !== false;
    
    // Update data for mobile
    this.initializeMobileData();
  }
  
  initializeMobileData() {
    // Override PAN with DPAN for tokenized cards
    if (this.isTokenized) {
      this.staticData.set('5A', this.deviceAccountRef.dpan);
      
      // Update Track 2 with DPAN
      const track2 = this.deviceAccountRef.dpan + 'D' + 
                     this.deviceAccountRef.tokenExpiryDate.substring(0, 4) +
                     '101' + // Service code
                     '0000000000F';  // Discretionary data
      this.staticData.set('57', track2);
      
      // Add PAR
      this.staticData.set('DF8101', Buffer.from(this.deviceAccountRef.par).toString('hex'));
    }
    
    // Set Form Factor Indicator for mobile
    this.staticData.set('9F6E', this.deviceConfig.formFactorIndicator);
    
    // Set Card Transaction Qualifiers for mobile
    // Bit 8: Online Cryptogram Required
    // Bit 7: CVM Required
    // Bit 6: Offline Data Authentication for Online Authorizations supported
    let ctq = 0x00;
    
    if (this.supportsDynamicCVM) {
      ctq |= 0x40;  // CVM performed on device
    }
    
    this.staticData.set('9F6C', Buffer.from([ctq, 0x00]).toString('hex'));
    
    // Consumer Device CVM Results (if applicable)
    if (this.deviceConfig.deviceAuthenticationMethod) {
      this.staticData.set('9F6D', this.getCDCVMResults());
    }
    
    // Mobile-specific kernel data
    this.staticData.set('DF8101', Buffer.from(this.deviceAccountRef.par).toString('hex'));
  }
  
  getCDCVMResults() {
    // Consumer Device CVM Results
    // Indicates how the cardholder was verified on the device
    const method = this.deviceConfig.deviceAuthenticationMethod;
    
    switch (method) {
      case 'FACE_ID':
      case 'FINGERPRINT':
      case 'TOUCH_ID':
        return '02';  // Biometric
      case 'PASSCODE':
      case 'PIN':
        return '01';  // Passcode
      case 'NONE':
        return '00';  // No CVM
      default:
        return '03';  // Other
    }
  }
}

/**
 * Mobile HCE Emulator
 */
class MobileHCEEmulator extends CardEmulator {
  constructor(profile) {
    super(profile);
    
    this.deviceConfig = profile.deviceConfig;
    this.deviceAccountRef = profile.deviceAccountRef;
    
    // Mobile-specific state
    this.deviceAuthenticated = false;
    this.sessionKey = null;
    this.applicationCryptogramCounter = 0;
    
    // Tap-to-Phone state (if in acceptance mode)
    this.isAcceptanceMode = profile.deviceConfig.mode === HCEMode.TAP_TO_PHONE;
    this.acceptedTransactions = [];
  }
  
  /**
   * Simulate device authentication (Face ID, Touch ID, etc.)
   */
  authenticateDevice(method = null) {
    const authMethod = method || this.deviceConfig.deviceAuthenticationMethod;
    
    // Simulate authentication success
    this.deviceAuthenticated = true;
    this.sessionKey = crypto.randomBytes(16);
    
    return {
      success: true,
      method: authMethod,
      timestamp: Date.now()
    };
  }
  
  /**
   * Process command with mobile-specific handling
   */
  processCommand(command) {
    // Check if device authentication is required
    if (!this.deviceAuthenticated && this.profile.supportsDynamicCVM) {
      // In real scenarios, the user would be prompted for authentication
      // For testing, we can auto-authenticate or require explicit call
      this.authenticateDevice();
    }
    
    return super.processCommand(command);
  }
  
  /**
   * Override GPO to include mobile-specific data
   */
  processGPO(cmd) {
    if (this.currentState !== 'SELECTED') {
      return ResponseAPDU.error(SW.CONDITIONS_NOT_SATISFIED);
    }
    
    this.currentState = 'GPO_COMPLETE';
    
    const builder = new TLVBuilder();
    
    builder.addConstructed('77', (resp) => {
      // AIP - Mobile specific (support online only typically)
      resp.addPrimitive('82', '1980');  // CDA supported, DDA supported
      
      // AFL
      const afl = this.profile.getData('94');
      resp.addPrimitive('94', afl);
      
      // Track 2 (with DPAN for tokenized)
      const track2 = this.profile.getData('57');
      if (track2) {
        resp.addPrimitive('57', track2);
      }
      
      // PAN (DPAN for tokenized)
      const pan = this.profile.getData('5A');
      if (pan) {
        resp.addPrimitive('5A', pan);
      }
      
      // Form Factor Indicator (mobile device)
      const ffi = this.profile.getData('9F6E');
      if (ffi) {
        resp.addPrimitive('9F6E', ffi);
      }
      
      // Card Transaction Qualifiers
      const ctq = this.profile.getData('9F6C');
      if (ctq) {
        resp.addPrimitive('9F6C', ctq);
      }
      
      // Consumer Device CVM Results
      const cdcvmResults = this.profile.getData('9F6D');
      if (cdcvmResults && this.deviceAuthenticated) {
        resp.addPrimitive('9F6D', cdcvmResults);
      }
      
      // For tokenized cards, include additional token data
      if (this.profile.isTokenized) {
        // Token Requestor ID
        resp.addPrimitive('9F19', Buffer.from(this.deviceAccountRef.tokenRequestorId).toString('hex'));
      }
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Override GENERATE AC for mobile-specific cryptogram generation
   */
  processGenerateAC(cmd) {
    if (this.currentState !== 'READING' && this.currentState !== 'GPO_COMPLETE') {
      return ResponseAPDU.error(SW.CONDITIONS_NOT_SATISFIED);
    }
    
    const requestedCryptogramType = cmd.p1 & 0xC0;
    
    this.currentState = 'AC_GENERATED';
    this.atc++;
    this.applicationCryptogramCounter++;
    
    // Mobile typically goes online (ARQC) unless specifically configured
    let returnedCryptogramType = 0x80;  // ARQC
    
    // Generate cryptogram with device-specific data
    const builder = new TLVBuilder();
    
    builder.addConstructed('77', (resp) => {
      // CID
      resp.addPrimitive('9F27', Buffer.from([returnedCryptogramType]).toString('hex'));
      
      // ATC
      resp.addPrimitive('9F36', this.atc.toString(16).padStart(4, '0'));
      
      // Application Cryptogram
      const ac = this.generateMobileCryptogram();
      resp.addPrimitive('9F26', ac);
      
      // Issuer Application Data (mobile-specific format)
      const iad = this.generateMobileIAD();
      resp.addPrimitive('9F10', iad);
      
      // For tokenized, include PAR reference
      if (this.profile.isTokenized) {
        const par = this.profile.getData('DF8101');
        if (par) {
          resp.addPrimitive('DF8101', par);
        }
      }
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Generate mobile-specific application cryptogram
   */
  generateMobileCryptogram() {
    // In real implementation, this would use proper key derivation
    // and cryptographic operations with the session key
    
    const data = Buffer.concat([
      this.sessionKey || Buffer.alloc(16),
      Buffer.from(this.atc.toString(16).padStart(4, '0'), 'hex'),
      crypto.randomBytes(4)
    ]);
    
    const hash = crypto.createHash('sha256').update(data).digest();
    return hash.slice(0, 8).toString('hex').toUpperCase();
  }
  
  /**
   * Generate mobile-specific IAD
   */
  generateMobileIAD() {
    // IAD format varies by token service provider
    // This is a simplified example
    
    const iadBuffer = Buffer.alloc(32);
    
    // Derivation Key Index (2 bytes)
    iadBuffer.writeUInt16BE(0x0001, 0);
    
    // Cryptogram Version Number
    iadBuffer.writeUInt8(0x0A, 2);
    
    // CVR (Card Verification Results) - 4 bytes
    iadBuffer.writeUInt32BE(0x03A00000, 3);
    
    // Device Authentication indicator
    if (this.deviceAuthenticated) {
      iadBuffer.writeUInt8(0x80, 7);  // Device CVM performed
    }
    
    return iadBuffer.toString('hex').toUpperCase();
  }
  
  /**
   * Simulate NFC field detection (for testing)
   */
  onNFCFieldDetected() {
    // Reset transaction state
    this.reset();
    
    return {
      fieldDetected: true,
      deviceReady: this.deviceConfig.nfcEnabled,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get device status
   */
  getDeviceStatus() {
    return {
      platform: this.deviceConfig.platform,
      mode: this.deviceConfig.mode,
      nfcEnabled: this.deviceConfig.nfcEnabled,
      deviceAuthenticated: this.deviceAuthenticated,
      transactionReady: this.deviceAuthenticated && this.deviceConfig.nfcEnabled,
      tokenStatus: this.deviceAccountRef.tokenStatus
    };
  }
}

/**
 * Tap-to-Phone (SoftPOS) Emulator
 * Simulates merchant acceptance on mobile device
 */
class TapToPhoneEmulator {
  constructor(config = {}) {
    this.deviceConfig = new MobileDeviceConfig({
      ...config,
      mode: HCEMode.TAP_TO_PHONE
    });
    
    this.merchantId = config.merchantId || 'MERCHANT001';
    this.terminalId = config.terminalId || 'TTP00001';
    
    // Supported kernels for acceptance
    this.supportedKernels = config.supportedKernels || [
      KernelID.C2, KernelID.C3, KernelID.C4, KernelID.C6
    ];
    
    this.supportsC8 = config.supportsC8 || false;
    if (this.supportsC8) {
      this.supportedKernels.push(KernelID.C8);
    }
    
    // Transaction limits
    this.contactlessLimit = config.contactlessLimit || 25000;
    this.cvmLimit = config.cvmLimit || 5000;
    
    // Transaction state
    this.currentTransaction = null;
    this.transactionHistory = [];
    
    // Security state
    this.attestationValid = false;
    this.securityLevel = config.securityLevel || 'STANDARD';
  }
  
  /**
   * Initialize terminal for acceptance
   */
  async initialize() {
    // Simulate device attestation
    this.attestationValid = true;
    
    return {
      success: true,
      merchantId: this.merchantId,
      terminalId: this.terminalId,
      supportedKernels: this.supportedKernels,
      maxTransactionAmount: this.contactlessLimit
    };
  }
  
  /**
   * Start a new transaction
   */
  startTransaction(amount, currencyCode = '0840') {
    if (!this.attestationValid) {
      throw new Error('Device not properly attested');
    }
    
    this.currentTransaction = {
      id: crypto.randomBytes(8).toString('hex'),
      amount,
      currencyCode,
      startTime: Date.now(),
      status: 'WAITING_FOR_CARD',
      cardData: null,
      result: null
    };
    
    return {
      transactionId: this.currentTransaction.id,
      status: 'WAITING_FOR_CARD',
      timeoutMs: 60000
    };
  }
  
  /**
   * Process card tap
   */
  async processCardTap(cardEmulator) {
    if (!this.currentTransaction) {
      throw new Error('No active transaction');
    }
    
    this.currentTransaction.status = 'PROCESSING';
    
    // Import terminal emulator functionality
    const { TerminalEmulator, TerminalConfiguration } = require('../terminal/terminal-emulator');
    
    // Create internal terminal for processing
    const terminalConfig = new TerminalConfiguration({
      name: 'TapToPhone Internal',
      supportedKernels: this.supportedKernels,
      supportsC8: this.supportsC8,
      contactlessEnabled: true,
      contactlessTransactionLimit: this.contactlessLimit,
      contactlessCVMLimit: this.cvmLimit
    });
    
    const terminal = new TerminalEmulator(terminalConfig);
    
    // Execute transaction
    const result = await terminal.executeContactlessTransaction(cardEmulator, {
      amount: this.currentTransaction.amount,
      currencyCode: this.currentTransaction.currencyCode
    });
    
    this.currentTransaction.result = result;
    this.currentTransaction.status = result.success ? 'COMPLETED' : 'FAILED';
    this.currentTransaction.endTime = Date.now();
    
    // Store in history
    this.transactionHistory.push({ ...this.currentTransaction });
    
    // Add TTP-specific interop issues
    if (result.interopIssues) {
      this.addTTPInteropIssues(result);
    }
    
    const completedTransaction = this.currentTransaction;
    this.currentTransaction = null;
    
    return completedTransaction;
  }
  
  /**
   * Add Tap-to-Phone specific interop issues
   */
  addTTPInteropIssues(result) {
    // Check for issues specific to mobile acceptance
    
    // FFI mobile acceptance support
    const ffi = result.cardData?.['9F6E'];
    if (ffi) {
      const formFactor = parseInt(ffi.substring(2, 4), 16) & 0x0F;
      if (formFactor === 0x02) {  // Mobile phone
        result.interopIssues.push({
          type: 'TTP_MOBILE_TO_MOBILE',
          severity: 'INFO',
          message: 'Mobile phone presenting to Tap-to-Phone terminal',
          recommendation: 'Verify consumer device CVM handling'
        });
      }
    }
    
    // Check CD-CVM support
    const cdcvmResults = result.cardData?.['9F6D'];
    if (cdcvmResults) {
      result.interopIssues.push({
        type: 'TTP_CDCVM_PRESENT',
        severity: 'INFO',
        message: 'Consumer Device CVM results present',
        cdcvmResults,
        recommendation: 'Verify CD-CVM is accepted by TTP solution'
      });
    }
  }
  
  /**
   * Cancel current transaction
   */
  cancelTransaction() {
    if (this.currentTransaction) {
      this.currentTransaction.status = 'CANCELLED';
      this.currentTransaction.endTime = Date.now();
      this.transactionHistory.push({ ...this.currentTransaction });
      this.currentTransaction = null;
    }
    return { success: true };
  }
  
  /**
   * Get transaction history
   */
  getTransactionHistory() {
    return this.transactionHistory;
  }
}

/**
 * Mobile Emulator Factory
 */
class MobileEmulatorFactory {
  /**
   * Create iOS Apple Pay-style emulator
   */
  static createApplePayEmulator(network = 'MASTERCARD') {
    const aid = network === 'VISA' ? StandardAIDs.VISA_CREDIT : StandardAIDs.MASTERCARD_CREDIT;
    const kernelId = network === 'VISA' ? KernelID.C3 : KernelID.C2;
    
    const deviceConfig = new MobileDeviceConfig({
      platform: MobilePlatform.IOS,
      mode: HCEMode.PAYMENT,
      sdkVersion: MobileSDKVersion.IOS_PASSKIT_3_0,
      deviceModel: 'iPhone 15 Pro',
      osVersion: '17.0',
      deviceAuthenticationMethod: 'FACE_ID',
      secureElementType: 'eSE'
    });
    
    const profile = new MobileCardProfile({
      name: 'Apple Pay Card',
      specVersion: 'MOBILE_3.0',
      interfaceType: InterfaceType.MOBILE_HCE,
      primaryAID: aid,
      supportedAIDs: [aid],
      kernelId: kernelId,
      deviceConfig,
      isTokenized: true,
      supportsDynamicCVM: true
    });
    
    return new MobileHCEEmulator(profile);
  }
  
  /**
   * Create Android Google Pay-style emulator
   */
  static createGooglePayEmulator(network = 'MASTERCARD') {
    const aid = network === 'VISA' ? StandardAIDs.VISA_CREDIT : StandardAIDs.MASTERCARD_CREDIT;
    const kernelId = network === 'VISA' ? KernelID.C3 : KernelID.C2;
    
    const deviceConfig = new MobileDeviceConfig({
      platform: MobilePlatform.ANDROID,
      mode: HCEMode.PAYMENT,
      sdkVersion: MobileSDKVersion.GOOGLE_PAY_2_0,
      deviceModel: 'Pixel 8 Pro',
      osVersion: '14.0',
      deviceAuthenticationMethod: 'FINGERPRINT',
      secureElementType: 'HCE'  // Android typically uses cloud-based HCE
    });
    
    const profile = new MobileCardProfile({
      name: 'Google Pay Card',
      specVersion: 'MOBILE_2.0',
      interfaceType: InterfaceType.MOBILE_HCE,
      primaryAID: aid,
      supportedAIDs: [aid],
      kernelId: kernelId,
      deviceConfig,
      isTokenized: true,
      supportsDynamicCVM: true
    });
    
    return new MobileHCEEmulator(profile);
  }
  
  /**
   * Create Tap-to-Phone (SoftPOS) emulator
   */
  static createTapToPhoneEmulator(options = {}) {
    return new TapToPhoneEmulator({
      platform: options.platform || MobilePlatform.ANDROID,
      merchantId: options.merchantId,
      terminalId: options.terminalId,
      supportsC8: options.supportsC8 || false,
      contactlessLimit: options.contactlessLimit || 25000,
      cvmLimit: options.cvmLimit || 5000
    });
  }
  
  /**
   * Create emulator for specific interop scenario
   */
  static createInteropTestMobile(scenario) {
    switch (scenario) {
      case 'TOKENIZED_WITH_PAR':
        const profileWithPAR = new MobileCardProfile({
          name: 'Interop Test - Tokenized with PAR',
          isTokenized: true,
          supportsDynamicCVM: true
        });
        return new MobileHCEEmulator(profileWithPAR);
        
      case 'NON_TOKENIZED_MOBILE':
        const deviceConfig = new MobileDeviceConfig({
          platform: MobilePlatform.ANDROID,
          secureElementType: 'eSE'
        });
        const nonTokenProfile = new MobileCardProfile({
          name: 'Interop Test - Non-tokenized',
          deviceConfig,
          isTokenized: false,
          supportsDynamicCVM: true
        });
        return new MobileHCEEmulator(nonTokenProfile);
        
      case 'LEGACY_MOBILE':
        const legacyDeviceConfig = new MobileDeviceConfig({
          platform: MobilePlatform.ANDROID,
          sdkVersion: MobileSDKVersion.ANDROID_HCE_1_0,
          deviceAuthenticationMethod: 'PASSCODE'
        });
        const legacyProfile = new MobileCardProfile({
          name: 'Interop Test - Legacy Mobile',
          deviceConfig: legacyDeviceConfig,
          isTokenized: true,
          supportsDynamicCVM: false  // Older version
        });
        return new MobileHCEEmulator(legacyProfile);
        
      default:
        return this.createApplePayEmulator();
    }
  }
}

module.exports = {
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
};
