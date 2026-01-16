/**
 * EMV Protocol Engine
 * 
 * Implements the EMV transaction flow state machine for both contact and contactless.
 * Handles application selection, card reading, authentication, and cryptogram generation.
 */

const { TLVParser, TLVBuilder, DOLParser, EMV_TAGS } = require('../tlv/tlv-parser');
const { CommandAPDU, ResponseAPDU, EMVCommands, SW } = require('../apdu/apdu-handler');

// EMV Transaction States
const TransactionState = {
  IDLE: 'IDLE',
  APPLICATION_SELECTION: 'APPLICATION_SELECTION',
  INITIATE_APPLICATION_PROCESSING: 'INITIATE_APPLICATION_PROCESSING',
  READ_APPLICATION_DATA: 'READ_APPLICATION_DATA',
  OFFLINE_DATA_AUTHENTICATION: 'OFFLINE_DATA_AUTHENTICATION',
  PROCESSING_RESTRICTIONS: 'PROCESSING_RESTRICTIONS',
  CARDHOLDER_VERIFICATION: 'CARDHOLDER_VERIFICATION',
  TERMINAL_RISK_MANAGEMENT: 'TERMINAL_RISK_MANAGEMENT',
  TERMINAL_ACTION_ANALYSIS: 'TERMINAL_ACTION_ANALYSIS',
  CARD_ACTION_ANALYSIS: 'CARD_ACTION_ANALYSIS',
  ONLINE_PROCESSING: 'ONLINE_PROCESSING',
  ISSUER_SCRIPT_PROCESSING: 'ISSUER_SCRIPT_PROCESSING',
  COMPLETION: 'COMPLETION',
  ERROR: 'ERROR'
};

// Cryptogram Types
const CryptogramType = {
  AAC: 0x00,   // Application Authentication Cryptogram (Decline)
  TC: 0x40,    // Transaction Certificate (Approve offline)
  ARQC: 0x80   // Authorization Request Cryptogram (Go online)
};

// Interface Types
const InterfaceType = {
  CONTACT: 'CONTACT',
  CONTACTLESS: 'CONTACTLESS',
  MOBILE_HCE: 'MOBILE_HCE'
};

// Kernel Identifiers
const KernelID = {
  C1: 0x01,  // JCB (legacy)
  C2: 0x02,  // Mastercard M/Chip
  C3: 0x03,  // Visa payWave
  C4: 0x04,  // American Express ExpressPay
  C5: 0x05,  // JCB
  C6: 0x06,  // Discover D-PAS
  C7: 0x07,  // UnionPay QuickPass
  C8: 0x08   // Common Contactless Kernel
};

/**
 * EMV Transaction Context
 * Holds all data for a transaction
 */
class TransactionContext {
  constructor(interfaceType = InterfaceType.CONTACTLESS) {
    this.interfaceType = interfaceType;
    this.state = TransactionState.IDLE;
    this.kernel = null;
    
    // Transaction data
    this.selectedAID = null;
    this.fci = null;              // File Control Information
    this.pdol = null;             // Processing Options DOL
    this.aip = null;              // Application Interchange Profile
    this.afl = null;              // Application File Locator
    this.records = [];            // Read records
    this.cardData = new Map();    // All card data (tag -> value)
    
    // Terminal data
    this.terminalData = new Map();
    this.tvr = Buffer.alloc(5);   // Terminal Verification Results
    this.tsi = Buffer.alloc(2);   // Transaction Status Information
    
    // Cryptogram data
    this.cdol1 = null;
    this.cdol2 = null;
    this.cryptogram = null;
    this.cryptogramType = null;
    
    // Authentication
    this.cvmResult = null;
    this.odaResult = null;
    
    // Timing (for contactless)
    this.timings = {
      selectStart: null,
      selectEnd: null,
      gpoStart: null,
      gpoEnd: null,
      readStart: null,
      readEnd: null,
      genACStart: null,
      genACEnd: null,
      totalTime: null
    };
    
    // Transaction log
    this.log = [];
    
    // Errors and warnings
    this.errors = [];
    this.warnings = [];
    this.interopIssues = [];
  }
  
