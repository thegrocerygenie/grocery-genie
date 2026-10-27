// Raises every pod target below the app's deployment target to it at prebuild. Xcode 27
// rejects targets below iOS 15.0, and some pods (resource bundles such as
// GoogleSignIn-GoogleSignIn, RNSVG-RNSVGFilters, SDWebImage-SDWebImage) still declare lower.
const { withPodfile } = require('expo/config-plugins');

const MARKER = '# grocery-genie: raise pod deployment targets';

const POST_INSTALL_CALL = /react_native_post_install\([\s\S]*?\n\s*\)\n/;

const BLOCK = `
    ${MARKER}
    min_target = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new(min_target)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = min_target
        end
      end
    end
`;

function addDeploymentTargetFix(contents) {
  if (contents.includes(MARKER)) return contents;
  const match = contents.match(POST_INSTALL_CALL);
  if (!match) {
    throw new Error(
      'withPodsMinDeploymentTarget: react_native_post_install(...) was not found in the Podfile.',
    );
  }
  const end = match.index + match[0].length;
  return contents.slice(0, end) + BLOCK + contents.slice(end);
}

const withPodsMinDeploymentTarget = (config) =>
  withPodfile(config, (cfg) => {
    cfg.modResults.contents = addDeploymentTargetFix(cfg.modResults.contents);
    return cfg;
  });

module.exports = withPodsMinDeploymentTarget;
module.exports.addDeploymentTargetFix = addDeploymentTargetFix;
