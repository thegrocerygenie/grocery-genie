type Transform = (contents: string) => string;

// The plugins are CommonJS because Expo loads them in Node at prebuild.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { moveWindowToScene } = require('../ios-scene-lifecycle') as {
  moveWindowToScene: Transform;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addDeploymentTargetFix } = require('../withPodsMinDeploymentTarget') as {
  addDeploymentTargetFix: Transform;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { disableScannerLocation } = require('../withDocumentScannerNoLocation') as {
  disableScannerLocation: Transform;
};

// The didFinishLaunching tail of the Expo SDK 54 template AppDelegate.swift.
const APP_DELEGATE = `    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
`;

// The post_install block of the Expo SDK 54 template Podfile.
const PODFILE = `  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`;

describe('ios-scene-lifecycle moveWindowToScene', () => {
  it('removes the AppDelegate window so the scene can own it', () => {
    const out = moveWindowToScene(APP_DELEGATE);
    expect(out).not.toContain('UIWindow(frame:');
    expect(out).not.toContain('startReactNative');
    expect(out).toContain('bindReactNativeFactory(factory)');
    expect(out).toContain('return super.application(');
  });

  it('is idempotent', () => {
    const once = moveWindowToScene(APP_DELEGATE);
    expect(moveWindowToScene(once)).toBe(once);
  });

  it('fails when the template no longer matches', () => {
    expect(() => moveWindowToScene('class AppDelegate {}')).toThrow(/window block was not found/);
  });
});

describe('withPodsMinDeploymentTarget addDeploymentTargetFix', () => {
  it('raises pod targets after react_native_post_install', () => {
    const out = addDeploymentTargetFix(PODFILE);
    const rnCall = out.indexOf('react_native_post_install(');
    const fix = out.indexOf("build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = min_target");
    expect(fix).toBeGreaterThan(rnCall);
    expect(fix).toBeLessThan(out.lastIndexOf('  end\nend'));
  });

  it('is idempotent', () => {
    const once = addDeploymentTargetFix(PODFILE);
    expect(addDeploymentTargetFix(once)).toBe(once);
  });

  it('fails when the Podfile has no react_native_post_install call', () => {
    expect(() => addDeploymentTargetFix('target "App" do\nend\n')).toThrow(/not found/);
  });
});

describe('withDocumentScannerNoLocation disableScannerLocation', () => {
  const TOP = "require File.join(File.dirname(`node --print \"require.resolve('expo/package.json')\"`), \"scripts/autolinking\")\n";

  it('sets RNDS_DISABLE_LOCATION before any pod is installed', () => {
    const out = disableScannerLocation(TOP + PODFILE);
    expect(out.startsWith('# grocery-genie')).toBe(true);
    expect(out.indexOf("ENV['RNDS_DISABLE_LOCATION'] = '1'")).toBeLessThan(out.indexOf('require'));
  });

  it('is idempotent', () => {
    const once = disableScannerLocation(PODFILE);
    expect(disableScannerLocation(once)).toBe(once);
  });
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { disableUserScriptSandboxing } = require('../withUserScriptSandboxingOff') as {
  disableUserScriptSandboxing: (project: FakeProject) => FakeProject;
};

interface FakeProject {
  configs: Record<string, { buildSettings: Record<string, string> } | string>;
  pbxXCBuildConfigurationSection: () => FakeProject['configs'];
}

function fakeProject(sandboxing?: string): FakeProject {
  const settings: Record<string, string> = { PRODUCT_NAME: 'GroceryGenie' };
  if (sandboxing) settings.ENABLE_USER_SCRIPT_SANDBOXING = sandboxing;
  const configs = {
    // The xcode package keeps a "<id>_comment" string beside each entry.
    debug: { buildSettings: { ...settings } },
    debug_comment: 'Debug',
    release: { buildSettings: { ...settings } },
    release_comment: 'Release',
  };
  return { configs, pbxXCBuildConfigurationSection: () => configs };
}

describe('withUserScriptSandboxingOff disableUserScriptSandboxing', () => {
  // Xcode 27's script sandbox stops the CocoaPods "Copy Pods Resources" phase
  // writing resources-to-copy-GroceryGenie.txt into Pods/ (seen 2026-11-02).
  it('turns script sandboxing off in every build configuration', () => {
    const project = disableUserScriptSandboxing(fakeProject('YES'));

    for (const config of [project.configs.debug, project.configs.release]) {
      expect(config).toMatchObject({ buildSettings: { ENABLE_USER_SCRIPT_SANDBOXING: 'NO' } });
    }
  });

  it('sets it when the template leaves it out', () => {
    const project = disableUserScriptSandboxing(fakeProject());

    expect(project.configs.debug).toMatchObject({
      buildSettings: { ENABLE_USER_SCRIPT_SANDBOXING: 'NO', PRODUCT_NAME: 'GroceryGenie' },
    });
  });

  it('is idempotent and leaves the comment entries alone', () => {
    const project = disableUserScriptSandboxing(disableUserScriptSandboxing(fakeProject('YES')));

    expect(project.configs.debug_comment).toBe('Debug');
    expect(project.configs.release).toMatchObject({
      buildSettings: { ENABLE_USER_SCRIPT_SANDBOXING: 'NO' },
    });
  });
});
