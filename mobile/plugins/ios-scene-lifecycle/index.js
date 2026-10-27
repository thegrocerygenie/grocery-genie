// Moves the iOS app to the UIScene lifecycle at prebuild. An app built with the iOS 27 SDK
// that has no scene manifest traps at launch on iOS 27, in debug and release builds.
// Expo SDK 54 to 57 templates still create the window in AppDelegate. Drop this plugin
// once the Expo template adopts UIScene itself.
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SCENE_DELEGATE = 'SceneDelegate.swift';
const MARKER = '// grocery-genie: SceneDelegate creates the window';

// The template block that creates the window in didFinishLaunching.
const WINDOW_BLOCK =
  /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[\s\S]*?#endif\n/;

function moveWindowToScene(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!WINDOW_BLOCK.test(contents)) {
    throw new Error(
      'ios-scene-lifecycle: the AppDelegate window block was not found. The Expo template ' +
        'changed; check whether it adopts UIScene now, and update or drop this plugin.',
    );
  }
  return contents.replace(WINDOW_BLOCK, `    ${MARKER} and starts React Native.\n`);
}

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

const withAppDelegateWithoutWindow = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('ios-scene-lifecycle: expected a Swift AppDelegate.');
    }
    cfg.modResults.contents = moveWindowToScene(cfg.modResults.contents);
    return cfg;
  });

const withSceneDelegateFile = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const target = path.join(cfg.modRequest.platformProjectRoot, projectName, SCENE_DELEGATE);
      await fs.promises.copyFile(path.join(__dirname, SCENE_DELEGATE), target);
      return cfg;
    },
  ]);

const withSceneDelegateInProject = (config) =>
  withXcodeProject(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = `${projectName}/${SCENE_DELEGATE}`;
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: cfg.modResults,
      });
    }
    return cfg;
  });

const withIosSceneLifecycle = (config) =>
  withSceneDelegateInProject(
    withSceneDelegateFile(withAppDelegateWithoutWindow(withSceneManifest(config))),
  );

module.exports = withIosSceneLifecycle;
module.exports.moveWindowToScene = moveWindowToScene;
