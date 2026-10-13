import fs from 'node:fs'
import path from 'node:path'

import type {TestResult} from './xunit.js'

export type Evidence = {
  screenshots: string[]
  logs: string[]
}

const IMAGE = /\.(png|jpe?g)$/i
const LOG = /(^log\.html$|^output\.xml$|\.log$|\.txt$)/i

export const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

/**
 * Finds screenshots and logs for a test in an unzipped CRT artifacts folder.
 * Screenshots are matched by the test name appearing in the file name; logs are shared by every test in the run.
 */
export function findEvidence(artifactsDir: string | undefined, test: TestResult): Evidence {
  if (!artifactsDir) return {logs: [], screenshots: []}
  const files = walk(artifactsDir)
  const testSlug = slug(test.name)
  return {
    logs: files.filter((file) => LOG.test(path.basename(file))),
    screenshots: files.filter((file) => IMAGE.test(file) && slug(path.basename(file)).includes(testSlug)),
  }
}
