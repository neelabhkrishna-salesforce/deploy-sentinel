import {type SentinelConfig, matchesAny} from './config.js'
import type {ChangedComponent} from './impact.js'
import type {TestResult} from './xunit.js'

export type FailureCategory = {
  id: string
  label: string
  /** Metadata types that most often cause this kind of failure. */
  suspectTypes: string[]
  hint: string
}

const CATEGORIES: Array<FailureCategory & {pattern: RegExp}> = [
  {
    hint: 'A validation rule or required field is rejecting data the business flow used to accept.',
    id: 'validation',
    label: 'Validation rule',
    pattern: /FIELD_CUSTOM_VALIDATION_EXCEPTION|REQUIRED_FIELD_MISSING|validation rule/i,
    suspectTypes: ['ValidationRule', 'CustomField'],
  },
  {
    hint: 'A record-triggered or screen flow failed. Check the flow version deployed in this promotion.',
    id: 'flow',
    label: 'Flow failure',
    pattern: /unhandled fault|FLOW_ELEMENT_ERROR|CANNOT_EXECUTE_FLOW_TRIGGER|\bflow\b/i,
    suspectTypes: ['Flow'],
  },
  {
    hint: 'Apex threw an exception. Check the classes and triggers deployed in this promotion.',
    id: 'apex',
    label: 'Apex exception',
    pattern: /System\.\w+Exception|APEX_ERROR|Apex trigger|CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY/i,
    suspectTypes: ['ApexClass', 'ApexTrigger'],
  },
  {
    hint: 'The test user lost access to an object, field, record type or app. Check profiles and permission sets.',
    id: 'access',
    label: 'Access or permissions',
    pattern: /INSUFFICIENT_ACCESS|insufficient privileges|do(?:n't| not) have access|FIELD_INTEGRITY|not permitted/i,
    suspectTypes: ['Profile', 'PermissionSet', 'RecordType'],
  },
  {
    hint: 'An element the test relies on is missing or renamed. Check page layouts, Lightning pages and components.',
    id: 'ui',
    label: 'UI element missing',
    pattern: /element .*not found|no such element|text .*not (?:found|visible)|could not find|locator|ElementNotFound|QWeb/i,
    suspectTypes: ['FlexiPage', 'Layout', 'LightningComponentBundle', 'AuraDefinitionBundle', 'CustomField'],
  },
  {
    hint: 'The step timed out. This can be a slow org or a flaky test; rerun failed tests before filing.',
    id: 'timeout',
    label: 'Timeout',
    pattern: /timed? ?out|timeout/i,
    suspectTypes: [],
  },
]

const UNKNOWN: FailureCategory = {
  hint: 'The failure did not match a known pattern. Read the log and evidence attached to this group.',
  id: 'unknown',
  label: 'Unclassified',
  suspectTypes: [],
}

export type FailureGroup = {
  signature: string
  category: FailureCategory
  area: string
  message: string
  tests: TestResult[]
  likelyCauses: ChangedComponent[]
}

export function classify(message: string): FailureCategory {
  const match = CATEGORIES.find((category) => category.pattern.test(message))
  if (!match) return UNKNOWN
  const {pattern: _pattern, ...category} = match
  return category
}

/** Strips record Ids, numbers and quoted values so the same root cause on different records groups together. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\b[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?\b/g, (token) => (/\d/.test(token) && /[a-zA-Z]/.test(token) ? '<id>' : token))
    .replace(/(["'])(?:(?!\1).)*\1/g, '<value>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function areaForTest(test: TestResult, config: SentinelConfig): string {
  const id = `${test.suite}.${test.name}`
  return config.areas.find((area) => matchesAny(id, area.tests))?.name ?? 'Critical path (always run)'
}

export function groupFailures(results: readonly TestResult[], components: readonly ChangedComponent[], config: SentinelConfig): FailureGroup[] {
  const groups = new Map<string, FailureGroup>()
  for (const test of results) {
    if (test.status !== 'fail' && test.status !== 'error') continue
    const message = test.message ?? test.details ?? 'No failure message'
    const category = classify(`${message}\n${test.details ?? ''}`)
    const area = areaForTest(test, config)
    const signature = `${category.id}|${area}|${normalizeMessage(message)}`
    const existing = groups.get(signature)
    if (existing) {
      existing.tests.push(test)
      continue
    }

    groups.set(signature, {area, category, likelyCauses: rankCauses(category, area, components), message, signature, tests: [test]})
  }

  return [...groups.values()]
}

/** Changed components that match the failure's category, preferring ones in the failing test's business area. */
export function rankCauses(category: FailureCategory, area: string, components: readonly ChangedComponent[]): ChangedComponent[] {
  if (category.suspectTypes.length === 0) return []
  const rank = (type: string) => category.suspectTypes.indexOf(type)
  const typed = components
    .filter((component) => category.suspectTypes.includes(component.type))
    .sort((a, b) => rank(a.type) - rank(b.type))
  const inArea = typed.filter((component) => component.areas.includes(area))
  return (inArea.length > 0 ? inArea : typed).slice(0, 3)
}
