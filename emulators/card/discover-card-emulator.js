/**
 * Discover Card Emulator
 * 
 * Specialized emulator for Discover D-PAS cards with support for:
 * - D-PAS 1.0, 2.1, and 3.0 (C8 compatible)
 * - Kernel C6 and C8 with fallback support
 * - Backward compatibility testing with legacy terminals
 */

const { CardEmulator, CardProfile, StandardAIDs } = require('./card-emulator');
const { KernelID, InterfaceType } = require('../../core/protocol/emv-engine');

// Discover-specific card specification versions
const DiscoverCardSpecVersion = {
  DPAS_1_0: 'DISCOVER_DPAS_1.0',
  DPAS_2_0: 'DISCOVER_DPAS_2.0',
  DPAS_2_1: 'DISCOVER_DPAS_2.1',
  DPAS_3_0: 'DISCOVER_DPAS_3.0',  // C8 compatible
  DPAS_C8_1_0: 'DISCOVER_C8_1.0'  // Full C8 spec
};

/**
 * Discover Card Profile Factory
 */
class DiscoverCardProfileFactory {
  /**
   * Create a Discover D-PAS 1.0 card (legacy)
   */
  static createDPAS_1_0(options = {}) {
    const profile = new CardProfile({
      name: options.name || 'Discover D-PAS 1.0',
      specVersion: DiscoverCardSpecVersion.DPAS_1_0,
      interfaceType: options.interfaceType || InterfaceType.CONTACTLESS,
      primaryAID: StandardAIDs.DISCOVER,
      supportedAIDs: [StandardAIDs.DISCOVER],
      kernelId: KernelID.C6,
      supportsC8: false,
      odaType: 'CDA',
      ...options
    });

    // D-PAS 1.0 specific configuration
    profile.staticData.set('50', Buffer.from('DISCOVER').toString('hex'));
    profile.staticData.set('9F12', Buffer.from('DISCOVER').toString('hex')); // Application Preferred Name
    
    // Application Version Number (tag 9F09) - D-PAS 1.0
    profile.staticData.set('9F09', '0001');
    
    // Card Transaction Qualifiers (Discover specific)
    profile.staticData.set('DF8117', '8000'); // Basic CTQ
    
    // Application Interchange Profile (tag 82)
    profile.staticData.set('82', '5800'); // CDA supported
    
    // CVM List - D-PAS 1.0 (limited CVM support)
    profile.cvmList = [
      { method: 'NO_CVM', condition: 'ALWAYS' },
      { method: 'SIGNATURE', condition: 'IF_TERMINAL_SUPPORTS' },
      { method: 'ONLINE_PIN', condition: 'IF_TERMINAL_SUPPORTS' }
    ];
    
    // Transaction limits for D-PAS 1.0
    profile.staticData.set('9F1B', '00000000'); // Terminal Floor Limit (0)
    
    return profile;
  }

  /**
   * Create a Discover D-PAS 2.1 card (current production)
   */
  static createDPAS_2_1(options = {}) {
    const profile = new CardProfile({
      name: options.name || 'Discover D-PAS 2.1',
      specVersion: DiscoverCardSpecVersion.DPAS_2_1,
      interfaceType: options.interfaceType || InterfaceType.CONTACTLESS,
      primaryAID: StandardAIDs.DISCOVER,
      supportedAIDs: [StandardAIDs.DISCOVER],
      kernelId: KernelID.C6,
      supportsC8: false,
      odaType: 'CDA',
      ...options
    });

    // D-PAS 2.1 specific configuration
    profile.staticData.set('50', Buffer.from('DISCOVER').toString('hex'));
    profile.staticData.set('9F12', Buffer.from('DISCOVER').toString('hex'));
    
    // Application Version Number (tag 9F09) - D-PAS 2.1
    profile.staticData.set('9F09', '0021');
    
    // Card Transaction Qualifiers (Enhanced)
    profile.staticData.set('DF8117', 'C080'); // Enhanced CTQ with CDCVM support
    
    // Application Interchange Profile (tag 82)
    profile.staticData.set('82', '5C00'); // CDA supported, CDCVM supported
    
    // Form Factor Indicator (tag 9F6E) - supports mobile
    profile.staticData.set('9F6E', 'F82000'); // Standard card form factor
    
    // CVM List - D-PAS 2.1 (enhanced CVM)
    profile.cvmList = [
      { method: 'CDCVM', condition: 'IF_SUPPORTED' },
      { method: 'NO_CVM', condition: 'IF_UNDER_LIMIT' },
      { method: 'SIGNATURE', condition: 'IF_TERMINAL_SUPPORTS' },
      { method: 'ONLINE_PIN', condition: 'IF_TERMINAL_SUPPORTS' }
    ];
    
    return profile;
  }

