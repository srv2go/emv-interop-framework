/**
 * EMV TLV (Tag-Length-Value) Parser and Encoder
 * 
 * Implements BER-TLV encoding per ISO/IEC 7816-4 and EMV specifications.
 * Supports:
 * - Primitive and constructed tags
 * - Multi-byte tags and lengths
 * - Nested TLV structures
 * - EMV-specific tag classes
 */

// EMV Tag Classes
const TAG_CLASS = {
  UNIVERSAL: 0x00,
  APPLICATION: 0x40,
  CONTEXT_SPECIFIC: 0x80,
  PRIVATE: 0xC0
};

// Common EMV Tags with descriptions
const EMV_TAGS = {
  // Template Tags (Constructed)
  '6F': { name: 'FCI Template', constructed: true },
  '70': { name: 'EMV Proprietary Template', constructed: true },
  '77': { name: 'Response Message Template Format 2', constructed: true },
  '80': { name: 'Response Message Template Format 1', constructed: false },
  'A5': { name: 'FCI Proprietary Template', constructed: true },
  'BF0C': { name: 'FCI Issuer Discretionary Data', constructed: true },
  
  // Application Data
  '4F': { name: 'Application Identifier (AID)', constructed: false },
  '50': { name: 'Application Label', constructed: false },
  '57': { name: 'Track 2 Equivalent Data', constructed: false },
  '5A': { name: 'Application Primary Account Number (PAN)', constructed: false },
  '5F20': { name: 'Cardholder Name', constructed: false },
  '5F24': { name: 'Application Expiration Date', constructed: false },
  '5F25': { name: 'Application Effective Date', constructed: false },
  '5F28': { name: 'Issuer Country Code', constructed: false },
  '5F2A': { name: 'Transaction Currency Code', constructed: false },
  '5F2D': { name: 'Language Preference', constructed: false },
  '5F34': { name: 'PAN Sequence Number', constructed: false },
  '5F50': { name: 'Issuer URL', constructed: false },
  
  // Cryptographic Data
  '8C': { name: 'Card Risk Management Data Object List 1 (CDOL1)', constructed: false },
  '8D': { name: 'Card Risk Management Data Object List 2 (CDOL2)', constructed: false },
  '8E': { name: 'Cardholder Verification Method (CVM) List', constructed: false },
  '8F': { name: 'Certification Authority Public Key Index', constructed: false },
  '90': { name: 'Issuer Public Key Certificate', constructed: false },
  '91': { name: 'Issuer Authentication Data', constructed: false },
  '92': { name: 'Issuer Public Key Remainder', constructed: false },
  '93': { name: 'Signed Static Application Data', constructed: false },
  '94': { name: 'Application File Locator (AFL)', constructed: false },
  '95': { name: 'Terminal Verification Results (TVR)', constructed: false },
  '9A': { name: 'Transaction Date', constructed: false },
  '9C': { name: 'Transaction Type', constructed: false },
  '9F02': { name: 'Amount Authorized', constructed: false },
  '9F03': { name: 'Amount Other', constructed: false },
  '9F06': { name: 'Application Identifier (AID) - Terminal', constructed: false },
  '9F07': { name: 'Application Usage Control', constructed: false },
  '9F08': { name: 'Application Version Number - Card', constructed: false },
  '9F09': { name: 'Application Version Number - Terminal', constructed: false },
  '9F0D': { name: 'Issuer Action Code - Default', constructed: false },
  '9F0E': { name: 'Issuer Action Code - Denial', constructed: false },
  '9F0F': { name: 'Issuer Action Code - Online', constructed: false },
  '9F10': { name: 'Issuer Application Data (IAD)', constructed: false },
  '9F11': { name: 'Issuer Code Table Index', constructed: false },
  '9F12': { name: 'Application Preferred Name', constructed: false },
  '9F1A': { name: 'Terminal Country Code', constructed: false },
  '9F1E': { name: 'Interface Device (IFD) Serial Number', constructed: false },
  '9F1F': { name: 'Track 1 Discretionary Data', constructed: false },
  '9F21': { name: 'Transaction Time', constructed: false },
  '9F26': { name: 'Application Cryptogram (AC)', constructed: false },
  '9F27': { name: 'Cryptogram Information Data (CID)', constructed: false },
  '9F33': { name: 'Terminal Capabilities', constructed: false },
  '9F34': { name: 'Cardholder Verification Method (CVM) Results', constructed: false },
  '9F35': { name: 'Terminal Type', constructed: false },
  '9F36': { name: 'Application Transaction Counter (ATC)', constructed: false },
  '9F37': { name: 'Unpredictable Number', constructed: false },
  '9F38': { name: 'Processing Options Data Object List (PDOL)', constructed: false },
  '9F39': { name: 'Point-of-Service (POS) Entry Mode', constructed: false },
  '9F40': { name: 'Additional Terminal Capabilities', constructed: false },
  '9F41': { name: 'Transaction Sequence Counter', constructed: false },
  '9F42': { name: 'Application Currency Code', constructed: false },
  '9F44': { name: 'Application Currency Exponent', constructed: false },
  '9F45': { name: 'Data Authentication Code', constructed: false },
  '9F46': { name: 'ICC Public Key Certificate', constructed: false },
  '9F47': { name: 'ICC Public Key Exponent', constructed: false },
  '9F48': { name: 'ICC Public Key Remainder', constructed: false },
  '9F49': { name: 'Dynamic Data Authentication Data Object List (DDOL)', constructed: false },
  '9F4A': { name: 'Static Data Authentication Tag List', constructed: false },
  '9F4B': { name: 'Signed Dynamic Application Data', constructed: false },
  '9F4C': { name: 'ICC Dynamic Number', constructed: false },
  '9F4D': { name: 'Log Entry', constructed: false },
  '9F4E': { name: 'Merchant Name and Location', constructed: false },
  '9F4F': { name: 'Log Format', constructed: false },
  
  // Contactless-specific Tags
  '9F5D': { name: 'Application Capabilities Information', constructed: false },
  '9F6C': { name: 'Card Transaction Qualifiers (CTQ)', constructed: false },
  '9F6D': { name: 'Kernel Identifier', constructed: false },
  '9F6E': { name: 'Form Factor Indicator (FFI)', constructed: false },  // Critical for interop
  '9F7C': { name: 'Merchant Custom Data (Customer Exclusive Data)', constructed: false },
  
  // Payment Account Reference (PAR) - Critical for interop testing
  'DF8101': { name: 'Payment Account Reference (PAR)', constructed: false },
  
  // C8 Kernel Specific Tags
  'DF8102': { name: 'Common Kernel Version', constructed: false },
  'DF8103': { name: 'Kernel Configuration', constructed: false },
  'DF8104': { name: 'Interoperability Indicator', constructed: false }
};

