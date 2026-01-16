/**
 * EMV Card Emulator
 * 
 * Simulates contact and contactless cards with various specification versions.
 * Supports multiple AIDs, kernel configurations, and applet versions.
 */

const { TLVParser, TLVBuilder, DOLParser, EMV_TAGS } = require('../../core/tlv/tlv-parser');
const { CommandAPDU, ResponseAPDU, EMVCommands, CLA, INS, SW } = require('../../core/apdu/apdu-handler');
const { KernelID, InterfaceType } = require('../../core/protocol/emv-engine');
const crypto = require('crypto');

// Card Specification Versions
const CardSpecVersion = {
  // Visa
  VISA_VSDC_2_5: 'VISA_VSDC_2.5',
  VISA_VSDC_2_6: 'VISA_VSDC_2.6',
  VISA_CTLS_2_9: 'VISA_CTLS_2.9',
  VISA_CTLS_2_10: 'VISA_CTLS_2.10',
  
  // Mastercard
  MC_MCHIP_4_0: 'MC_MCHIP_4.0',
  MC_MCHIP_4_1: 'MC_MCHIP_4.1',
  MC_CTLS_3_0: 'MC_CTLS_3.0',
  MC_CTLS_3_1: 'MC_CTLS_3.1',
  
  // Amex
  AMEX_EXPRESS_1_0: 'AMEX_EXPRESS_1.0',
  AMEX_CTLS_1_0: 'AMEX_CTLS_1.0',
  
  // Discover
  DISCOVER_DPAS_1_0: 'DISCOVER_DPAS_1.0',
  DISCOVER_DPAS_2_1: 'DISCOVER_DPAS_2.1',
  
  // Common Contactless Kernel (C8)
  C8_1_0: 'C8_1.0',
  C8_1_1: 'C8_1.1'
};

// Well-known AIDs
const StandardAIDs = {
  PPSE: 'A000000004101001',    // Mastercard PPSE
  PSE: 'A000000001530001',     // Contact PSE
  VISA_CREDIT: 'A0000000031010',
  VISA_DEBIT: 'A0000000032010',
  MASTERCARD_CREDIT: 'A0000000041010',
  MASTERCARD_DEBIT: 'A0000000042010',
  MASTERCARD_MAESTRO: 'A0000000043060',
  AMEX: 'A000000025010801',
  DISCOVER: 'A0000001523010',
  JCB: 'A0000000651010',
  UNIONPAY_DEBIT: 'A000000333010101',
  UNIONPAY_CREDIT: 'A000000333010102'
};

/**
 * Card Profile - Defines card behavior and data
 */
class CardProfile {
  constructor(options = {}) {
    this.name = options.name || 'Generic Card';
    this.specVersion = options.specVersion || CardSpecVersion.MC_MCHIP_4_1;
    this.interfaceType = options.interfaceType || InterfaceType.CONTACTLESS;
    this.primaryAID = options.primaryAID || StandardAIDs.MASTERCARD_CREDIT;
    this.supportedAIDs = options.supportedAIDs || [this.primaryAID];
    
    // Card data (tag -> value)
    this.staticData = new Map();
    this.dynamicDataGenerator = null;
    
    // Kernel configuration
    this.kernelId = options.kernelId || KernelID.C2;
    this.supportsC8 = options.supportsC8 || false;
    
    // Offline data authentication
    this.odaType = options.odaType || 'CDA';  // SDA, DDA, CDA, None
    this.icaPublicKey = options.icaPublicKey || null;
    this.iccPrivateKey = options.iccPrivateKey || null;
    
    // CVM configuration
    this.cvmList = options.cvmList || this.getDefaultCVMList();
    
    // Initialize default data
    this.initializeDefaultData();
  }
  
