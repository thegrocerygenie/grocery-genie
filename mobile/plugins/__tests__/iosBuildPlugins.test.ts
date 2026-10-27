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