class TLVParser {
  /**
   * Parse a hex string into TLV objects
   * @param {string} hexData - Hex-encoded TLV data
   * @returns {TLVObject[]} Array of parsed TLV objects
   */
  static parse(hexData) {
    const buffer = Buffer.from(hexData.replace(/\s/g, ''), 'hex');
    return this.parseBuffer(buffer, 0, buffer.length);
  }
  
  /**
   * Parse buffer into TLV objects
   * @param {Buffer} buffer - Data buffer
   * @param {number} offset - Starting offset
   * @param {number} endOffset - Ending offset
   * @returns {TLVObject[]} Array of parsed TLV objects
   */
  static parseBuffer(buffer, offset, endOffset) {
    const tlvObjects = [];
    
    while (offset < endOffset) {
      // Skip padding bytes (0x00 or 0xFF)
      if (buffer[offset] === 0x00 || buffer[offset] === 0xFF) {
        offset++;
        continue;
      }
      
      // Parse Tag
      const { tag, tagLength } = this.parseTag(buffer, offset);
      offset += tagLength;
      
      // Parse Length
      const { length, lengthBytes } = this.parseLength(buffer, offset);
      offset += lengthBytes;
      
      // Extract Value
      const value = buffer.slice(offset, offset + length);
      offset += length;
      
      // Check if tag is constructed (bit 6 of first byte is 1)
      const isConstructed = this.isConstructedTag(tag);
      
      const tlvObject = {
        tag: tag,
        tagHex: tag.toString(16).toUpperCase().padStart(2, '0'),
        length: length,
        value: value,
        valueHex: value.toString('hex').toUpperCase(),
        name: this.getTagName(tag),
        constructed: isConstructed,
        children: isConstructed ? this.parseBuffer(value, 0, value.length) : []
      };
      
      tlvObjects.push(tlvObject);
    }
    
    return tlvObjects;
  }
  