  /**
   * Create a Discover D-PAS 3.0 card (C8 ready with fallback)
   */
  static createDPAS_3_0(options = {}) {
    const profile = new CardProfile({
      name: options.name || 'Discover D-PAS 3.0 (C8 Ready)',
      specVersion: DiscoverCardSpecVersion.DPAS_3_0,
      interfaceType: options.interfaceType || InterfaceType.CONTACTLESS,
      primaryAID: StandardAIDs.DISCOVER,
      supportedAIDs: [StandardAIDs.DISCOVER],
      kernelId: KernelID.C6,  // Preferred kernel is still C6
      supportsC8: true,       // But supports C8
      odaType: 'CDA',
      ...options
    });

    // D-PAS 3.0 specific configuration
    profile.staticData.set('50', Buffer.from('DISCOVER').toString('hex'));
    profile.staticData.set('9F12', Buffer.from('DISCOVER').toString('hex'));
    
    // Application Version Number (tag 9F09) - D-PAS 3.0
    profile.staticData.set('9F09', '0030');
    
    // Kernel Identifier (tag 9F6D) - indicates C8 support with C6 fallback
    profile.staticData.set('9F6D', '06'); // Primary kernel: C6
    
    // Card Transaction Qualifiers (C8 aware)
    profile.staticData.set('DF8117', 'E0C0'); // Full CTQ with C8 interop
    
    // Application Interchange Profile (tag 82)
    profile.staticData.set('82', '5C80'); // CDA, CDCVM, C8 capable
    
    // Form Factor Indicator (tag 9F6E)
    profile.staticData.set('9F6E', 'F82000'); // Standard card
    
    // C8 Interoperability Indicator (tag DF8104)
    profile.staticData.set('DF8104', '01'); // C8 interop supported
    
    // CVM List - D-PAS 3.0 (full CVM support)
    profile.cvmList = [
      { method: 'CDCVM', condition: 'IF_SUPPORTED' },
      { method: 'NO_CVM', condition: 'IF_UNDER_LIMIT' },
      { method: 'ONLINE_PIN', condition: 'IF_TERMINAL_SUPPORTS' },
      { method: 'SIGNATURE', condition: 'IF_TERMINAL_SUPPORTS' }
    ];
    
    return profile;
  }

  /**
   * Create a full Discover C8 card
   */
  static createC8(options = {}) {
    const profile = new CardProfile({
      name: options.name || 'Discover C8 Common Kernel',
      specVersion: DiscoverCardSpecVersion.DPAS_C8_1_0,
      interfaceType: options.interfaceType || InterfaceType.CONTACTLESS,
      primaryAID: StandardAIDs.DISCOVER,
      supportedAIDs: [StandardAIDs.DISCOVER],
      kernelId: KernelID.C8,  // Primary kernel is C8
      supportsC8: true,
      odaType: 'CDA',
      ...options
    });

    // C8 specific configuration
    profile.staticData.set('50', Buffer.from('DISCOVER').toString('hex'));
    profile.staticData.set('9F12', Buffer.from('DISCOVER C8').toString('hex'));
    
    // Application Version Number (tag 9F09) - C8 version
    profile.staticData.set('9F09', '0800');
    
    // Kernel Identifier (tag 9F6D) - C8 with C6 fallback
    profile.staticData.set('9F6D', '08'); // Primary kernel: C8
    
    // Common Kernel Version (tag DF8102)
    profile.staticData.set('DF8102', '0100'); // C8 v1.0
    
    // Card Transaction Qualifiers
    profile.staticData.set('DF8117', 'FFE0'); // Full capabilities
    
    // Application Interchange Profile (tag 82)
    profile.staticData.set('82', '7C80'); // All features
    
    // Form Factor Indicator (tag 9F6E)
    profile.staticData.set('9F6E', 'F8C000'); // Full FFI with CDCVM
    
    // C8 Interoperability Indicator (tag DF8104)
    profile.staticData.set('DF8104', 'FF'); // Full C8 support
    
    // CVM List - C8 (comprehensive)
    profile.cvmList = [
      { method: 'CDCVM', condition: 'IF_SUPPORTED' },
      { method: 'NO_CVM', condition: 'IF_UNDER_LIMIT' },
      { method: 'ONLINE_PIN', condition: 'IF_TERMINAL_SUPPORTS' },
      { method: 'SIGNATURE', condition: 'IF_TERMINAL_SUPPORTS' }
    ];
    
    return profile;
  }

