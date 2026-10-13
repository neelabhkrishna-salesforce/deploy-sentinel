// Launches a headless browser for the demo scripts. Set CHROMIUM_PATH to choose the executable.
// Long screenshot loops are more stable in chrome-headless-shell than in desktop Chrome.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {chromium} from 'playwright-core'

function findHeadlessShell() {
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!fs.existsSync(cache)) return undefined
  for (const dir of fs.readdirSync(cache).filter((name) => name.startsWith('chromium_headless_shell-')).sort().reverse()) {
    const candidate = path.join(cache, dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell')
    if (fs.existsSync(candidate)) return candidate
  }

  return undefined
}

export function launch() {
  const executablePath = process.env.CHROMIUM_PATH ?? findHeadlessShell()
  return executablePath ? chromium.launch({executablePath}) : chromium.launch({channel: 'chrome'})
}
