/**
 * EMV Specification Definitions
 * 
 * Contains detailed definitions of various EMV specifications,
 * kernel versions, and network-specific configurations.
 */

// Kernel Specifications
const KernelSpecifications = {
  C2: {
    id: 'C2',
    name: 'Mastercard M/Chip Contactless',
    network: 'Mastercard',
    versions: {
      '3.0': {
        releaseDate: '2019-01',
        features: ['MSD', 'EMV Mode', 'CDA'],
        deprecated: false
      },
      '3.1': {
        releaseDate: '2021-06',
        features: ['MSD', 'EMV Mode', 'CDA', 'Enhanced contactless'],
        deprecated: false
      }
    },
    mandatoryTags: ['9F26', '9F27', '9F10', '9F36', '9F6C', '82', '94'],
    optionalTags: ['9F6E', 'DF8101'],
    cvmSupport: ['SIGNATURE', 'ONLINE_PIN', 'NO_CVM', 'CDCVM'],
    transactionLimits: {
      cvm: 5000,      // $50 USD equivalent
      contactless: 25000  // $250 USD equivalent
    }
  },
  
  C3: {
    id: 'C3',
    name: 'Visa payWave',
    network: 'Visa',
    versions: {
      '2.9': {
        releaseDate: '2018-01',
        features: ['qVSDC', 'fDDA'],
        deprecated: true
      },
      '2.10': {
        releaseDate: '2020-04',
        features: ['qVSDC', 'fDDA', 'Enhanced ODA'],
        deprecated: false
      }
    },
    mandatoryTags: ['9F26', '9F27', '9F10', '9F36', '9F66', '82', '94'],
    optionalTags: ['9F6E', 'DF8101'],
    cvmSupport: ['SIGNATURE', 'ONLINE_PIN', 'NO_CVM', 'CDCVM'],
    specificFields: {
      TTQ: {
        tag: '9F66',
        description: 'Terminal Transaction Qualifiers',
        length: 4
      }
    }
  },
  
  C4: {
    id: 'C4',
    name: 'American Express ExpressPay',
    network: 'American Express',
    versions: {
      '1.0': {
        releaseDate: '2016-01',
        features: ['ExpressPay', 'CDA'],
        deprecated: false
      }
    },
    mandatoryTags: ['9F26', '9F27', '9F10', '9F36'],
    cvmSupport: ['SIGNATURE', 'NO_CVM']
  },
  
  C5: {
    id: 'C5',
    name: 'JCB J/Speedy',
    network: 'JCB',
    versions: {
      '2.0': {
        releaseDate: '2018-01',
        features: ['J/Speedy EMV Mode'],
        deprecated: false
      }
    },
    mandatoryTags: ['9F26', '9F27', '9F10', '9F36'],
    cvmSupport: ['SIGNATURE', 'ONLINE_PIN', 'NO_CVM']
  },
  
  C6: {
    id: 'C6',
    name: 'Discover D-PAS',
    network: 'Discover',
    versions: {
      '1.0': {
        releaseDate: '2014-01',
        features: ['D-PAS contactless', 'Basic CVM'],
        deprecated: true,
        terminalCompatibility: ['Legacy Verifone', 'Legacy Ingenico', 'First Data']
      },
      '2.0': {
        releaseDate: '2017-01',
        features: ['D-PAS contactless', 'Enhanced contactless'],
        deprecated: true,
        terminalCompatibility: ['Verifone VX series', 'Ingenico iCT/iSC series']
      },
      '2.1': {
        releaseDate: '2020-01',
        features: ['D-PAS contactless', 'Enhanced CVM', 'CDCVM support', 'Mobile HCE'],
        deprecated: false,
        terminalCompatibility: ['Verifone VX Evolution', 'Ingenico Desk/Move series', 'PAX A series']
      },
      '3.0': {
        releaseDate: '2025-06',
        features: ['D-PAS contactless', 'Enhanced CVM', 'CDCVM support', 'Mobile HCE', 'C8 ready'],
        deprecated: false,
        terminalCompatibility: ['All C6 compatible terminals', 'C8 ready terminals'],
        c8Fallback: true
      }
    },
    mandatoryTags: ['9F26', '9F27', '9F10', '9F36', '82', '94'],
    optionalTags: ['9F6E', 'DF8101', 'DF8117'],  // Added Discover-specific tags
    cvmSupport: ['SIGNATURE', 'ONLINE_PIN', 'NO_CVM', 'CDCVM'],
    specificFields: {
      DPAS_CTQ: {
        tag: 'DF8117',
        description: 'Discover Card Transaction Qualifiers',
        length: 2
      }
    },
    fallbackPath: ['C8', 'C6'],  // C8 → C6 fallback
    transactionLimits: {
      cvm: 5000,      // $50 USD equivalent
      contactless: 20000  // $200 USD equivalent
    }
  },
  
  C7: {
    id: 'C7',
    name: 'UnionPay QuickPass',
    network: 'UnionPay',
    versions: {
      '1.0': {
        releaseDate: '2018-01',
        features: ['QuickPass EMV Mode'],
        deprecated: false
      }
    },
    mandatoryTags: ['9F26', '9F27', '9F10', '9F36'],
    cvmSupport: ['SIGNATURE', 'ONLINE_PIN', 'NO_CVM']
  },
  
  C8: {
    id: 'C8',
    name: 'Common Contactless Kernel',
    network: 'Multi-network',
    versions: {
      '1.0': {
        releaseDate: '2023-01',
        features: ['Common kernel', 'Multi-network', 'Enhanced interop'],
        deprecated: false
      },
      '1.1': {
        releaseDate: '2024-06',
        features: ['Common kernel', 'Multi-network', 'Enhanced interop', 'PAR support'],
        deprecated: false
      }
    },
    mandatoryTags: ['9F26', '9F27', '9F10', '9F36', '9F6D', 'DF8102'],
    optionalTags: ['DF8101', 'DF8104'],
    cvmSupport: ['SIGNATURE', 'ONLINE_PIN', 'NO_CVM', 'CDCVM'],
    specificFields: {
      kernelId: {
        tag: '9F6D',
        description: 'Kernel Identifier',
        length: 1
      },
      commonKernelVersion: {
        tag: 'DF8102',
        description: 'Common Kernel Version',
        length: 2
      },
      interopIndicator: {
        tag: 'DF8104',
        description: 'Interoperability Indicator',
        length: 1
      }
    },
    fallbackKernels: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
    networkFallbackRules: {
      'Discover': 'C6',  // Discover C8 → C6
      'Mastercard': 'C2',
      'Visa': 'C3',
      'Amex': 'C4',
      'JCB': 'C5',
      'UnionPay': 'C7'
    }
  }
};

