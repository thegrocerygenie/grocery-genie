// Builds @dariyd/react-native-document-scanner without CoreLocation. The app
// never embeds GPS in a scan, and with CoreLocation linked, App Store checks
// ask for a location purpose string (ITMS-90683). The pod's podspec reads
// ENV['RNDS_DISABLE_LOCATION'] at `pod install`, so the Podfile sets it first:
// EAS builds and `make mobile-ios-native` both get it with no shell setup.
const { withPodfile } = require('expo/config-plugins');

const MARKER = '# grocery-genie: build the document scanner without CoreLocation';
const LINE = `${MARKER}\nENV['RNDS_DISABLE_LOCATION'] = '1'\n`;

function disableScannerLocation(contents) {
  if (contents.includes(MARKER)) return contents;
  return LINE + contents;
}

const withDocumentScannerNoLocation = (config) =>
  withPodfile(config, (cfg) => {
    cfg.modResults.contents = disableScannerLocation(cfg.modResults.contents);
    return cfg;
  });

module.exports = withDocumentScannerNoLocation;
module.exports.disableScannerLocation = disableScannerLocation;
