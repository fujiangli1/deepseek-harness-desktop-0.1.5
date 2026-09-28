import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createTrayMenuTemplate, shouldHideWindowOnClose } from '../src/window-lifecycle.js'

test('window close hides the app unless it is quitting', () => {
  assert.equal(shouldHideWindowOnClose(false), true)
  assert.equal(shouldHideWindowOnClose(true), false)
  assert.equal(shouldHideWindowOnClose(false, false), false)
})

test('tray menu exposes show, browser, hide, and quit actions', () => {
  const actions = []
  const menu = createTrayMenuTemplate({
    locale: 'zh-CN',
    showWindow: () => actions.push('show'),
    openInBrowser: () => actions.push('browser'),
    hideWindow: () => actions.push('hide'),
    quit: () => actions.push('quit'),
  })

  assert.deepEqual(menu.map(({ label, type }) => label ?? type), [
    '打开 DeepSeek Harness',
    '在浏览器中打开',
    '隐藏窗口',
    'separator',
    '退出',
  ])

  menu[0].click()
  menu[1].click()
  menu[2].click()
  menu[4].click()
  assert.deepEqual(actions, ['show', 'browser', 'hide', 'quit'])
})

test('tray menu falls back to English labels', () => {
  const menu = createTrayMenuTemplate({
    locale: 'en-US',
    showWindow() {},
    openInBrowser() {},
    hideWindow() {},
    quit() {},
  })

  assert.deepEqual(menu.map(({ label, type }) => label ?? type), [
    'Open DeepSeek Harness',
    'Open in Browser',
    'Hide Window',
    'separator',
    'Quit',
  ])
})

test('startup screen stays minimal but now explains a slow first launch', async () => {
  const html = await readFile(new URL('../src/startup.html', import.meta.url), 'utf8')

  assert.match(html, /trayTemplate@2x\.png/)
  assert.match(html, /class="progress"/)
  // The kernel prints nothing until it is ready, so this screen is the only
  // signal the user gets. It used to be wordless, which made a slow first
  // launch - the reported "did not become ready within 60000ms" - impossible to
  // tell apart from a hung one. Keep the status line and the elapsed counter.
  assert.match(html, /id="hint"/)
  assert.match(html, /id="elapsed"/)
  assert.match(html, /第一次启动/)
  // Still a splash screen rather than a page: no heading.
  assert.doesNotMatch(html, /<h1/)
})