// Network-specific Field Definitions
const NetworkFieldDefinitions = {
  VISA: {
    track2Separator: 'D',
    panMaxLength: 19,
    iadFormat: {
      length: 32,
      derivationKeyIndex: { offset: 0, length: 2 },
      cryptogramVersion: { offset: 2, length: 1 },
      cvr: { offset: 3, length: 4 }
    },
    specificTags: {
      TTQ: '9F66',
      CVR: '9F6E'  // Note: Visa uses 9F6E differently
    }
  },
  
  MASTERCARD: {
    track2Separator: 'D',
    panMaxLength: 19,
    iadFormat: {
      length: 32,
      derivationKeyIndex: { offset: 0, length: 2 },
      cryptogramVersion: { offset: 2, length: 1 },
      cvr: { offset: 3, length: 4 }
    },
    specificTags: {
      CTQ: '9F6C',
      FFI: '9F6E'
    }
  },
  
  AMEX: {
    track2Separator: 'D',
    panMaxLength: 15,
    iadFormat: {
      length: 18,
      derivationKeyIndex: { offset: 0, length: 1 },
      cryptogramVersion: { offset: 1, length: 1 }
    }
  },
  
  DISCOVER: {
    track2Separator: 'D',
    panMaxLength: 19,
    iadFormat: {
      length: 32,
      derivationKeyIndex: { offset: 0, length: 2 },
      cryptogramVersion: { offset: 2, length: 1 },
      cvr: { offset: 3, length: 4 }
    },
    specificTags: {
      DPAS_CTQ: 'DF8117',
      FFI: '9F6E'
    },
    appletVersions: {
      '1.0': {
        aid: 'A0000001523010',
        releaseDate: '2014-01',
        features: ['Basic D-PAS']
      },
      '2.1': {
        aid: 'A0000001523010',
        releaseDate: '2020-01',
        features: ['Enhanced D-PAS', 'CDCVM']
      },
      '3.0': {
        aid: 'A0000001523010',
        releaseDate: '2025-06',
        features: ['C8 compatible', 'Enhanced CVM', 'Mobile optimized']
      }
    }
  }
};

// Form Factor Indicator Definitions
const FormFactorDefinitions = {
  values: {
    0x00: 'Standard card',
    0x01: 'Mini card',
    0x02: 'Mobile phone',
    0x03: 'Key fob',
    0x04: 'Watch/Wristband',
    0x05: 'Mobile phone case',
    0x06: 'Vehicle',
    0x07: 'Sticker',
    0x08: 'Wearable (other)',
    0x0F: 'Unknown/Unspecified'
  },
  
  cdcvmCapabilities: {
    0x80: 'CDCVM performed on-device (biometric)',
    0x40: 'CDCVM performed on-device (passcode)',
    0x20: 'CDCVM supported but not performed',
    0x00: 'No CDCVM capability'
  }
};