  /**
   * Initialize default card data
   */
  initializeDefaultData() {
    // Application Label (tag 50)
    this.staticData.set('50', Buffer.from('CREDIT').toString('hex'));
    
    // PAN (tag 5A) - Test PAN
    this.staticData.set('5A', '5413330000000019');
    
    // Expiration Date (tag 5F24) - YYMMDD
    this.staticData.set('5F24', '271231');
    
    // Track 2 Equivalent Data (tag 57)
    this.staticData.set('57', '5413330000000019D2712101123400001F');
    
    // Cardholder Name (tag 5F20)
    this.staticData.set('5F20', Buffer.from('TEST/CARD').toString('hex'));
    
    // PAN Sequence Number (tag 5F34)
    this.staticData.set('5F34', '01');
    
    // Application Version Number (tag 9F08)
    this.staticData.set('9F08', '0002');
    
    // Application Usage Control (tag 9F07)
    this.staticData.set('9F07', 'FF00');
    
    // Issuer Action Codes
    this.staticData.set('9F0D', 'FC50A00000');  // Default
    this.staticData.set('9F0E', '0000000000');  // Denial
    this.staticData.set('9F0F', 'F850A49800');  // Online
    
    // AIP - Application Interchange Profile (tag 82)
    this.staticData.set('82', '3900');  // SDA supported, CDA supported
    
    // AFL - Application File Locator (tag 94)
    this.staticData.set('94', '08010100');  // SFI 1, records 1-1, 0 for ODA
    
    // CDOL1 (tag 8C)
    this.staticData.set('8C', '9F02069F03069F1A0295055F2A029A039C019F3704');
    
    // CDOL2 (tag 8D)
    this.staticData.set('8D', '910A8A029F3704');
    
    // CVM List (tag 8E)
    this.staticData.set('8E', this.cvmList);
    
    // Kernel Identifier (tag 9F2A) - for contactless
    if (this.interfaceType === InterfaceType.CONTACTLESS) {
      this.staticData.set('9F2A', Buffer.from([this.kernelId]).toString('hex'));
      
      // Form Factor Indicator (tag 9F6E)
      this.staticData.set('9F6E', '20700000');  // Card form factor
      
      // Card Transaction Qualifiers (tag 9F6C)
      this.staticData.set('9F6C', '3E00');
    }
    
    // Add PAR if supported (newer spec versions)
    if (this.supportsSpecFeature('PAR')) {
      // Payment Account Reference (29 chars, encoded as hex)
      this.staticData.set('DF8101', Buffer.from('500000000000000000000000000000').toString('hex'));
    }
    
    // PDOL (tag 9F38) - Processing Options DOL
    this.staticData.set('9F38', '9F66049F02069F03069F1A0295055F2A029A039C019F3704');
    
    // Issuer Application Data format depends on network
    this.staticData.set('9F10', this.generateIAD());
  }
  
  /**
   * Check if spec version supports a feature
   */
  supportsSpecFeature(feature) {
    const featureSupport = {
      'PAR': [
        CardSpecVersion.VISA_CTLS_2_10,
        CardSpecVersion.MC_CTLS_3_1,
        CardSpecVersion.C8_1_0,
        CardSpecVersion.C8_1_1
      ],
      'FFI': [
        CardSpecVersion.MC_CTLS_3_0,
        CardSpecVersion.MC_CTLS_3_1,
        CardSpecVersion.VISA_CTLS_2_10,
        CardSpecVersion.C8_1_0,
        CardSpecVersion.C8_1_1
      ],
      'C8': [
        CardSpecVersion.C8_1_0,
        CardSpecVersion.C8_1_1
      ]
    };
    
    return (featureSupport[feature] || []).includes(this.specVersion);
  }
  
  /**
   * Get default CVM List
   */
  getDefaultCVMList() {
    // CVM List format:
    // Bytes 0-3: X (amount field 1)
    // Bytes 4-7: Y (amount field 2)
    // Bytes 8+: CV Rules (2 bytes each)
    
    // Amount X=00001000 (100.00), Y=00005000 (500.00)
    // Rules: Signature, No CVM, Fail
    return '00001000000050001F0002014403';
  }
  
  /**
   * Generate Issuer Application Data based on network
   */
  generateIAD() {
    // IAD format varies by network
    if (this.primaryAID.startsWith('A00000000')) {
      // Visa or Mastercard-like
      return '0FA501A030F8000000000000000000000F';
    }
    return '0FA501A030F8000000000000000000000F';
  }
  
  /**
   * Set card data
   */
  setData(tagHex, valueHex) {
    this.staticData.set(tagHex.toUpperCase(), valueHex.toUpperCase());
  }
  
