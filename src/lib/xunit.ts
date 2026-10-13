import fs from 'node:fs'
import {XMLParser} from 'fast-xml-parser'

export type TestStatus = 'error' | 'fail' | 'pass' | 'skip'

export type TestResult = {
  suite: string
  name: string
  status: TestStatus
  seconds: number
  message?: string
  details?: string
}

type XmlNode = Record<string, unknown>

const asArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

function text(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined
  if (typeof node === 'string') return node.trim() || undefined
  if (typeof node === 'object') {
    const value = (node as XmlNode)['#text']
    return typeof value === 'string' ? value.trim() || undefined : undefined
  }

  return String(node)
}

function attribute(node: unknown, name: string): string | undefined {
  if (node === undefined || node === null || typeof node !== 'object') return undefined
  const value = (node as XmlNode)[`@_${name}`]
  return value === undefined ? undefined : String(value)
}

function collectSuites(node: XmlNode, out: XmlNode[]): void {
  for (const suite of asArray(node.testsuite as XmlNode | XmlNode[])) {
    out.push(suite)
    collectSuites(suite, out)
  }
}

/** Parses JUnit/xUnit XML, including the `xunit_report.xml` Robot Framework produces in CRT run artifacts. */
export function parseXunit(xml: string): TestResult[] {
  const parser = new XMLParser({attributeNamePrefix: '@_', ignoreAttributes: false, textNodeName: '#text'})
  const document = parser.parse(xml) as XmlNode
  const root = (document.testsuites as XmlNode | undefined) ?? document
  const suites: XmlNode[] = []
  collectSuites(root, suites)

  const results: TestResult[] = []
  for (const suite of suites) {
    const suiteName = attribute(suite, 'name') ?? 'Suite'
    for (const testcase of asArray(suite.testcase as XmlNode | XmlNode[])) {
      const failure = asArray(testcase.failure as XmlNode | XmlNode[])[0]
      const error = asArray(testcase.error as XmlNode | XmlNode[])[0]
      const skipped = testcase.skipped !== undefined
      const problem = failure ?? error
      const status: TestStatus = failure !== undefined ? 'fail' : error !== undefined ? 'error' : skipped ? 'skip' : 'pass'
      results.push({
        details: text(problem),
        message: attribute(problem, 'message') ?? text(problem),
        name: attribute(testcase, 'name') ?? 'Unnamed test',
        seconds: Number(attribute(testcase, 'time') ?? 0),
        status,
        suite: attribute(testcase, 'classname') ?? suiteName,
      })
    }
  }

  return results
}

export function readXunit(file: string): TestResult[] {
  if (!fs.existsSync(file)) throw new Error(`xUnit report not found: ${file}`)
  return parseXunit(fs.readFileSync(file, 'utf8'))
}