// Interoperability Issue Definitions
const InteropIssueDefinitions = {
  KERNEL_FALLBACK: {
    description: 'Card preferred kernel not supported by terminal',
    severity: 'WARNING',
    recommendations: [
      'Verify terminal supports required kernels',
      'Check kernel configuration',
      'Ensure fallback path is properly configured'
    ]
  },
  
  FFI_INVALID: {
    description: 'Form Factor Indicator has invalid or unexpected value',
    severity: 'WARNING',
    recommendations: [
      'Verify FFI encoding per EMV specification',
      'Check form factor byte values',
      'Ensure CDCVM capability bits are correct'
    ]
  },
  
  PAR_NOT_RECOGNIZED: {
    description: 'Payment Account Reference tag not recognized by terminal',
    severity: 'INFO',
    recommendations: [
      'Update terminal to latest specification',
      'PAR should be passed through to acquirer',
      'Legacy terminals may ignore unknown tags'
    ]
  },
  
  TRACK2_FORMAT: {
    description: 'Track 2 data format does not match expected network format',
    severity: 'WARNING',
    recommendations: [
      'Verify Track 2 separator character (D vs =)',
      'Check Track 2 length and padding',
      'Ensure discretionary data format is correct'
    ]
  },
  
  CVM_MISMATCH: {
    description: 'Cardholder Verification Method mismatch between card and terminal',
    severity: 'ERROR',
    recommendations: [
      'Verify terminal CVM capabilities',
      'Check card CVM list priority',
      'Ensure fallback CVM is configured'
    ]
  },
  
  CRYPTOGRAM_TYPE_UNEXPECTED: {
    description: 'Card returned unexpected cryptogram type',
    severity: 'ERROR',
    recommendations: [
      'Check IAC/TAC configuration',
      'Verify TVR settings',
      'Review card risk management parameters'
    ]
  },
  
  C8_NOT_SUPPORTED: {
    description: 'Terminal does not support C8 common kernel',
    severity: 'WARNING',
    recommendations: [
      'Update terminal firmware for C8 support',
      'Verify fallback kernel path',
      'Contact terminal manufacturer for C8 update'
    ]
  },
  
  NETWORK_SPECIFIC_VALIDATION: {
    description: 'Terminal applying network-specific validation to different network',
    severity: 'WARNING',
    recommendations: [
      'Review terminal configuration',
      'Ensure field validation is network-appropriate',
      'Update legacy terminal firmware'
    ]
  },
  
  TOKEN_DATA_HANDLING: {
    description: 'Token-specific data not handled correctly',
    severity: 'WARNING',
    recommendations: [
      'Verify terminal supports tokenized transactions',
      'Check PAR and DPAN handling',
      'Ensure token data is forwarded to network'
    ]
  }
};

// Test Transaction Configurations
const TestTransactionConfigs = {
  standardPurchase: {
    amount: 1000,       // $10.00
    currencyCode: '0840',
    transactionType: 0x00,
    description: 'Standard goods/services purchase'
  },
  
  highValuePurchase: {
    amount: 50000,      // $500.00
    currencyCode: '0840',
    transactionType: 0x00,
    description: 'High-value purchase requiring CVM'
  },
  
  lowValueContactless: {
    amount: 500,        // $5.00
    currencyCode: '0840',
    transactionType: 0x00,
    description: 'Low-value contactless (typically no CVM)'
  },
  
  cashWithdrawal: {
    amount: 10000,
    currencyCode: '0840',
    transactionType: 0x01,
    description: 'Cash withdrawal'
  },
  
  refund: {
    amount: 2500,
    currencyCode: '0840',
    transactionType: 0x20,
    description: 'Refund transaction'
  }
};

// AID to Kernel Mapping
const AIDKernelMapping = {
  // Mastercard
  'A0000000041010': 'C2',  // Credit
  'A0000000042010': 'C2',  // Debit
  'A0000000043060': 'C2',  // Maestro
  'A0000000044010': 'C2',  // Mastercard Prepaid
  
  // Visa
  'A0000000031010': 'C3',  // Credit
  'A0000000032010': 'C3',  // Debit
  'A0000000032020': 'C3',  // Electron
  'A0000000033010': 'C3',  // Interlink
  
  // American Express
  'A000000025010801': 'C4',
  'A000000025010901': 'C4',
  
  // JCB
  'A0000000651010': 'C5',
  
  // Discover
  'A0000001523010': 'C6',
  'A0000001524010': 'C6',
  
  // UnionPay
  'A000000333010101': 'C7',
  'A000000333010102': 'C7'
};

