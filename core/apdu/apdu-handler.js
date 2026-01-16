/**
 * EMV APDU (Application Protocol Data Unit) Handler
 * 
 * Implements ISO 7816-4 APDU command and response handling.
 * Supports all APDU cases and EMV-specific commands.
 */

// EMV Command Classes
const CLA = {
  ISO: 0x00,
  SECURE_MESSAGING: 0x04,
  PROPRIETARY: 0x80,
  VISA: 0x80,
  MASTERCARD: 0x80,
  AMEX: 0x80
};

// EMV Instruction Codes
const INS = {
  // ISO 7816-4 Standard Commands
  SELECT: 0xA4,
  READ_RECORD: 0xB2,
  GET_DATA: 0xCA,
  VERIFY: 0x20,
  EXTERNAL_AUTHENTICATE: 0x82,
  INTERNAL_AUTHENTICATE: 0x88,
  GET_CHALLENGE: 0x84,
  
  // EMV Specific Commands
  GET_PROCESSING_OPTIONS: 0xA8,
  GENERATE_AC: 0xAE,
  
  // Contactless Specific
  EXCHANGE_RELAY_RESISTANCE_DATA: 0xEA,
  RECOVER_AC: 0xD0,
  COMPUTE_CRYPTOGRAPHIC_CHECKSUM: 0x2A
};

// Status Words
const SW = {
  SUCCESS: 0x9000,
  SUCCESS_PATTERN: 0x9000,
  MORE_DATA_PATTERN: 0x6100,  // 61XX - XX more bytes available
  WRONG_LENGTH: 0x6700,
  SECURITY_NOT_SATISFIED: 0x6982,
  AUTH_METHOD_BLOCKED: 0x6983,
  REFERENCE_DATA_NOT_FOUND: 0x6984,
  CONDITIONS_NOT_SATISFIED: 0x6985,
  COMMAND_NOT_ALLOWED: 0x6986,
  SM_DATA_MISSING: 0x6987,
  SM_DATA_INCORRECT: 0x6988,
  INCORRECT_P1P2: 0x6A86,
  REFERENCED_DATA_NOT_FOUND: 0x6A88,
  FILE_NOT_FOUND: 0x6A82,
  RECORD_NOT_FOUND: 0x6A83,
  NOT_ENOUGH_MEMORY: 0x6A84,
  NC_INCONSISTENT_WITH_TLV: 0x6A85,
  WRONG_P1P2: 0x6B00,
  INS_NOT_SUPPORTED: 0x6D00,
  CLA_NOT_SUPPORTED: 0x6E00,
  UNKNOWN_ERROR: 0x6F00,
  
  // Extended status patterns
  isSuccess: (sw) => sw === 0x9000 || (sw >= 0x9100 && sw <= 0x91FF),
  hasMoreData: (sw) => (sw & 0xFF00) === 0x6100,
  getBytesAvailable: (sw) => (sw & 0xFF00) === 0x6100 ? (sw & 0x00FF) : 0
};

/**
 * Represents a command APDU
 */
class CommandAPDU {
  /**
   * Create a command APDU
   * @param {number} cla - Class byte
   * @param {number} ins - Instruction byte
   * @param {number} p1 - Parameter 1
   * @param {number} p2 - Parameter 2
   * @param {Buffer|null} data - Command data (optional)
   * @param {number|null} le - Expected response length (optional)
   */
  constructor(cla, ins, p1, p2, data = null, le = null) {
    this.cla = cla;
    this.ins = ins;
    this.p1 = p1;
    this.p2 = p2;
    this.data = data;
    this.le = le;
  }
  
  /**
   * Get the APDU case (1, 2, 3, or 4)
   * @returns {number} APDU case number
   */
  get case() {
    if (!this.data && this.le === null) return 1;
    if (!this.data && this.le !== null) return 2;
    if (this.data && this.le === null) return 3;
    return 4;
  }
  
  /**
   * Serialize to buffer
   * @returns {Buffer} Serialized APDU
   */
  toBuffer() {
    const header = Buffer.from([this.cla, this.ins, this.p1, this.p2]);
    
    switch (this.case) {
      case 1:
        return header;
        
      case 2:
        return Buffer.concat([header, Buffer.from([this.le === 256 ? 0 : this.le])]);
        
      case 3:
        return Buffer.concat([
          header,
          Buffer.from([this.data.length]),
          this.data
        ]);
        
      case 4:
        return Buffer.concat([
          header,
          Buffer.from([this.data.length]),
          this.data,
          Buffer.from([this.le === 256 ? 0 : this.le])
        ]);
    }
  }
  
