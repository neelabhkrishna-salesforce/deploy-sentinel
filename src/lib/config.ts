import fs from 'node:fs'
import path from 'node:path'

export type SmokeArea = {
  /** Human-readable business area, for example "Opportunity management". */
  name: string
  /** Robot Framework tag that selects this area's smoke tests in Copado Robotic Testing. */
  tag: string
  /** Globs, relative to the source root, of metadata that puts this area at risk. */
  metadata: string[]
  /** Globs matched against xUnit `classname.name` to attribute a test result to this area. */
  tests: string[]
}

export type SentinelConfig = {
  sourceRoot: string
  alwaysRun: {description: string; tag: string}
  areas: SmokeArea[]
  crt: {jobId: string; projectId: string; record: 'all' | 'failed' | 'none'}
  jira: {issueType: string; labels: string[]; projectKey: string}
}

export const DEFAULT_CONFIG_FILE = 'sentinel.config.json'

export function loadConfig(file: string): SentinelConfig {
  const resolved = path.resolve(file)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Sentinel config not found: ${resolved}. Copy sentinel.config.json from the plugin and adjust it for your org.`)
  }

  const config = JSON.parse(fs.readFileSync(resolved, 'utf8')) as SentinelConfig
  const problems: string[] = []
  if (!config.alwaysRun?.tag) problems.push('alwaysRun.tag is required')
  if (!Array.isArray(config.areas) || config.areas.length === 0) problems.push('at least one entry in areas is required')
  for (const [index, area] of (config.areas ?? []).entries()) {
    if (!area.name || !area.tag) problems.push(`areas[${index}] needs name and tag`)
    if (!Array.isArray(area.metadata)) problems.push(`areas[${index}].metadata must be an array of globs`)
    if (!Array.isArray(area.tests)) problems.push(`areas[${index}].tests must be an array of globs`)
  }

  if (problems.length > 0) throw new Error(`Invalid sentinel config ${resolved}: ${problems.join('; ')}`)
  config.sourceRoot ??= 'force-app/main/default'
  return config
}

/** Minimal glob support: `**` spans folders, `*` stays within one segment. Matching is case-insensitive. */
export function globToRegExp(glob: string): RegExp {
  let pattern = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (char === '*' && glob[i + 1] === '*') {
      pattern += '.*'
      i++
      if (glob[i + 1] === '/') i++
    } else if (char === '*') {
      pattern += '[^/]*'
    } else if (char === '?') {
      pattern += '[^/]'
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }

  return new RegExp(`^${pattern}$`, 'i')
}

export function matchesAny(value: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(value))
}
