// Turns off Xcode's user script sandboxing in the app project at prebuild. The Expo
// template sets ENABLE_USER_SCRIPT_SANDBOXING = YES, and under Xcode 27 the sandbox
// stops CocoaPods' "[CP] Copy Pods Resources" phase from writing
// Pods/resources-to-copy-GroceryGenie.txt ("Operation not permitted"), so the
// build fails. CocoaPods' scripts don't declare that file, which the sandbox needs.
const { withXcodeProject } = require('expo/config-plugins');

function disableUserScriptSandboxing(project) {
  const configs = project.pbxXCBuildConfigurationSection();
  for (const entry of Object.values(configs)) {
    // Skip the "<id>_comment" strings the xcode package keeps beside each entry.
    if (typeof entry === 'object' && entry.buildSettings) {
      entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
  }
  return project;
}

const withUserScriptSandboxingOff = (config) =>
  withXcodeProject(config, (cfg) => {
    cfg.modResults = disableUserScriptSandboxing(cfg.modResults);
    return cfg;
  });

module.exports = withUserScriptSandboxingOff;
module.exports.disableUserScriptSandboxing = disableUserScriptSandboxing;