  /**
   * Serialize to hex string
   * @returns {string} Hex-encoded APDU
   */
  toHex() {
    return this.toBuffer().toString('hex').toUpperCase();
  }
  
  /**
   * Parse from hex string
   * @param {string} hexString - Hex-encoded APDU
   * @returns {CommandAPDU} Parsed command
   */
  static fromHex(hexString) {
    const buffer = Buffer.from(hexString.replace(/\s/g, ''), 'hex');
    return this.fromBuffer(buffer);
  }
  
  /**
   * Parse from buffer
   * @param {Buffer} buffer - APDU buffer
   * @returns {CommandAPDU} Parsed command
   */
  static fromBuffer(buffer) {
    if (buffer.length < 4) {
      throw new Error('Invalid APDU: too short');
    }
    
    const cla = buffer[0];
    const ins = buffer[1];
    const p1 = buffer[2];
    const p2 = buffer[3];
    
    if (buffer.length === 4) {
      // Case 1
      return new CommandAPDU(cla, ins, p1, p2);
    }
    
    if (buffer.length === 5) {
      // Case 2
      const le = buffer[4] === 0 ? 256 : buffer[4];
      return new CommandAPDU(cla, ins, p1, p2, null, le);
    }
    
    const lc = buffer[4];
    
    if (buffer.length === 5 + lc) {
      // Case 3
      const data = buffer.slice(5, 5 + lc);
      return new CommandAPDU(cla, ins, p1, p2, data);
    }
    
    if (buffer.length === 6 + lc) {
      // Case 4
      const data = buffer.slice(5, 5 + lc);
      const le = buffer[5 + lc] === 0 ? 256 : buffer[5 + lc];
      return new CommandAPDU(cla, ins, p1, p2, data, le);
    }
    
    throw new Error('Invalid APDU: incorrect length');
  }
  
  /**
   * Get human-readable description
   * @returns {string} Description
   */
  toString() {
    const insName = Object.keys(INS).find(key => INS[key] === this.ins) || 'UNKNOWN';
    return `${insName} [CLA=${this.cla.toString(16)}, P1=${this.p1.toString(16)}, P2=${this.p2.toString(16)}]`;
  }
}

/**
 * Represents a response APDU
 */
class ResponseAPDU {
  /**
   * Create a response APDU
   * @param {Buffer} data - Response data
   * @param {number} sw1 - Status word 1
   * @param {number} sw2 - Status word 2
   */
  constructor(data, sw1, sw2) {
    this.data = data;
    this.sw1 = sw1;
    this.sw2 = sw2;
  }
  
  /**
   * Get combined status word
   * @returns {number} Status word (SW1 || SW2)
   */
  get sw() {
    return (this.sw1 << 8) | this.sw2;
  }
  
  /**
   * Check if command was successful
   * @returns {boolean} True if successful
   */
  get isSuccess() {
    return SW.isSuccess(this.sw);
  }
  
  /**
   * Check if more data is available
   * @returns {boolean} True if more data available
   */
  get hasMoreData() {
    return SW.hasMoreData(this.sw);
  }
  
  /**
   * Get bytes available (for SW1=61)
   * @returns {number} Bytes available
   */
  get bytesAvailable() {
    return SW.getBytesAvailable(this.sw);
  }
  
  /**
   * Serialize to buffer
   * @returns {Buffer} Serialized response
   */
  toBuffer() {
    return Buffer.concat([
      this.data,
      Buffer.from([this.sw1, this.sw2])
    ]);
  }
  
  /**
   * Serialize to hex string
   * @returns {string} Hex-encoded response
   */
  toHex() {
    return this.toBuffer().toString('hex').toUpperCase();
  }
  
  /**
   * Parse from hex string
   * @param {string} hexString - Hex-encoded response
   * @returns {ResponseAPDU} Parsed response
   */
  static fromHex(hexString) {
    const buffer = Buffer.from(hexString.replace(/\s/g, ''), 'hex');
    return this.fromBuffer(buffer);
  }
  
  /**
   * Parse from buffer
   * @param {Buffer} buffer - Response buffer
   * @returns {ResponseAPDU} Parsed response
   */
  static fromBuffer(buffer) {
    if (buffer.length < 2) {
      throw new Error('Invalid response: too short');
    }
    
    const sw2 = buffer[buffer.length - 1];
    const sw1 = buffer[buffer.length - 2];
    const data = buffer.slice(0, buffer.length - 2);
    
    return new ResponseAPDU(data, sw1, sw2);
  }
  
