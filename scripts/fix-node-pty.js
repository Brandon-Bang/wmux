const fs = require('fs');
const path = require('path');

// winpty.gyp / SpectreMitigation patches only apply to the Windows build of
// node-pty. On macOS and Linux, node-pty uses forkpty(3) and these gyp files
// are not part of the build graph, so running the patches is a no-op at best
// and a stat-fail at worst.
if (process.platform !== 'win32') {
  console.log(`Skipping winpty patch on ${process.platform} (Windows-only).`);
  process.exit(0);
}

const nodePtyDir = path.join(__dirname, '..', 'node_modules', 'node-pty');

// Patch both winpty.gyp and binding.gyp for bat paths and SpectreMitigation
const gypFiles = [
  path.join(nodePtyDir, 'deps', 'winpty', 'src', 'winpty.gyp'),
  path.join(nodePtyDir, 'binding.gyp'),
];

let totalPatched = 0;

for (const gypPath of gypFiles) {
  if (!fs.existsSync(gypPath)) {
    continue;
  }

  let content = fs.readFileSync(gypPath, 'utf8');
  let patched = false;
  const fileName = path.basename(gypPath);

  // Fix bat file paths (winpty.gyp only)
  if (content.includes('cd shared && GetCommitHash.bat')) {
    content = content.replace('cd shared && GetCommitHash.bat', 'cd shared && .\\\\GetCommitHash.bat');
    patched = true;
  }
  if (content.includes('cd shared && UpdateGenVersion.bat')) {
    content = content.replace('cd shared && UpdateGenVersion.bat', 'cd shared && .\\\\UpdateGenVersion.bat');
    patched = true;
  }

  // Disable SpectreMitigation — requires Spectre-mitigated libraries which are
  // not included in the standard VCTools workload (--includeRecommended).
  // Without this patch, MSB8040 error occurs during electron-rebuild.
  if (content.includes("'SpectreMitigation': 'Spectre'")) {
    content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'");
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(gypPath, content);
    console.log(`Patched ${fileName}`);
    totalPatched++;
  }
}

if (totalPatched === 0) {
  console.log('node-pty gyp files already patched or not found.');
}

// ── electron-winstaller / Squirrel: provide the unsuffixed 7z.exe ───────────
// electron-winstaller 5.x ships 7z arch-suffixed (7z-x64.exe / 7z-arm64.exe),
// but the Squirrel releasify step it invokes hardcodes the unsuffixed `7z.exe`
// (+ 7z.dll). Without these, `npm run make` fails at releasify with
// "Failed to extract … .nupkg … 지정된 파일을 찾을 수 없습니다" (Process.Start: file
// not found). Provide the copies so releasify finds them. Idempotent and
// best-effort: skips when the source is absent (electron-winstaller not
// installed, or a future version already ships a plain 7z.exe) or the target
// already exists.
const winstallerVendor = path.join(
  __dirname, '..', 'node_modules', 'electron-winstaller', 'vendor',
);
const winstallerArch = process.arch === 'arm64' ? 'arm64' : 'x64';
for (const [src, dest] of [
  [`7z-${winstallerArch}.exe`, '7z.exe'],
  [`7z-${winstallerArch}.dll`, '7z.dll'],
]) {
  const srcPath = path.join(winstallerVendor, src);
  const destPath = path.join(winstallerVendor, dest);
  try {
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Provided ${dest} for Squirrel releasify (copied from ${src}).`);
    }
  } catch (err) {
    console.log(`Could not provide ${dest}: ${err.message}`);
  }
}