  /**
   * Get card data
   */
  getData(tagHex) {
    return this.staticData.get(tagHex.toUpperCase());
  }
  
  /**
   * Configure card for specific interop scenario
   */
  configureForScenario(scenario) {
    switch (scenario) {
      case 'C8_WITH_LEGACY_FALLBACK':
        this.supportsC8 = true;
        this.staticData.set('9F6D', '01');  // Support C8
        this.staticData.set('DF8104', '01');  // Interop indicator
        break;
        
      case 'FFI_NON_STANDARD':
        // Set non-standard FFI to test terminal handling
        this.staticData.set('9F6E', 'FF700000');
        break;
        
      case 'PAR_PRESENT':
        this.staticData.set('DF8101', Buffer.from('500000000000000000000000000000').toString('hex'));
        break;
        
      case 'VISA_FORMAT_ON_MC':
        // Simulate Visa-style Track 2 on MC app (interop issue)
        this.staticData.set('57', '5413330000000019=2712101123400001F');
        break;
    }
  }
}

/**
 * Card Emulator - Handles APDU communication
 */
class CardEmulator {
  constructor(profile) {
    this.profile = profile;
    this.selectedAID = null;
    this.currentState = 'IDLE';
    this.atc = 1;  // Application Transaction Counter
    this.transactionLog = [];
  }
  
  /**
   * Process incoming command APDU
   * @param {CommandAPDU|string} command - Command APDU
   * @returns {ResponseAPDU} Response APDU
   */
  processCommand(command) {
    const cmd = typeof command === 'string' 
      ? CommandAPDU.fromHex(command) 
      : command;
    
    this.transactionLog.push({
      type: 'COMMAND',
      timestamp: Date.now(),
      apdu: cmd.toHex()
    });
    
    let response;
    
    switch (cmd.ins) {
      case INS.SELECT:
        response = this.processSelect(cmd);
        break;
        
      case INS.GET_PROCESSING_OPTIONS:
        response = this.processGPO(cmd);
        break;
        
      case INS.READ_RECORD:
        response = this.processReadRecord(cmd);
        break;
        
      case INS.GET_DATA:
        response = this.processGetData(cmd);
        break;
        
      case INS.GENERATE_AC:
        response = this.processGenerateAC(cmd);
        break;
        
      case INS.VERIFY:
        response = this.processVerify(cmd);
        break;
        
      case INS.INTERNAL_AUTHENTICATE:
        response = this.processInternalAuth(cmd);
        break;
        
      case INS.COMPUTE_CRYPTOGRAPHIC_CHECKSUM:
        response = this.processCCC(cmd);
        break;
        
      default:
        response = ResponseAPDU.error(SW.INS_NOT_SUPPORTED);
    }
    
    this.transactionLog.push({
      type: 'RESPONSE',
      timestamp: Date.now(),
      apdu: response.toHex()
    });
    
    return response;
  }
  
  /**
   * Process SELECT command
   */
  processSelect(cmd) {
    if (cmd.p1 !== 0x04) {
      return ResponseAPDU.error(SW.INCORRECT_P1P2);
    }
    
    const requestedAID = cmd.data.toString('hex').toUpperCase();
    
    // Check for PPSE (contactless directory)
    if (requestedAID === '325041592E5359532E4444463031') {
      return this.buildPPSEResponse();
    }
    
    // Check for PSE (contact directory)
    if (requestedAID === '315041592E5359532E4444463031') {
      return this.buildPSEResponse();
    }
    
    // Check if AID is supported
    const supportedAID = this.profile.supportedAIDs.find(aid => 
      requestedAID.startsWith(aid) || aid.startsWith(requestedAID)
    );
    
    if (!supportedAID) {
      return ResponseAPDU.error(SW.FILE_NOT_FOUND);
    }
    
    this.selectedAID = supportedAID;
    this.currentState = 'SELECTED';
    
    return this.buildFCIResponse();
  }
  