  /**
   * Create success response
   * @param {Buffer|string} data - Response data
   * @returns {ResponseAPDU} Success response
   */
  static success(data = Buffer.alloc(0)) {
    const dataBuffer = Buffer.isBuffer(data) 
      ? data 
      : Buffer.from(data.replace(/\s/g, ''), 'hex');
    return new ResponseAPDU(dataBuffer, 0x90, 0x00);
  }
  
  /**
   * Create error response
   * @param {number} sw - Status word
   * @returns {ResponseAPDU} Error response
   */
  static error(sw) {
    return new ResponseAPDU(Buffer.alloc(0), (sw >> 8) & 0xFF, sw & 0xFF);
  }
  
  /**
   * Get status word description
   * @returns {string} Description
   */
  getStatusDescription() {
    const statusMessages = {
      0x9000: 'Success',
      0x6700: 'Wrong length',
      0x6982: 'Security status not satisfied',
      0x6983: 'Authentication method blocked',
      0x6984: 'Reference data not found',
      0x6985: 'Conditions of use not satisfied',
      0x6986: 'Command not allowed',
      0x6A82: 'File not found',
      0x6A83: 'Record not found',
      0x6A86: 'Incorrect P1-P2',
      0x6A88: 'Referenced data not found',
      0x6D00: 'Instruction not supported',
      0x6E00: 'Class not supported'
    };
    
    if (this.sw1 === 0x61) {
      return `More data available (${this.sw2} bytes)`;
    }
    
    return statusMessages[this.sw] || `Unknown status: ${this.sw.toString(16).toUpperCase()}`;
  }
}

/**
 * EMV Command Factory - Creates standard EMV commands
 */
class EMVCommands {
  /**
   * SELECT command (by AID)
   * @param {string} aidHex - Application Identifier in hex
   * @param {boolean} first - True for first occurrence, false for next
   * @returns {CommandAPDU} SELECT command
   */
  static select(aidHex, first = true) {
    const aid = Buffer.from(aidHex.replace(/\s/g, ''), 'hex');
    return new CommandAPDU(
      CLA.ISO,
      INS.SELECT,
      0x04,  // Select by name
      first ? 0x00 : 0x02,  // First or next occurrence
      aid,
      0x00   // Le=0 means max
    );
  }
  
  /**
   * SELECT PPSE (Proximity Payment System Environment) for contactless
   * @returns {CommandAPDU} SELECT PPSE command
   */
  static selectPPSE() {
    return this.select('325041592E5359532E4444463031'); // '2PAY.SYS.DDF01'
  }
  
  /**
   * SELECT PSE (Payment System Environment) for contact
   * @returns {CommandAPDU} SELECT PSE command
   */
  static selectPSE() {
    return this.select('315041592E5359532E4444463031'); // '1PAY.SYS.DDF01'
  }
  
  /**
   * GET PROCESSING OPTIONS command
   * @param {Buffer|string} pdolData - PDOL-related data
   * @returns {CommandAPDU} GPO command
   */
  static getProcessingOptions(pdolData) {
    const data = Buffer.isBuffer(pdolData)
      ? pdolData
      : Buffer.from(pdolData.replace(/\s/g, ''), 'hex');
    
    // Wrap in command template (tag 83)
    const commandData = Buffer.concat([
      Buffer.from([0x83, data.length]),
      data
    ]);
    
    return new CommandAPDU(
      CLA.PROPRIETARY,
      INS.GET_PROCESSING_OPTIONS,
      0x00,
      0x00,
      commandData,
      0x00
    );
  }
  
  /**
   * READ RECORD command
   * @param {number} recordNumber - Record number (1-based)
   * @param {number} sfi - Short File Identifier
   * @returns {CommandAPDU} READ RECORD command
   */
  static readRecord(recordNumber, sfi) {
    return new CommandAPDU(
      CLA.ISO,
      INS.READ_RECORD,
      recordNumber,
      (sfi << 3) | 0x04,  // SFI in bits 8-4, 04 means P1 is record number
      null,
      0x00
    );
  }
  
  /**
   * GET DATA command
   * @param {string} tagHex - Tag to retrieve (1 or 2 bytes)
   * @returns {CommandAPDU} GET DATA command
   */
  static getData(tagHex) {
    const tag = Buffer.from(tagHex.replace(/\s/g, ''), 'hex');
    let p1, p2;
    
    if (tag.length === 1) {
      p1 = 0x00;
      p2 = tag[0];
    } else {
      p1 = tag[0];
      p2 = tag[1];
    }
    
    return new CommandAPDU(
      CLA.PROPRIETARY,
      INS.GET_DATA,
      p1,
      p2,
      null,
      0x00
    );
  }
  