  /**
   * Create a Discover mobile HCE card (D-PAS 2.1/3.0)
   */
  static createMobileHCE(version = '2.1', options = {}) {
    const baseProfile = version === '3.0' 
      ? this.createDPAS_3_0(options)
      : this.createDPAS_2_1(options);
    
    baseProfile.name = `Discover Mobile HCE (D-PAS ${version})`;
    
    // Update Form Factor Indicator for mobile device
    baseProfile.staticData.set('9F6E', 'F8C002'); // Mobile phone with CDCVM
    
    return baseProfile;
  }
}

/**
 * Discover Card Emulator
 */
class DiscoverCardEmulator extends CardEmulator {
  constructor(profile) {
    super(profile);
    this.network = 'DISCOVER';
  }

  /**
   * Handle terminal kernel selection with C8 fallback logic
   */
  selectKernel(terminalSupportedKernels) {
    const profile = this.profile;
    
    // If card supports C8 and terminal supports C8, use C8
    if (profile.supportsC8 && terminalSupportedKernels.includes(KernelID.C8)) {
      console.log('Discover Card: Selecting C8 kernel');
      return KernelID.C8;
    }
    
    // Fall back to C6 if terminal supports it
    if (terminalSupportedKernels.includes(KernelID.C6)) {
      console.log('Discover Card: Falling back to C6 kernel');
      return KernelID.C6;
    }
    
    // No compatible kernel found
    console.warn('Discover Card: No compatible kernel found on terminal');
    return null;
  }

  /**
   * Simulate backward compatibility behavior
   */
  testBackwardCompatibility(terminalKernelVersion) {
    const results = {
      compatible: false,
      warnings: [],
      recommendations: []
    };

    const cardSpec = this.profile.specVersion;

    // Test D-PAS 1.0 compatibility
    if (cardSpec === DiscoverCardSpecVersion.DPAS_1_0) {
      if (terminalKernelVersion === 'C6' || terminalKernelVersion === 6) {
        results.compatible = true;
        results.warnings.push('D-PAS 1.0 has limited CVM support');
      }
    }

    // Test D-PAS 2.1 compatibility
    if (cardSpec === DiscoverCardSpecVersion.DPAS_2_1) {
      if (terminalKernelVersion === 'C6' || terminalKernelVersion === 6) {
        results.compatible = true;
      } else if (terminalKernelVersion === 'C8' || terminalKernelVersion === 8) {
        results.compatible = false;
        results.warnings.push('D-PAS 2.1 does not support C8 - terminal should fall back to C6');
      }
    }

    // Test D-PAS 3.0 compatibility
    if (cardSpec === DiscoverCardSpecVersion.DPAS_3_0) {
      if (terminalKernelVersion === 'C6' || terminalKernelVersion === 6 || 
          terminalKernelVersion === 'C8' || terminalKernelVersion === 8) {
        results.compatible = true;
      }
    }

    // Test C8 compatibility
    if (cardSpec === DiscoverCardSpecVersion.DPAS_C8_1_0) {
      if (terminalKernelVersion === 'C8' || terminalKernelVersion === 8) {
        results.compatible = true;
      } else if (terminalKernelVersion === 'C6' || terminalKernelVersion === 6) {
        results.compatible = true;
        results.warnings.push('C8 card falling back to C6 - terminal should be upgraded');
      }
    }

    return results;
  }
}

module.exports = {
  DiscoverCardEmulator,
  DiscoverCardProfileFactory,
  DiscoverCardSpecVersion
};
