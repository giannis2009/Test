// Makes the local site public on the internet with a Cloudflare Tunnel — no router / port-forwarding needed.
//  • Quick tunnel (default): free, no account, a new https://<random>.trycloudflare.com address each start.
//  • Fixed address: put CLOUDFLARE_TUNNEL_TOKEN and PUBLIC_DOMAIN (e.g. https://ezro.gr) in .env
//    (Cloudflare Zero Trust → Networks → Tunnels → Create tunnel → service http://localhost:3000).
// cloudflared is downloaded automatically into ./bin the first time (official GitHub release).
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin');
const isWin = process.platform === 'win32';
const say = (m) => console.log(`\x1b[36m[tunnel]\x1b[0m ${m}`);

function findCloudflared() {
  const local = path.join(BIN, isWin ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(local)) return local;
  try { execFileSync(isWin ? 'where' : 'which', ['cloudflared'], { stdio: 'ignore' }); return 'cloudflared'; } catch { return null; }
}
async function download() {
  const arch = os.arch() === 'arm64' ? 'arm64' : os.arch() === 'ia32' ? '386' : 'amd64';
  const name = isWin ? `cloudflared-windows-${arch}.exe` : process.platform === 'linux' ? `cloudflared-linux-${arch}` : null;
  if (!name) throw new Error('On a Mac install it once with:  brew install cloudflared');
  say('Downloading cloudflared (one time, ~20 MB)...');
  const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${name}`);
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  fs.mkdirSync(BIN, { recursive: true });
  const file = path.join(BIN, isWin ? 'cloudflared.exe' : 'cloudflared');
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()), { mode: 0o755 });
  return file;
}

// Starts the tunnel and calls onUrl(url) once the public address is known (and again if it changes).
async function startTunnel(port, onUrl) {
  let exe = findCloudflared();
  if (!exe) exe = await download();
  const token = process.env.CLOUDFLARE_TUNNEL_TOKEN;
  const fixed = (process.env.PUBLIC_DOMAIN || '').replace(/\/$/, '');
  const args = token ? ['tunnel', '--no-autoupdate', 'run', '--token', token]
    : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`];
  let child; let stopped = false;
  const run = () => {
    child = spawn(exe, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let announced = false;
    const scan = (buf) => {
      const text = buf.toString();
      if (token) {
        if (!announced && /Registered tunnel connection/i.test(text)) { announced = true; onUrl(fixed || null); }
        return;
      }
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m && !announced) { announced = true; onUrl(m[0]); }
      if (/failed to (request|create) quick tunnel|error="[^"]*429/i.test(text)) say('Cloudflare is busy — retrying in a moment...');
    };
    child.stdout.on('data', scan); child.stderr.on('data', scan);
    child.on('exit', (code) => { if (!stopped) { say(`Tunnel closed (code ${code}) — reconnecting in 5 s...`); setTimeout(run, 5000); } });
  };
  run();
  return { stop: () => { stopped = true; child?.kill(); } };
}

module.exports = { startTunnel };