  /**
   * GENERATE AC (Application Cryptogram) command
   * @param {number} cryptogramType - 0x00=AAC, 0x40=TC, 0x80=ARQC
   * @param {Buffer|string} cdolData - CDOL-related data
   * @returns {CommandAPDU} GENERATE AC command
   */
  static generateAC(cryptogramType, cdolData) {
    const data = Buffer.isBuffer(cdolData)
      ? cdolData
      : Buffer.from(cdolData.replace(/\s/g, ''), 'hex');
    
    return new CommandAPDU(
      CLA.PROPRIETARY,
      INS.GENERATE_AC,
      cryptogramType,
      0x00,
      data,
      0x00
    );
  }
  
  /**
   * VERIFY PIN command
   * @param {string} pinBlock - Encrypted PIN block (hex)
   * @param {boolean} offline - True for offline PIN, false for online
   * @returns {CommandAPDU} VERIFY command
   */
  static verify(pinBlock, offline = true) {
    const data = Buffer.from(pinBlock.replace(/\s/g, ''), 'hex');
    return new CommandAPDU(
      CLA.ISO,
      INS.VERIFY,
      0x00,
      offline ? 0x80 : 0x88,  // Offline vs online PIN qualifier
      data,
      null
    );
  }
  
  /**
   * GET CHALLENGE command (for dynamic data auth)
   * @param {number} length - Challenge length (default 8)
   * @returns {CommandAPDU} GET CHALLENGE command
   */
  static getChallenge(length = 8) {
    return new CommandAPDU(
      CLA.ISO,
      INS.GET_CHALLENGE,
      0x00,
      0x00,
      null,
      length
    );
  }
  
  /**
   * INTERNAL AUTHENTICATE command (for DDA/CDA)
   * @param {Buffer|string} ddolData - DDOL-related data
   * @returns {CommandAPDU} INTERNAL AUTHENTICATE command
   */
  static internalAuthenticate(ddolData) {
    const data = Buffer.isBuffer(ddolData)
      ? ddolData
      : Buffer.from(ddolData.replace(/\s/g, ''), 'hex');
    
    return new CommandAPDU(
      CLA.ISO,
      INS.INTERNAL_AUTHENTICATE,
      0x00,
      0x00,
      data,
      0x00
    );
  }
  
  /**
   * EXTERNAL AUTHENTICATE command
   * @param {Buffer|string} authData - Authentication data (ARPC)
   * @returns {CommandAPDU} EXTERNAL AUTHENTICATE command
   */
  static externalAuthenticate(authData) {
    const data = Buffer.isBuffer(authData)
      ? authData
      : Buffer.from(authData.replace(/\s/g, ''), 'hex');
    
    return new CommandAPDU(
      CLA.ISO,
      INS.EXTERNAL_AUTHENTICATE,
      0x00,
      0x00,
      data,
      null
    );
  }
  
  /**
   * COMPUTE CRYPTOGRAPHIC CHECKSUM (Mastercard M/Chip)
   * @param {Buffer|string} data - Input data
   * @returns {CommandAPDU} CCC command
   */
  static computeCryptographicChecksum(data) {
    const inputData = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data.replace(/\s/g, ''), 'hex');
    
    return new CommandAPDU(
      CLA.PROPRIETARY,
      INS.COMPUTE_CRYPTOGRAPHIC_CHECKSUM,
      0x8E,
      0x80,
      inputData,
      0x00
    );
  }
  
  /**
   * EXCHANGE RELAY RESISTANCE DATA (Contactless)
   * @param {Buffer|string} terminalRRData - Terminal relay resistance data
   * @returns {CommandAPDU} ERRD command
   */
  static exchangeRelayResistanceData(terminalRRData) {
    const data = Buffer.isBuffer(terminalRRData)
      ? terminalRRData
      : Buffer.from(terminalRRData.replace(/\s/g, ''), 'hex');
    
    return new CommandAPDU(
      CLA.PROPRIETARY,
      INS.EXCHANGE_RELAY_RESISTANCE_DATA,
      0x00,
      0x00,
      data,
      0x00
    );
  }
}

module.exports = {
  CommandAPDU,
  ResponseAPDU,
  EMVCommands,
  CLA,
  INS,
  SW
};
