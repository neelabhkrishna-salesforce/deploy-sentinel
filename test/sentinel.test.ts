import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {describe, expect, it, vi} from 'vitest'

import {globToRegExp, loadConfig} from '../src/lib/config.js'
import {findEvidence} from '../src/lib/evidence.js'
import {analyzeImpact, crtRunCommand, describeComponent, readChangedFiles} from '../src/lib/impact.js'
import {buildBugDrafts, postBugs} from '../src/lib/jira.js'
import {summarize, writeReports} from '../src/lib/report.js'
import {BUNDLED_CONFIG, simulated} from '../src/lib/simulation.js'
import {classify, groupFailures, normalizeMessage} from '../src/lib/triage.js'
import {parseXunit, readXunit} from '../src/lib/xunit.js'

const config = loadConfig(BUNDLED_CONFIG)
const changed = readChangedFiles(simulated.changedFiles)
const impact = analyzeImpact(changed, config)
const results = readXunit(simulated.xunit)
const context = {environment: 'UAT', simulated: true, storyName: 'US-0001234', storyTitle: 'Discount approval'}

describe('glob matching', () => {
  it('keeps * inside one folder and lets ** span folders', () => {
    expect(globToRegExp('flows/Opportunity*').test('flows/Opportunity_Close.flow-meta.xml')).toBe(true)
    expect(globToRegExp('flows/Opportunity*').test('flows/sub/Opportunity_Close.flow-meta.xml')).toBe(false)
    expect(globToRegExp('objects/Opportunity/**').test('objects/Opportunity/fields/A__c.field-meta.xml')).toBe(true)
  })
})

describe('impact analysis', () => {
  it('names source-format components by metadata type', () => {
    expect(describeComponent('objects/Opportunity/validationRules/Rule.validationRule-meta.xml')).toEqual({name: 'Opportunity.Rule', type: 'ValidationRule'})
    expect(describeComponent('classes/Svc.cls')).toEqual({name: 'Svc', type: 'ApexClass'})
    expect(describeComponent('lwc/banner/banner.js')).toEqual({name: 'banner', type: 'LightningComponentBundle'})
  })

  it('collapses a class and its meta file, and a bundle and its files, into one component each', () => {
    expect(impact.components.filter((component) => component.name === 'OpportunityDiscountService')).toHaveLength(1)
    expect(impact.components.filter((component) => component.name === 'discountApprovalBanner')).toHaveLength(1)
    expect(impact.components).toHaveLength(7)
  })

  it('selects the critical path plus only the areas the change touches', () => {
    expect(impact.tags).toEqual(['smoke-critical', 'smoke-opportunity', 'smoke-access'])
  })

  it('always runs the critical path, even for a change with no matching area', () => {
    expect(analyzeImpact(['force-app/main/default/classes/Unrelated.cls'], config).tags).toEqual(['smoke-critical'])
  })

  it('builds a CRT command that includes each selected tag and writes xUnit and artifacts', () => {
    const command = crtRunCommand(config, impact.tags, 'out/x')
    expect(command).toContain('agentia testing test run')
    expect(command).toContain('--include smoke-opportunity --include smoke-access')
    expect(command).toContain('--xunit out/x/xunit_report.xml --save-artifacts out/x/artifacts.zip --json')
  })
})

describe('xUnit parsing', () => {
  it('reads every Robot test case with its status and message', () => {
    expect(results).toHaveLength(10)
    expect(results.filter((test) => test.status === 'fail')).toHaveLength(4)
    expect(results.find((test) => test.name === 'Close Opportunity As Won')?.message).toMatch(/FIELD_CUSTOM_VALIDATION_EXCEPTION/)
  })

  it('handles nested <testsuites>, errors and skipped tests', () => {
    const parsed = parseXunit(`<testsuites><testsuite name="A"><testsuite name="B">
      <testcase classname="A.B" name="one"><error message="boom"/></testcase>
      <testcase classname="A.B" name="two"><skipped/></testcase></testsuite></testsuite></testsuites>`)
    expect(parsed.map((test) => test.status)).toEqual(['error', 'skip'])
  })
})

