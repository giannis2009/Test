// Runs the site and keeps it in sync with GitHub: every 20 s it checks for new commits,
// pulls them, reinstalls packages if needed and restarts the server. Used by start-windows.bat.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BRANCH = process.env.EZRO_BRANCH || 'claude/zealous-bardeen-fbh74g';
const REPO = process.env.EZRO_REPO || 'https://github.com/giannis2009/Test';
const EVERY = 20_000;
const isWin = process.platform === 'win32';
const PUBLIC = process.env.EZRO_TUNNEL === '1'; // started by start-public-windows.bat
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env */ }
const PORT = Number(process.env.PORT) || 3000;
let publicUrl = null;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const say = (m) => console.log(`\x1b[35m[ezro]\x1b[0m ${m}`);
const npmInstall = () => execFileSync(isWin ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: isWin });

function hasGit() { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }

// First run in a folder that came from a zip: turn it into a copy of the GitHub branch.
// .env and data/ are untouched (they are not part of the repository).
function ensureRepo() {
  if (fs.existsSync(path.join(ROOT, '.git'))) return;
  say('Connecting this folder to GitHub (one time)...');
  git('init');
  git('remote', 'add', 'origin', REPO);
  git('fetch', 'origin', BRANCH);
  git('reset', '--hard', 'FETCH_HEAD');
  git('checkout', '-B', BRANCH);
  git('branch', '--set-upstream-to', `origin/${BRANCH}`);
}

let server = null;
function startServer() {
  const env = { ...process.env, EZRO_LOCAL: '1' };
  if (PUBLIC) { env.EZRO_PUBLIC = '1'; if (publicUrl) env.EZRO_PUBLIC_URL = publicUrl; }
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { cwd: ROOT, stdio: 'inherit', env });
  server.on('exit', (code, sig) => {
    if (code === 75) { say('Restarting (backup restore)...'); startServer(); return; } // the site asked for a restart
    if (sig !== 'SIGTERM' && code !== null && !restarting) say(`Server stopped (code ${code}). Waiting for the next update...`);
  });
}
let restarting = false;
function restartServer() {
  restarting = true;
  const old = server;
  const go = () => { restarting = false; startServer(); };
  if (old && old.exitCode === null) { old.once('exit', go); old.kill('SIGTERM'); } else go();
}

function checkForUpdates() {
  try {
    git('fetch', '--quiet', 'origin', BRANCH);
    const local = git('rev-parse', 'HEAD');
    const remote = git('rev-parse', `origin/${BRANCH}`);
    if (local === remote) return;
    const changed = git('diff', '--name-only', local, remote).split('\n');
    git('reset', '--hard', `origin/${BRANCH}`);
    say(`Updated: ${git('log', '-1', '--format=%s')}`);
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) npmInstall();
    if (changed.some((f) => f.startsWith('server/') || f.startsWith('package'))) restartServer();
    else say('Refresh the browser to see the change.');
  } catch (e) {
    say(`Could not check for updates: ${String(e.stderr || e.message).split('\n')[0]}`);
  }
}

if (!hasGit()) {
  say('Git is not installed, so automatic updates are off. Starting the site anyway.');
} else {
  try { ensureRepo(); } catch (e) { say(`GitHub connection failed: ${String(e.stderr || e.message).split('\n')[0]}`); }
}
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) npmInstall();
startServer();
if (PUBLIC) {
  // public on the internet: Cloudflare Tunnel → this PC
  if (!process.env.GOOGLE_CLIENT_ID) say('\x1b[33mNote: GOOGLE_CLIENT_ID is empty in .env — visitors can browse, but must sign in with Google to buy. See README → Public from this PC.\x1b[0m');
  require('./tunnel').startTunnel(PORT, (url) => {
    if (url && url !== publicUrl) {
      publicUrl = url;
      try { fs.writeFileSync(path.join(path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')), 'PUBLIC-URL.txt'), `${url}\n`); } catch { /* data folder not ready */ }
      const line = '═'.repeat(Math.max(46, url.length + 6));
      console.log(`\n  \x1b[32m╔${line}╗\n  ║  YOUR SITE IS PUBLIC:${' '.repeat(line.length - 22)}║\n  ║  ${url}${' '.repeat(line.length - url.length - 2)}║\n  ╚${line}╝\x1b[0m`);
      say(`Admin: ${url}/admin   ·   PayPal IPN: ${url}/api/paypal/ipn`);
      say('Keep this window open — the site is online only while this PC is on and this window runs.');
      restartServer(); // the server now knows its public address (PayPal return / IPN links, previews)
    } else if (!url) say('Tunnel connected (fixed address from your Cloudflare dashboard).');
  }).catch((e) => say(`Could not start the tunnel: ${e.message}`));
}
if (hasGit() && fs.existsSync(path.join(ROOT, '.git'))) {
  say(`Auto-update is on — new changes from GitHub appear here within ~20 seconds.`);
  setInterval(checkForUpdates, EVERY);
}
process.on('SIGINT', () => { server?.kill('SIGTERM'); process.exit(0); });
