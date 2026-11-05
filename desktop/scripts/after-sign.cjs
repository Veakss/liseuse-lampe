// electron-builder hook (afterSign). Only for the macOS test build: the app is not signed with a certificate (there is no
// Apple developer licence), but an Apple Silicon Mac refuses an app whose signature seal was broken by our edits, so it is
// signed ad hoc ("-"). Windows builds are untouched: the Windows release is unsigned.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed (local test build only): ${app}`);
};