  /**
   * Parse a tag from buffer
   * @param {Buffer} buffer - Data buffer
   * @param {number} offset - Current offset
   * @returns {{tag: number, tagLength: number}} Tag value and byte length
   */
  static parseTag(buffer, offset) {
    let tag = buffer[offset];
    let tagLength = 1;
    
    // Check if tag is multi-byte (bits 1-5 of first byte are all 1)
    if ((tag & 0x1F) === 0x1F) {
      do {
        tagLength++;
        tag = (tag << 8) | buffer[offset + tagLength - 1];
      } while ((buffer[offset + tagLength - 1] & 0x80) === 0x80);
    }
    
    return { tag, tagLength };
  }
  
  /**
   * Parse length field from buffer
   * @param {Buffer} buffer - Data buffer
   * @param {number} offset - Current offset
   * @returns {{length: number, lengthBytes: number}} Length value and bytes used
   */
  static parseLength(buffer, offset) {
    const firstByte = buffer[offset];
    
    // Short form: length is directly in first byte
    if ((firstByte & 0x80) === 0) {
      return { length: firstByte, lengthBytes: 1 };
    }
    
    // Long form: first byte indicates number of length bytes
    const numLengthBytes = firstByte & 0x7F;
    let length = 0;
    
    for (let i = 1; i <= numLengthBytes; i++) {
      length = (length << 8) | buffer[offset + i];
    }
    
    return { length, lengthBytes: numLengthBytes + 1 };
  }
  
  /**
   * Check if tag represents a constructed (composite) data object
   * @param {number} tag - Tag value
   * @returns {boolean} True if constructed
   */
  static isConstructedTag(tag) {
    // Check bit 6 of the first byte
    const firstByte = tag > 0xFF ? (tag >> 8) & 0xFF : tag;
    return (firstByte & 0x20) === 0x20;
  }
  
  /**
   * Get human-readable name for a tag
   * @param {number} tag - Tag value
   * @returns {string} Tag name or "Unknown"
   */
  static getTagName(tag) {
    const tagHex = tag.toString(16).toUpperCase();
    const tagInfo = EMV_TAGS[tagHex];
    return tagInfo ? tagInfo.name : 'Unknown';
  }
  