  /**
   * Log a transaction event
   */
  logEvent(event, details = {}) {
    this.log.push({
      timestamp: Date.now(),
      state: this.state,
      event,
      details
    });
  }
  
  /**
   * Add card data from TLV
   */
  addCardData(tlvArray) {
    const addRecursive = (tlvList) => {
      for (const tlv of tlvList) {
        this.cardData.set(tlv.tagHex, tlv.valueHex);
        if (tlv.constructed && tlv.children.length > 0) {
          addRecursive(tlv.children);
        }
      }
    };
    addRecursive(tlvArray);
  }
  
  /**
   * Get card data by tag
   */
  getCardData(tagHex) {
    return this.cardData.get(tagHex.toUpperCase());
  }
  
  /**
   * Record an interoperability issue
   */
  recordInteropIssue(issue) {
    this.interopIssues.push({
      timestamp: Date.now(),
      state: this.state,
      ...issue
    });
  }
}

/**
 * EMV Protocol Engine
 */
class EMVProtocolEngine {
  constructor(options = {}) {
    this.options = {
      strictValidation: true,
      recordTimings: true,
      detectInteropIssues: true,
      ...options
    };
    
    this.eventHandlers = new Map();
  }
  
  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }
  
  /**
   * Emit event
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }
  
  /**
   * Create new transaction context
   */
  createTransaction(interfaceType) {
    return new TransactionContext(interfaceType);
  }
  
  /**
   * Process SELECT response (PPSE or AID)
   */
  processSelectResponse(ctx, response) {
    if (!response.isSuccess) {
      ctx.errors.push({
        phase: 'SELECT',
        sw: response.sw,
        message: response.getStatusDescription()
      });
      ctx.state = TransactionState.ERROR;
      return false;
    }
    
    // Parse FCI
    const fciTLV = TLVParser.parse(response.data.toString('hex'));
    ctx.fci = fciTLV;
    ctx.addCardData(fciTLV);
    
    // Extract PDOL if present
    const pdolTag = TLVParser.findTag(fciTLV, '9F38');
    if (pdolTag) {
      ctx.pdol = DOLParser.parse(pdolTag.valueHex);
      ctx.logEvent('PDOL_FOUND', { pdol: ctx.pdol });
    }
    
    // Extract kernel identifier if present (contactless)
    const kernelId = TLVParser.findTag(fciTLV, '9F2A');
    if (kernelId) {
      ctx.kernel = kernelId.value[0];
      ctx.logEvent('KERNEL_IDENTIFIED', { kernel: ctx.kernel });
    }
    
    // Check for FFI (Form Factor Indicator) - critical for interop testing
    const ffi = TLVParser.findTag(fciTLV, '9F6E');
    if (ffi) {
      ctx.logEvent('FFI_FOUND', { ffi: ffi.valueHex });
      this.validateFFI(ctx, ffi);
    }
    
    ctx.state = TransactionState.INITIATE_APPLICATION_PROCESSING;
    return true;
  }
  
  /**
   * Build GET PROCESSING OPTIONS command data
   */
  buildGPOData(ctx, terminalData) {
    if (!ctx.pdol || ctx.pdol.length === 0) {
      // No PDOL, send empty command template
      return Buffer.from([0x83, 0x00]);
    }
    
    // Build PDOL data
    const pdolData = DOLParser.buildData(ctx.pdol, terminalData);
    
    // Wrap in command template (tag 83)
    const builder = new TLVBuilder();
    builder.addPrimitive('83', pdolData);
    return builder.build();
  }
  
  /**
   * Process GET PROCESSING OPTIONS response
   */
  processGPOResponse(ctx, response) {
    if (!response.isSuccess) {
      ctx.errors.push({
        phase: 'GPO',
        sw: response.sw,
        message: response.getStatusDescription()
      });
      ctx.state = TransactionState.ERROR;
      return false;
    }
    
    const gpoData = response.data;
    
    // Check response format
    if (gpoData[0] === 0x80) {
      // Format 1 (tag 80)
      const length = gpoData[1];
      const aip = gpoData.slice(2, 4);
      const afl = gpoData.slice(4, 2 + length);
      
      ctx.aip = aip;
      ctx.afl = this.parseAFL(afl);
    } else if (gpoData[0] === 0x77) {
      // Format 2 (tag 77 - constructed)
      const tlvData = TLVParser.parse(gpoData.toString('hex'));
      ctx.addCardData(tlvData);
      
      const aipTag = TLVParser.findTag(tlvData, '82');
      if (aipTag) {
        ctx.aip = Buffer.from(aipTag.valueHex, 'hex');
      }
      
      const aflTag = TLVParser.findTag(tlvData, '94');
      if (aflTag) {
        ctx.afl = this.parseAFL(Buffer.from(aflTag.valueHex, 'hex'));
      }
    } else {
      ctx.errors.push({
        phase: 'GPO',
        message: `Unknown GPO response format: ${gpoData[0].toString(16)}`
      });
      ctx.state = TransactionState.ERROR;
      return false;
    }
    
    ctx.logEvent('GPO_PROCESSED', { 
      aip: ctx.aip?.toString('hex'),
      aflEntries: ctx.afl?.length 
    });
    
    ctx.state = TransactionState.READ_APPLICATION_DATA;
    return true;
  }
  
  /**
   * Parse Application File Locator (AFL)
   */
  parseAFL(aflData) {
    const entries = [];
    
    for (let i = 0; i < aflData.length; i += 4) {
      const sfi = (aflData[i] & 0xF8) >> 3;
      const firstRecord = aflData[i + 1];
      const lastRecord = aflData[i + 2];
      const numODARecords = aflData[i + 3];
      
      entries.push({
        sfi,
        firstRecord,
        lastRecord,
        numODARecords
      });
    }
    
    return entries;
  }
  
  /**
   * Generate READ RECORD commands from AFL
   */
  generateReadCommands(ctx) {
    const commands = [];
    
    if (!ctx.afl) return commands;
    
    for (const entry of ctx.afl) {
      for (let rec = entry.firstRecord; rec <= entry.lastRecord; rec++) {
        commands.push({
          command: EMVCommands.readRecord(rec, entry.sfi),
          sfi: entry.sfi,
          record: rec,
          includeInODA: rec - entry.firstRecord < entry.numODARecords
        });
      }
    }
    
    return commands;
  }
  
  /**
   * Process READ RECORD response
   */
  processReadRecordResponse(ctx, response, sfi, record) {
    if (!response.isSuccess) {
      ctx.warnings.push({
        phase: 'READ_RECORD',
        sfi,
        record,
        sw: response.sw,
        message: response.getStatusDescription()
      });
      return false;
    }
    
    // Parse record data (tag 70 template)
    const recordTLV = TLVParser.parse(response.data.toString('hex'));
    ctx.records.push({ sfi, record, data: recordTLV });
    ctx.addCardData(recordTLV);
    
    // Check for CDOL1/CDOL2
    const cdol1Tag = TLVParser.findTag(recordTLV, '8C');
    if (cdol1Tag) {
      ctx.cdol1 = DOLParser.parse(cdol1Tag.valueHex);
      ctx.logEvent('CDOL1_FOUND', { cdol1: ctx.cdol1 });
    }
    
    const cdol2Tag = TLVParser.findTag(recordTLV, '8D');
    if (cdol2Tag) {
      ctx.cdol2 = DOLParser.parse(cdol2Tag.valueHex);
      ctx.logEvent('CDOL2_FOUND', { cdol2: ctx.cdol2 });
    }
    
    // Check for PAR (Payment Account Reference) - critical for interop
    const parTag = TLVParser.findTag(recordTLV, 'DF8101');
    if (parTag) {
      ctx.logEvent('PAR_FOUND', { par: parTag.valueHex });
      this.validatePAR(ctx, parTag);
    }
    
    return true;
  }
  
  /**
   * Build GENERATE AC command data
   */
  buildGenACData(ctx, terminalData) {
    if (!ctx.cdol1) {
      ctx.errors.push({
        phase: 'GENERATE_AC',
        message: 'CDOL1 not available'
      });
      return null;
    }
    
    return DOLParser.buildData(ctx.cdol1, terminalData);
  }
  
  /**
   * Process GENERATE AC response
   */
  processGenACResponse(ctx, response) {
    if (!response.isSuccess) {
      ctx.errors.push({
        phase: 'GENERATE_AC',
        sw: response.sw,
        message: response.getStatusDescription()
      });
      ctx.state = TransactionState.ERROR;
      return false;
    }
    
    const acData = response.data;
    
    // Check response format
    if (acData[0] === 0x80) {
      // Format 1
      const cid = acData[2];
      ctx.cryptogramType = cid & 0xC0;
      ctx.cryptogram = acData.slice(3, 11);
    } else if (acData[0] === 0x77) {
      // Format 2
      const tlvData = TLVParser.parse(acData.toString('hex'));
      ctx.addCardData(tlvData);
      
      const cidTag = TLVParser.findTag(tlvData, '9F27');
      if (cidTag) {
        ctx.cryptogramType = cidTag.value[0] & 0xC0;
      }
      
      const acTag = TLVParser.findTag(tlvData, '9F26');
      if (acTag) {
        ctx.cryptogram = Buffer.from(acTag.valueHex, 'hex');
      }
    }
    
    ctx.logEvent('AC_GENERATED', {
      type: this.getCryptogramTypeName(ctx.cryptogramType),
      cryptogram: ctx.cryptogram?.toString('hex')
    });
    
    ctx.state = TransactionState.COMPLETION;
    return true;
  }
  
  /**
   * Get cryptogram type name
   */
  getCryptogramTypeName(type) {
    switch (type) {
      case CryptogramType.AAC: return 'AAC';
      case CryptogramType.TC: return 'TC';
      case CryptogramType.ARQC: return 'ARQC';
      default: return 'UNKNOWN';
    }
  }
  
  /**
   * Validate Form Factor Indicator (FFI) for interop issues
   */
  validateFFI(ctx, ffiTag) {
    if (!this.options.detectInteropIssues) return;
    
    const ffi = Buffer.from(ffiTag.valueHex, 'hex');
    
    // FFI Format (4 bytes):
    // Byte 1: Consumer Device Cardholder Verification Method (CD-CVM)
    // Byte 2: Form Factor Indicator
    // Byte 3-4: RFU
    
    if (ffi.length < 4) {
      ctx.recordInteropIssue({
        type: 'FFI_LENGTH',
        severity: 'WARNING',
        message: `FFI length is ${ffi.length} bytes, expected 4`,
        recommendation: 'Verify FFI format per EMV specification'
      });
    }
    
    // Check form factor type (byte 2)
    const formFactor = ffi[1] & 0x0F;
    const validFormFactors = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06];
    
    if (!validFormFactors.includes(formFactor)) {
      ctx.recordInteropIssue({
        type: 'FFI_INVALID_FORM_FACTOR',
        severity: 'ERROR',
        message: `Invalid form factor value: ${formFactor}`,
        recommendation: 'Use standard form factor values per EMV spec'
      });
    }
    
    // Check if legacy terminal might misinterpret
    if (ctx.kernel === KernelID.C8) {
      ctx.recordInteropIssue({
        type: 'FFI_C8_KERNEL',
        severity: 'INFO',
        message: 'C8 kernel with FFI - verify legacy terminal compatibility',
        recommendation: 'Test with legacy terminals that may not support C8'
      });
    }
  }
  
  /**
   * Validate Payment Account Reference (PAR) for interop issues
   */
  validatePAR(ctx, parTag) {
    if (!this.options.detectInteropIssues) return;
    
    const par = parTag.valueHex;
    
    // PAR should be 29 characters (alphanumeric)
    if (par.length !== 58) {  // 29 chars * 2 hex digits
      ctx.recordInteropIssue({
        type: 'PAR_LENGTH',
        severity: 'WARNING',
        message: `PAR length is ${par.length / 2} bytes, expected 29`,
        recommendation: 'Verify PAR format per EMV tokenization spec'
      });
    }
    
    // Check if legacy terminals handle PAR correctly
    ctx.recordInteropIssue({
      type: 'PAR_LEGACY_CHECK',
      severity: 'INFO',
      message: 'PAR present - verify legacy terminal field handling',
      recommendation: 'Legacy terminals may not recognize PAR tag (DF8101)'
    });
  }
  
  /**
   * Detect kernel fallback scenarios
   */
  detectKernelFallback(preferredKernel, actualKernel, terminalCapabilities) {
    const issues = [];
    
    if (preferredKernel !== actualKernel) {
      issues.push({
        type: 'KERNEL_FALLBACK',
        severity: 'WARNING',
        preferred: preferredKernel,
        actual: actualKernel,
        message: `Kernel fallback: ${this.getKernelName(preferredKernel)} -> ${this.getKernelName(actualKernel)}`,
        recommendation: 'Verify terminal supports preferred kernel, check configuration'
      });
    }
    
    // Check for C8 to legacy fallback
    if (preferredKernel === KernelID.C8 && actualKernel !== KernelID.C8) {
      issues.push({
        type: 'C8_FALLBACK',
        severity: 'WARNING',
        message: `C8 kernel not available, falling back to ${this.getKernelName(actualKernel)}`,
        recommendation: 'Terminal may need C8 kernel update or configuration'
      });
    }
    
    return issues;
  }
  
  /**
   * Get kernel name from ID
   */
  getKernelName(kernelId) {
    const names = {
      [KernelID.C1]: 'C1 (JCB Legacy)',
      [KernelID.C2]: 'C2 (Mastercard)',
      [KernelID.C3]: 'C3 (Visa)',
      [KernelID.C4]: 'C4 (Amex)',
      [KernelID.C5]: 'C5 (JCB)',
      [KernelID.C6]: 'C6 (Discover)',
      [KernelID.C7]: 'C7 (UnionPay)',
      [KernelID.C8]: 'C8 (Common)'
    };
    return names[kernelId] || `Unknown (${kernelId})`;
  }
  
  /**
   * Check for network-specific field validation issues
   */
  detectFieldValidationIssues(ctx, networkType) {
    const issues = [];
    
    // Common interop issue: Visa terminals enforcing Visa-specific field formats
    // on non-Visa applications
    
    const track2 = ctx.getCardData('57');
    if (track2 && networkType !== 'VISA') {
      // Check Track 2 separator
      if (track2.includes('D')) {
        // Standard EMV format
      } else if (track2.includes('3D')) {
        issues.push({
          type: 'TRACK2_FORMAT',
          severity: 'WARNING',
          message: 'Track 2 using = separator, may not work with all terminals',
          recommendation: 'Use D separator per EMV specification'
        });
      }
    }
    
    // Check TVR/CVR consistency
    const tvr = ctx.getCardData('95');
    const iad = ctx.getCardData('9F10');
    
    if (tvr && iad) {
      // Validate TVR format (5 bytes)
      if (tvr.length !== 10) {  // 5 bytes * 2 hex digits
        issues.push({
          type: 'TVR_LENGTH',
          severity: 'ERROR',
          message: `Invalid TVR length: ${tvr.length / 2} bytes, expected 5`,
          recommendation: 'Check terminal TVR generation'
        });
      }
    }
    
    return issues;
  }
  
  /**
   * Get comprehensive transaction result
   */
  getTransactionResult(ctx) {
    return {
      success: ctx.state === TransactionState.COMPLETION,
      state: ctx.state,
      kernel: this.getKernelName(ctx.kernel),
      cryptogramType: this.getCryptogramTypeName(ctx.cryptogramType),
      cryptogram: ctx.cryptogram?.toString('hex'),
      cardData: Object.fromEntries(ctx.cardData),
      errors: ctx.errors,
      warnings: ctx.warnings,
      interopIssues: ctx.interopIssues,
      timings: ctx.timings,
      log: ctx.log
    };
  }
}

module.exports = {
  EMVProtocolEngine,
  TransactionContext,
  TransactionState,
  CryptogramType,
  InterfaceType,
  KernelID
};
