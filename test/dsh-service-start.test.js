import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_READY_TIMEOUT_MS, describeKernelOutput } from '../src/dsh-service.js'

test('the ready timeout leaves room for a slow first launch', () => {
  // A first launch builds 483 junctions before the kernel even starts loading
  // its plugin tree, and the kernel announces nothing until it is done. A cold
  // start on a warm developer machine, with no antivirus interference, already
  // measures ~17s; 60s left no room for a slower disk and turned a merely slow
  // start into "could not start".
  assert.ok(
    DEFAULT_READY_TIMEOUT_MS >= 180_000,
    `expected at least 180000ms, got ${DEFAULT_READY_TIMEOUT_MS}`,
  )
})

test('silence is explained instead of producing an empty dialog', () => {
  // This is the case the reported bug landed in: the kernel printed nothing, so
  // the dialog showed only the timeout line and the user had nothing to go on.
  const described = describeKernelOutput('')
  assert.notEqual(described.trim(), '')
  assert.match(described, /初始化/)
  assert.match(described, /不是崩溃/)
})

test('whitespace-only output counts as silence', () => {
  assert.equal(describeKernelOutput('  \n\t\r\n '), describeKernelOutput(''))
})

test('short kernel output is shown verbatim', () => {
  const output = "Cannot find package '@deepseek-ai/dsh-jobs' imported from dsh-jobs-local\n"
  assert.equal(describeKernelOutput(output), output.trim())
})

test('a long plugin-tree dump keeps the tail, where the failure is', () => {
  const output = `${'noise\n'.repeat(1000)}THE ACTUAL FAILURE\n`
  const described = describeKernelOutput(output)
  assert.ok(described.length < output.length, 'the dump should be truncated')
  assert.match(described, /THE ACTUAL FAILURE/)
  assert.match(described, /前文省略/)
})