  /**
   * Find a specific tag in TLV array (recursive)
   * @param {TLVObject[]} tlvArray - Array of TLV objects
   * @param {string} tagHex - Tag to find (hex string)
   * @returns {TLVObject|null} Found TLV object or null
   */
  static findTag(tlvArray, tagHex) {
    const searchTag = tagHex.toUpperCase();
    
    for (const tlv of tlvArray) {
      if (tlv.tagHex === searchTag) {
        return tlv;
      }
      if (tlv.constructed && tlv.children.length > 0) {
        const found = this.findTag(tlv.children, tagHex);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  /**
   * Find all instances of a tag (recursive)
   * @param {TLVObject[]} tlvArray - Array of TLV objects
   * @param {string} tagHex - Tag to find (hex string)
   * @returns {TLVObject[]} Array of found TLV objects
   */
  static findAllTags(tlvArray, tagHex) {
    const results = [];
    const searchTag = tagHex.toUpperCase();
    
    for (const tlv of tlvArray) {
      if (tlv.tagHex === searchTag) {
        results.push(tlv);
      }
      if (tlv.constructed && tlv.children.length > 0) {
        results.push(...this.findAllTags(tlv.children, tagHex));
      }
    }
    
    return results;
  }
}

class TLVBuilder {
  constructor() {
    this.tlvData = [];
  }
  
  /**
   * Add a primitive TLV element
   * @param {string} tagHex - Tag in hex format
   * @param {string|Buffer} value - Value as hex string or buffer
   * @returns {TLVBuilder} this for chaining
   */
  addPrimitive(tagHex, value) {
    const valueBuffer = Buffer.isBuffer(value) 
      ? value 
      : Buffer.from(value.replace(/\s/g, ''), 'hex');
    
    this.tlvData.push({
      tag: tagHex.toUpperCase(),
      value: valueBuffer,
      constructed: false
    });
    
    return this;
  }
  
  /**
   * Add a constructed TLV element with children
   * @param {string} tagHex - Tag in hex format
   * @param {Function} buildFn - Function to build children
   * @returns {TLVBuilder} this for chaining
   */
  addConstructed(tagHex, buildFn) {
    const childBuilder = new TLVBuilder();
    buildFn(childBuilder);
    
    this.tlvData.push({
      tag: tagHex.toUpperCase(),
      value: childBuilder.build(),
      constructed: true
    });
    
    return this;
  }
  
  /**
   * Build the final TLV buffer
   * @returns {Buffer} Encoded TLV data
   */
  build() {
    const buffers = [];
    
    for (const item of this.tlvData) {
      // Encode tag
      const tagBytes = this.encodeTag(item.tag);
      buffers.push(tagBytes);
      
      // Encode length
      const lengthBytes = this.encodeLength(item.value.length);
      buffers.push(lengthBytes);
      
      // Add value
      buffers.push(item.value);
    }
    
    return Buffer.concat(buffers);
  }
  
  /**
   * Build and return as hex string
   * @returns {string} Hex-encoded TLV data
   */
  buildHex() {
    return this.build().toString('hex').toUpperCase();
  }
  
  /**
   * Encode tag as buffer
   * @param {string} tagHex - Tag in hex format
   * @returns {Buffer} Encoded tag
   */
  encodeTag(tagHex) {
    return Buffer.from(tagHex, 'hex');
  }
  
  /**
   * Encode length as buffer (BER-TLV)
   * @param {number} length - Length value
   * @returns {Buffer} Encoded length
   */
  encodeLength(length) {
    if (length < 0x80) {
      // Short form
      return Buffer.from([length]);
    } else if (length < 0x100) {
      // Long form, 1 byte
      return Buffer.from([0x81, length]);
    } else if (length < 0x10000) {
      // Long form, 2 bytes
      return Buffer.from([0x82, (length >> 8) & 0xFF, length & 0xFF]);
    } else {
      // Long form, 3 bytes
      return Buffer.from([0x83, (length >> 16) & 0xFF, (length >> 8) & 0xFF, length & 0xFF]);
    }
  }
}

/**
 * Data Object List (DOL) Parser
 * DOLs define the data objects requested/expected in EMV transactions
 */
class DOLParser {
  /**
   * Parse a DOL (e.g., PDOL, CDOL1, CDOL2)
   * @param {string} dolHex - DOL in hex format
   * @returns {DOLEntry[]} Array of DOL entries
   */
  static parse(dolHex) {
    const buffer = Buffer.from(dolHex.replace(/\s/g, ''), 'hex');
    const entries = [];
    let offset = 0;
    
    while (offset < buffer.length) {
      // Parse tag
      const { tag, tagLength } = TLVParser.parseTag(buffer, offset);
      offset += tagLength;
      
      // DOL length is always single byte
      const length = buffer[offset];
      offset++;
      
      entries.push({
        tag: tag,
        tagHex: tag.toString(16).toUpperCase().padStart(2, '0'),
        length: length,
        name: TLVParser.getTagName(tag)
      });
    }
    
    return entries;
  }
  
  /**
   * Build DOL data from provided values
   * @param {DOLEntry[]} dolEntries - Parsed DOL entries
   * @param {Object} values - Object mapping tag hex to value hex
   * @returns {Buffer} Constructed DOL data
   */
  static buildData(dolEntries, values) {
    const buffers = [];
    
    for (const entry of dolEntries) {
      let value = values[entry.tagHex];
      
      if (!value) {
        // Pad with zeros if value not provided
        value = '00'.repeat(entry.length);
      }
      
      const valueBuffer = Buffer.from(value.replace(/\s/g, ''), 'hex');
      
      // Ensure correct length (pad or truncate)
      if (valueBuffer.length < entry.length) {
        // Left-pad with zeros
        const paddedBuffer = Buffer.alloc(entry.length, 0);
        valueBuffer.copy(paddedBuffer, entry.length - valueBuffer.length);
        buffers.push(paddedBuffer);
      } else if (valueBuffer.length > entry.length) {
        // Truncate from left
        buffers.push(valueBuffer.slice(valueBuffer.length - entry.length));
      } else {
        buffers.push(valueBuffer);
      }
    }
    
    return Buffer.concat(buffers);
  }
}

module.exports = {
  TLVParser,
  TLVBuilder,
  DOLParser,
  EMV_TAGS,
  TAG_CLASS
};