// Terminal Vendor Configurations
const TerminalVendorProfiles = {
  VERIFONE: {
    name: 'Verifone',
    models: {
      'VX520': {
        kernelSupport: ['C2', 'C3', 'C4', 'C6'],
        firmwareVersions: ['04.00', '04.01', '04.02'],
        c8Support: false,
        contactless: true,
        contact: true
      },
      'VX680': {
        kernelSupport: ['C2', 'C3', 'C4', 'C6'],
        firmwareVersions: ['04.00', '04.01'],
        c8Support: false,
        contactless: true,
        contact: true
      },
      'VX820': {
        kernelSupport: ['C2', 'C3', 'C4', 'C6'],
        firmwareVersions: ['01.00', '02.00', '02.01'],
        c8Support: false,
        contactless: true,
        contact: true
      },
      'VX Evolution': {
        kernelSupport: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
        firmwareVersions: ['01.00', '01.10'],
        c8Support: true,
        c8FallbackSupport: true,
        contactless: true,
        contact: true
      }
    }
  },
  
  INGENICO: {
    name: 'Ingenico',
    models: {
      'iCT250': {
        kernelSupport: ['C2', 'C3', 'C4', 'C6'],
        firmwareVersions: ['L8400', 'L8500'],
        c8Support: false,
        contactless: true,
        contact: true
      },
      'iSC250': {
        kernelSupport: ['C2', 'C3', 'C4', 'C6'],
        firmwareVersions: ['L8400', 'L8500'],
        c8Support: false,
        contactless: true,
        contact: true
      },
      'Desk/5000': {
        kernelSupport: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
        firmwareVersions: ['SRED 12.01', 'SRED 12.02'],
        c8Support: true,
        c8FallbackSupport: true,
        contactless: true,
        contact: true
      },
      'Move/5000': {
        kernelSupport: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
        firmwareVersions: ['SRED 12.01', 'SRED 12.02'],
        c8Support: true,
        c8FallbackSupport: true,
        contactless: true,
        contact: true
      }
    }
  },
  
  PAX: {
    name: 'PAX Technology',
    models: {
      'A920': {
        kernelSupport: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
        firmwareVersions: ['08.00', '09.00'],
        c8Support: true,
        c8FallbackSupport: true,
        contactless: true,
        contact: true
      },
      'A80': {
        kernelSupport: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
        firmwareVersions: ['08.00', '09.00'],
        c8Support: true,
        c8FallbackSupport: true,
        contactless: true,
        contact: true
      }
    }
  },
  
  FIRST_DATA: {
    name: 'First Data (Clover)',
    models: {
      'Clover Mini': {
        kernelSupport: ['C2', 'C3', 'C4', 'C6'],
        firmwareVersions: ['540', '550'],
        c8Support: false,
        contactless: true,
        contact: true
      },
      'Clover Flex': {
        kernelSupport: ['C2', 'C3', 'C4', 'C6'],
        firmwareVersions: ['540', '550'],
        c8Support: false,
        contactless: true,
        contact: true
      }
    }
  }
};

// Export configuration
module.exports = {
  KernelSpecifications,
  NetworkFieldDefinitions,
  FormFactorDefinitions,
  InteropIssueDefinitions,
  TestTransactionConfigs,
  AIDKernelMapping,
  TerminalVendorProfiles,
  
  // Helper functions
  getKernelForAID: (aid) => {
    const aidUpper = aid.toUpperCase();
    
    // Try exact match first
    if (AIDKernelMapping[aidUpper]) {
      return AIDKernelMapping[aidUpper];
    }
    
    // Try partial match (AID prefix)
    for (const [mappedAID, kernel] of Object.entries(AIDKernelMapping)) {
      if (aidUpper.startsWith(mappedAID) || mappedAID.startsWith(aidUpper)) {
        return kernel;
      }
    }
    
    return null;
  },
  
  getNetworkForAID: (aid) => {
    const aidUpper = aid.toUpperCase();
    
    if (aidUpper.startsWith('A000000004')) return 'MASTERCARD';
    if (aidUpper.startsWith('A000000003')) return 'VISA';
    if (aidUpper.startsWith('A000000025')) return 'AMEX';
    if (aidUpper.startsWith('A000000065')) return 'JCB';
    if (aidUpper.startsWith('A000000152')) return 'DISCOVER';
    if (aidUpper.startsWith('A000000333')) return 'UNIONPAY';
    
    return 'UNKNOWN';
  },
  
  isKernelSupported: (kernelId, terminalKernels) => {
    return terminalKernels.includes(kernelId);
  },
  
  getKernelFallbackPath: (preferredKernel) => {
    const spec = KernelSpecifications[preferredKernel];
    return spec?.fallbackKernels || [];
  }
};