  /**
   * Build PPSE response (contactless directory)
   */
  buildPPSEResponse() {
    const builder = new TLVBuilder();
    
    builder.addConstructed('6F', (fci) => {
      // DF Name
      fci.addPrimitive('84', '325041592E5359532E4444463031');
      
      // FCI Proprietary Template
      fci.addConstructed('A5', (prop) => {
        // FCI Issuer Discretionary Data
        prop.addConstructed('BF0C', (issuer) => {
          // Directory Entry for each AID
          for (const aid of this.profile.supportedAIDs) {
            issuer.addConstructed('61', (entry) => {
              entry.addPrimitive('4F', aid);
              entry.addPrimitive('50', Buffer.from(this.profile.name.substring(0, 16)).toString('hex'));
              entry.addPrimitive('87', '01');  // Priority
              
              // Kernel Identifier (contactless)
              if (this.profile.interfaceType === InterfaceType.CONTACTLESS) {
                entry.addPrimitive('9F2A', Buffer.from([this.profile.kernelId]).toString('hex'));
              }
            });
          }
        });
      });
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Build PSE response (contact directory)
   */
  buildPSEResponse() {
    const builder = new TLVBuilder();
    
    builder.addConstructed('6F', (fci) => {
      fci.addPrimitive('84', '315041592E5359532E4444463031');
      fci.addConstructed('A5', (prop) => {
        prop.addPrimitive('88', '01');  // SFI of directory
      });
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Build FCI response for selected AID
   */
  buildFCIResponse() {
    const builder = new TLVBuilder();
    
    builder.addConstructed('6F', (fci) => {
      // DF Name (AID)
      fci.addPrimitive('84', this.selectedAID);
      
      // FCI Proprietary Template
      fci.addConstructed('A5', (prop) => {
        // Application Label
        const label = this.profile.getData('50');
        if (label) {
          prop.addPrimitive('50', label);
        }
        
        // PDOL
        const pdol = this.profile.getData('9F38');
        if (pdol) {
          prop.addPrimitive('9F38', pdol);
        }
        
        // Language Preference
        prop.addPrimitive('5F2D', Buffer.from('en').toString('hex'));
        
        // FCI Issuer Discretionary Data
        prop.addConstructed('BF0C', (issuer) => {
          // Application Version Number - Card
          const version = this.profile.getData('9F08');
          if (version) {
            issuer.addPrimitive('9F08', version);
          }
          
          // Kernel Identifier for contactless
          if (this.profile.interfaceType === InterfaceType.CONTACTLESS) {
            issuer.addPrimitive('9F2A', Buffer.from([this.profile.kernelId]).toString('hex'));
          }
        });
      });
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Process GET PROCESSING OPTIONS command
   */
  processGPO(cmd) {
    if (this.currentState !== 'SELECTED') {
      return ResponseAPDU.error(SW.CONDITIONS_NOT_SATISFIED);
    }
    
    // Parse PDOL data from command (wrapped in tag 83)
    // For now, we'll just return standard response
    
    this.currentState = 'GPO_COMPLETE';
    
    const builder = new TLVBuilder();
    
    // Use Format 2 (tag 77)
    builder.addConstructed('77', (resp) => {
      // AIP
      const aip = this.profile.getData('82');
      resp.addPrimitive('82', aip);
      
      // AFL
      const afl = this.profile.getData('94');
      resp.addPrimitive('94', afl);
      
      // For contactless, include additional tags
      if (this.profile.interfaceType === InterfaceType.CONTACTLESS) {
        // Track 2
        const track2 = this.profile.getData('57');
        if (track2) {
          resp.addPrimitive('57', track2);
        }
        
        // PAN
        const pan = this.profile.getData('5A');
        if (pan) {
          resp.addPrimitive('5A', pan);
        }
        
        // Form Factor Indicator
        const ffi = this.profile.getData('9F6E');
        if (ffi) {
          resp.addPrimitive('9F6E', ffi);
        }
        
        // Card Transaction Qualifiers
        const ctq = this.profile.getData('9F6C');
        if (ctq) {
          resp.addPrimitive('9F6C', ctq);
        }
      }
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Process READ RECORD command
   */
  processReadRecord(cmd) {
    if (this.currentState !== 'GPO_COMPLETE' && this.currentState !== 'READING') {
      return ResponseAPDU.error(SW.CONDITIONS_NOT_SATISFIED);
    }
    
    const recordNumber = cmd.p1;
    const sfi = (cmd.p2 & 0xF8) >> 3;
    
    this.currentState = 'READING';
    
    // Build record response based on SFI and record number
    const builder = new TLVBuilder();
    
    builder.addConstructed('70', (record) => {
      if (sfi === 1 && recordNumber === 1) {
        // Record 1 - Basic card data
        const pan = this.profile.getData('5A');
        if (pan) record.addPrimitive('5A', pan);
        
        const expiry = this.profile.getData('5F24');
        if (expiry) record.addPrimitive('5F24', expiry);
        
        const cardholderName = this.profile.getData('5F20');
        if (cardholderName) record.addPrimitive('5F20', cardholderName);
        
        const track2 = this.profile.getData('57');
        if (track2) record.addPrimitive('57', track2);
        
        // Service Code
        record.addPrimitive('5F30', '0201');
        
        // PAN Sequence Number
        const psn = this.profile.getData('5F34');
        if (psn) record.addPrimitive('5F34', psn);
      } else if (sfi === 1 && recordNumber === 2) {
        // Record 2 - Application data
        const cdol1 = this.profile.getData('8C');
        if (cdol1) record.addPrimitive('8C', cdol1);
        
        const cdol2 = this.profile.getData('8D');
        if (cdol2) record.addPrimitive('8D', cdol2);
        
        const cvmList = this.profile.getData('8E');
        if (cvmList) record.addPrimitive('8E', cvmList);
        
        // Issuer Action Codes
        record.addPrimitive('9F0D', this.profile.getData('9F0D'));
        record.addPrimitive('9F0E', this.profile.getData('9F0E'));
        record.addPrimitive('9F0F', this.profile.getData('9F0F'));
      } else if (sfi === 2 && recordNumber === 1) {
        // Record for PAR and additional data (newer specs)
        const par = this.profile.getData('DF8101');
        if (par) record.addPrimitive('DF8101', par);
      } else {
        // Record not found
        return ResponseAPDU.error(SW.RECORD_NOT_FOUND);
      }
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Process GET DATA command
   */
  processGetData(cmd) {
    const tagHex = cmd.p1 === 0x00 
      ? cmd.p2.toString(16).padStart(2, '0')
      : (cmd.p1.toString(16).padStart(2, '0') + cmd.p2.toString(16).padStart(2, '0'));
    
    const data = this.profile.getData(tagHex.toUpperCase());
    
    if (!data) {
      return ResponseAPDU.error(SW.REFERENCED_DATA_NOT_FOUND);
    }
    
    const builder = new TLVBuilder();
    builder.addPrimitive(tagHex, data);
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Process GENERATE AC command
   */
  processGenerateAC(cmd) {
    if (this.currentState !== 'READING' && this.currentState !== 'GPO_COMPLETE') {
      return ResponseAPDU.error(SW.CONDITIONS_NOT_SATISFIED);
    }
    
    const requestedCryptogramType = cmd.p1 & 0xC0;
    // const cdaRequested = (cmd.p1 & 0x10) !== 0;
    
    this.currentState = 'AC_GENERATED';
    this.atc++;
    
    // Determine what cryptogram to return
    let returnedCryptogramType = requestedCryptogramType;
    
    // Generate AC response
    const builder = new TLVBuilder();
    
    builder.addConstructed('77', (resp) => {
      // Cryptogram Information Data (CID)
      resp.addPrimitive('9F27', Buffer.from([returnedCryptogramType]).toString('hex'));
      
      // Application Transaction Counter (ATC)
      resp.addPrimitive('9F36', this.atc.toString(16).padStart(4, '0'));
      
      // Application Cryptogram (8 bytes)
      const ac = crypto.randomBytes(8);
      resp.addPrimitive('9F26', ac.toString('hex'));
      
      // Issuer Application Data
      const iad = this.profile.getData('9F10');
      if (iad) {
        resp.addPrimitive('9F10', iad);
      }
      
      // For CDA, include signed data
      // if (cdaRequested && this.profile.odaType === 'CDA') {
      //   const signedData = this.generateSignedDynamicData();
      //   resp.addPrimitive('9F4B', signedData);
      // }
    });
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Process VERIFY (PIN) command
   */
  processVerify(cmd) {
    // Simplified PIN verification - always succeed for testing
    return ResponseAPDU.success();
  }
  
  /**
   * Process INTERNAL AUTHENTICATE command
   */
  processInternalAuth(cmd) {
    // Generate signed dynamic application data
    const signedData = crypto.randomBytes(64);
    
    return ResponseAPDU.success(signedData);
  }
  
  /**
   * Process COMPUTE CRYPTOGRAPHIC CHECKSUM (Mastercard)
   */
  processCCC(cmd) {
    // Generate CVC3
    const cvc3 = crypto.randomBytes(2);
    
    const builder = new TLVBuilder();
    builder.addPrimitive('9F61', cvc3.toString('hex'));
    
    return ResponseAPDU.success(builder.build());
  }
  
  /**
   * Reset card to initial state
   */
  reset() {
    this.selectedAID = null;
    this.currentState = 'IDLE';
    this.transactionLog = [];
  }
  
  /**
   * Get transaction log
   */
  getTransactionLog() {
    return this.transactionLog;
  }
}

/**
 * Card Factory - Creates cards with predefined configurations
 */
class CardFactory {
  /**
   * Create a Visa contactless card
   */
  static createVisaContactless(version = CardSpecVersion.VISA_CTLS_2_10) {
    const profile = new CardProfile({
      name: 'Visa Contactless',
      specVersion: version,
      interfaceType: InterfaceType.CONTACTLESS,
      primaryAID: StandardAIDs.VISA_CREDIT,
      supportedAIDs: [StandardAIDs.VISA_CREDIT, StandardAIDs.VISA_DEBIT],
      kernelId: KernelID.C3,
      supportsC8: version === CardSpecVersion.C8_1_0 || version === CardSpecVersion.C8_1_1
    });
    
    return new CardEmulator(profile);
  }
  
  /**
   * Create a Mastercard contactless card
   */
  static createMastercardContactless(version = CardSpecVersion.MC_CTLS_3_1) {
    const profile = new CardProfile({
      name: 'Mastercard Contactless',
      specVersion: version,
      interfaceType: InterfaceType.CONTACTLESS,
      primaryAID: StandardAIDs.MASTERCARD_CREDIT,
      supportedAIDs: [StandardAIDs.MASTERCARD_CREDIT, StandardAIDs.MASTERCARD_DEBIT],
      kernelId: KernelID.C2,
      supportsC8: version === CardSpecVersion.C8_1_0 || version === CardSpecVersion.C8_1_1
    });
    
    // Mastercard-specific data
    profile.setData('9F6C', '3E00');  // CTQ
    
    return new CardEmulator(profile);
  }
  
  /**
   * Create a C8 (Common Kernel) card
   */
  static createC8Card(networkPrimary = 'MC') {
    const primaryAID = networkPrimary === 'VISA' 
      ? StandardAIDs.VISA_CREDIT 
      : StandardAIDs.MASTERCARD_CREDIT;
    
    const profile = new CardProfile({
      name: 'C8 Common Kernel Card',
      specVersion: CardSpecVersion.C8_1_0,
      interfaceType: InterfaceType.CONTACTLESS,
      primaryAID: primaryAID,
      supportedAIDs: [primaryAID],
      kernelId: KernelID.C8,
      supportsC8: true
    });
    
    // C8-specific tags
    profile.setData('DF8102', '0100');  // Common Kernel Version
    profile.setData('DF8104', '01');    // Interoperability Indicator
    profile.setData('9F6D', Buffer.from([KernelID.C8]).toString('hex'));
    
    return new CardEmulator(profile);
  }
  
  /**
   * Create a card configured for specific interop testing
   */
  static createInteropTestCard(scenario) {
    const profile = new CardProfile({
      name: `Interop Test Card - ${scenario}`,
      specVersion: CardSpecVersion.MC_CTLS_3_1,
      interfaceType: InterfaceType.CONTACTLESS,
      primaryAID: StandardAIDs.MASTERCARD_CREDIT,
      kernelId: KernelID.C2
    });
    
    profile.configureForScenario(scenario);
    
    return new CardEmulator(profile);
  }
}

module.exports = {
  CardEmulator,
  CardProfile,
  CardFactory,
  CardSpecVersion,
  StandardAIDs
};
