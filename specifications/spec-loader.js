/**
 * Pluggable Specification Loader
 * 
 * Allows end-users to load custom card specifications, applet configurations,
 * and terminal profiles without modifying framework code.
 * 
 * Supports:
 * - JSON/YAML specification files
 * - Custom card applet definitions
 * - Terminal vendor profiles
 * - Network-specific configurations
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Import base specifications
const baseSpecs = require('./spec-definitions');

/**
 * Specification Loader
 */
class SpecificationLoader {
  constructor() {
    this.loadedSpecs = {
      kernels: { ...baseSpecs.KernelSpecifications },
      networks: { ...baseSpecs.NetworkFieldDefinitions },
      terminals: { ...baseSpecs.TerminalVendorProfiles },
      cardApplets: {},
      customSpecs: {}
    };
    
    this.specDirectory = path.join(__dirname, 'custom');
    this.ensureSpecDirectory();
  }

  /**
   * Ensure custom specification directory exists
   */
  ensureSpecDirectory() {
    if (!fs.existsSync(this.specDirectory)) {
      fs.mkdirSync(this.specDirectory, { recursive: true });
      
      // Create subdirectories
      ['kernels', 'applets', 'terminals', 'networks'].forEach(dir => {
        const dirPath = path.join(this.specDirectory, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath);
        }
      });
      
      // Create template files
      this.createTemplateFiles();
    }
  }

  /**
   * Create template specification files for users
   */
  createTemplateFiles() {
    // Card Applet Template
    const appletTemplate = {
      name: 'Custom Discover Applet',
      network: 'DISCOVER',
      version: '1.0.0',
      aid: 'A0000001523010',
      kernelSupport: ['C6'],
      specifications: {
        specVersion: 'CUSTOM_DPAS_1.0',
        releaseDate: '2025-01-01',
        features: ['Custom feature 1', 'Custom feature 2']
      },
      staticData: {
        '50': { tag: '50', description: 'Application Label', value: 'DISCOVER' },
        '9F09': { tag: '9F09', description: 'Application Version', value: '0010' },
        '9F12': { tag: '9F12', description: 'Application Preferred Name', value: 'DISCOVER' }
      },
      cvmList: [
        { method: 'NO_CVM', condition: 'ALWAYS' },
        { method: 'SIGNATURE', condition: 'IF_TERMINAL_SUPPORTS' }
      ],
      transactionLimits: {
        cvm: 5000,
        contactless: 20000
      }
    };

    const appletPath = path.join(this.specDirectory, 'applets', 'template-discover-applet.json');
    fs.writeFileSync(appletPath, JSON.stringify(appletTemplate, null, 2));

    // Terminal Profile Template
    const terminalTemplate = {
      vendor: 'CUSTOM_VENDOR',
      name: 'Custom Vendor',
      models: {
        'CustomModel-1000': {
          kernelSupport: ['C2', 'C3', 'C6'],
          firmwareVersions: ['1.0', '1.1'],
          c8Support: false,
          contactless: true,
          contact: true,
          capabilities: {
            terminalType: 'ATTENDED_ONLINE',
            terminalCapabilities: 'E0F8C8',
            cvmSupport: ['SIGNATURE', 'ONLINE_PIN', 'NO_CVM']
          }
        }
      }
    };

    const terminalPath = path.join(this.specDirectory, 'terminals', 'template-terminal.json');
    fs.writeFileSync(terminalPath, JSON.stringify(terminalTemplate, null, 2));

    // Network Configuration Template (YAML)
    const networkTemplate = `
network: DISCOVER
version: "3.0"
specifications:
  kernelId: C6
  c8Fallback: true
  fallbackPath:
    - C8
    - C6

fieldDefinitions:
  track2Separator: "D"
  panMaxLength: 19
  iadFormat:
    length: 32
    derivationKeyIndex:
      offset: 0
      length: 2
    cryptogramVersion:
      offset: 2
      length: 1

specificTags:
  DPAS_CTQ: "DF8117"
  FFI: "9F6E"

transactionRules:
  cvmThreshold: 5000
  contactlessLimit: 20000
  allowNoCVM: true
`;

    const networkPath = path.join(this.specDirectory, 'networks', 'template-network.yaml');
    fs.writeFileSync(networkPath, networkTemplate);

    console.log(`Template files created in: ${this.specDirectory}`);
  }

  /**
   * Load a card applet specification from file
   */
  loadCardApplet(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath, 'utf8');
      
      let spec;
      if (ext === '.json') {
        spec = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        spec = yaml.load(content);
      } else {
        throw new Error(`Unsupported file format: ${ext}`);
      }

      // Validate required fields
      this.validateAppletSpec(spec);

      // Store the loaded applet
      const appletKey = `${spec.network}_${spec.version}`;
      this.loadedSpecs.cardApplets[appletKey] = spec;

      console.log(`Loaded card applet: ${spec.name} (${appletKey})`);
      return spec;
    } catch (error) {
      console.error(`Error loading card applet from ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Load a terminal profile from file
   */
  loadTerminalProfile(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath, 'utf8');
      
      let spec;
      if (ext === '.json') {
        spec = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        spec = yaml.load(content);
      } else {
        throw new Error(`Unsupported file format: ${ext}`);
      }

      // Validate required fields
      this.validateTerminalSpec(spec);

      // Store the loaded terminal profile
      this.loadedSpecs.terminals[spec.vendor] = spec;

      console.log(`Loaded terminal profile: ${spec.name} (${spec.vendor})`);
      return spec;
    } catch (error) {
      console.error(`Error loading terminal profile from ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Load a network configuration from file
   */
  loadNetworkConfig(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath, 'utf8');
      
      let spec;
      if (ext === '.json') {
        spec = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        spec = yaml.load(content);
      } else {
        throw new Error(`Unsupported file format: ${ext}`);
      }

      // Validate required fields
      this.validateNetworkSpec(spec);

      // Store the loaded network config
      this.loadedSpecs.networks[spec.network] = spec;

      console.log(`Loaded network config: ${spec.network} v${spec.version}`);
      return spec;
    } catch (error) {
      console.error(`Error loading network config from ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Load all specifications from custom directory
   */
  loadAllCustomSpecs() {
    const results = {
      applets: [],
      terminals: [],
      networks: [],
      errors: []
    };

    // Load applets
    const appletsDir = path.join(this.specDirectory, 'applets');
    if (fs.existsSync(appletsDir)) {
      const appletFiles = fs.readdirSync(appletsDir).filter(f => 
        f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
      );
      
      for (const file of appletFiles) {
        if (file.startsWith('template-')) continue; // Skip templates
        
        try {
          const spec = this.loadCardApplet(path.join(appletsDir, file));
          results.applets.push(spec.name);
        } catch (error) {
          results.errors.push({ file, error: error.message });
        }
      }
    }

    // Load terminals
    const terminalsDir = path.join(this.specDirectory, 'terminals');
    if (fs.existsSync(terminalsDir)) {
      const terminalFiles = fs.readdirSync(terminalsDir).filter(f => 
        f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
      );
      
      for (const file of terminalFiles) {
        if (file.startsWith('template-')) continue;
        
        try {
          const spec = this.loadTerminalProfile(path.join(terminalsDir, file));
          results.terminals.push(spec.name);
        } catch (error) {
          results.errors.push({ file, error: error.message });
        }
      }
    }

    // Load networks
    const networksDir = path.join(this.specDirectory, 'networks');
    if (fs.existsSync(networksDir)) {
      const networkFiles = fs.readdirSync(networksDir).filter(f => 
        f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
      );
      
      for (const file of networkFiles) {
        if (file.startsWith('template-')) continue;
        
        try {
          const spec = this.loadNetworkConfig(path.join(networksDir, file));
          results.networks.push(spec.network);
        } catch (error) {
          results.errors.push({ file, error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Validate card applet specification
   */
  validateAppletSpec(spec) {
    const required = ['name', 'network', 'version', 'aid'];
    for (const field of required) {
      if (!spec[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    return true;
  }

  /**
   * Validate terminal specification
   */
  validateTerminalSpec(spec) {
    const required = ['vendor', 'name', 'models'];
    for (const field of required) {
      if (!spec[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    return true;
  }

  /**
   * Validate network specification
   */
  validateNetworkSpec(spec) {
    const required = ['network', 'version'];
    for (const field of required) {
      if (!spec[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    return true;
  }

  /**
   * Get all loaded specifications
   */
  getAllSpecs() {
    return this.loadedSpecs;
  }

  /**
   * Get card applet by network and version
   */
  getCardApplet(network, version) {
    const key = `${network}_${version}`;
    return this.loadedSpecs.cardApplets[key];
  }

  /**
   * Get terminal profile by vendor
   */
  getTerminalProfile(vendor) {
    return this.loadedSpecs.terminals[vendor];
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(network) {
    return this.loadedSpecs.networks[network];
  }

  /**
   * Export current specifications to JSON
   */
  exportSpecifications(outputPath) {
    const exportData = {
      timestamp: new Date().toISOString(),
      specifications: this.loadedSpecs
    };

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    console.log(`Specifications exported to: ${outputPath}`);
  }

  /**
   * Get custom specification directory path
   */
  getSpecDirectory() {
    return this.specDirectory;
  }
}

// Singleton instance
let loaderInstance = null;

/**
 * Get or create specification loader instance
 */
function getSpecLoader() {
  if (!loaderInstance) {
    loaderInstance = new SpecificationLoader();
  }
  return loaderInstance;
}

module.exports = {
  SpecificationLoader,
  getSpecLoader
};