describe('triage', () => {
  it('classifies common Salesforce failure messages', () => {
    expect(classify('FIELD_CUSTOM_VALIDATION_EXCEPTION: nope').id).toBe('validation')
    expect(classify('An unhandled fault has occurred in this flow').id).toBe('flow')
    expect(classify('System.NullPointerException: Attempt to de-reference a null object').id).toBe('apex')
    expect(classify("INSUFFICIENT_ACCESS_OR_READONLY: You don't have access").id).toBe('access')
    expect(classify("QWeb: Text 'Save' not found").id).toBe('ui')
    expect(classify('Step timed out after 60 seconds').id).toBe('timeout')
    expect(classify('something odd').id).toBe('unknown')
  })

  it('ignores record Ids and numbers when comparing messages', () => {
    expect(normalizeMessage('Failed on 0065g00000Xa1bCAAR at 10%')).toBe(normalizeMessage('Failed on 0065g00000Xa1bDAAR at 25%'))
  })

  it('groups the same root cause on different records into one bug, and ranks the most specific suspect first', () => {
    const groups = groupFailures(results, impact.components, config)
    expect(groups.map((group) => [group.category.id, group.tests.length])).toEqual([
      ['validation', 2],
      ['ui', 1],
      ['access', 1],
    ])
    expect(groups[0].likelyCauses[0]).toMatchObject({name: 'Opportunity.Discount_Requires_Approval', type: 'ValidationRule'})
    expect(groups[1].likelyCauses[0].type).toBe('FlexiPage')
    expect(groups[2].likelyCauses[0]).toMatchObject({name: 'Sales_Discount_Approver', type: 'PermissionSet'})
  })
})

describe('reporting', () => {
  const groups = groupFailures(results, impact.components, config)
  const evidence = new Map(groups.map((group) => [group, findEvidence(simulated.artifacts, group.tests[0])]))

  it('gives a RED verdict when any test fails, and GREEN only when tests ran and all passed', () => {
    expect(summarize(results).verdict).toBe('RED')
    expect(summarize(results.filter((test) => test.status === 'pass')).verdict).toBe('GREEN')
    expect(summarize([]).verdict).toBe('RED')
  })

  it('matches screenshots to the failed test by name', () => {
    expect(evidence.get(groups[0])?.screenshots.map((file) => path.basename(file))).toEqual(['close-opportunity-as-won.png'])
  })

  it('writes the HTML report, Markdown summary and one Jira payload per root cause', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-'))
    const bugs = buildBugDrafts(groups, evidence, context, config)
    writeReports({bugs, components: impact.components, context, evidence, groups, results, selected: impact.selected, summary: summarize(results)}, out)
    expect(fs.readdirSync(path.join(out, 'bugs'))).toEqual(['BUG-01.json', 'BUG-02.json', 'BUG-03.json'])
    expect(fs.existsSync(path.join(out, 'evidence', 'close-opportunity-as-won.png'))).toBe(true)
    const payload = JSON.parse(fs.readFileSync(path.join(out, 'bugs', 'BUG-01.json'), 'utf8'))
    expect(payload.fields.project.key).toBe('QA')
    expect(payload.fields.description).toContain('Discount_Requires_Approval')
    expect(fs.readFileSync(path.join(out, 'report.html'), 'utf8')).toContain('evidence/close-opportunity-as-won.png')
  })

  it('creates each Jira issue and then uploads its evidence', async () => {
    const bugs = buildBugDrafts(groups.slice(0, 1), evidence, context, config)
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/issue') ? new Response(JSON.stringify({key: 'QA-101'}), {status: 201}) : new Response('[]', {status: 200}),
    )
    const keys = await postBugs(bugs, {baseUrl: 'https://example.atlassian.net', email: 'qa@example.com', token: 't'}, fetchMock as unknown as typeof fetch)
    expect(keys).toEqual(['QA-101'])
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://example.atlassian.net/rest/api/2/issue',
      'https://example.atlassian.net/rest/api/2/issue/QA-101/attachments',
    ])
  })
})
