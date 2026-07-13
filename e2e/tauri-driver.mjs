import path from 'node:path'
import { remote } from 'webdriverio'

const application = process.env.TAURI_APP_PATH ?? path.resolve('src-tauri/target/debug/yuan.exe')
const connect = () => remote({
  hostname: '127.0.0.1',
  port: 4444,
  logLevel: 'warn',
  capabilities: {
    'tauri:options': { application },
  },
})

const selectWindow = async (browser, selector) => {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle)
      if (await browser.$(selector).isExisting()) return handle
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`未找到窗口：${selector}`)
}

let browser = await connect()

try {
  const handles = await browser.getWindowHandles()
  if (handles.length < 2) throw new Error('小安子宠物窗未创建')
  await selectWindow(browser, '.pet-window')
  await selectWindow(browser, '.app-shell, .onboarding-backdrop')

  const body = await browser.$('body')
  await body.waitForExist({ timeout: 20_000 })
  const initialText = await body.getText()
  if (!initialText.includes('御案')) throw new Error('主窗口未加载御案界面')

  const onboarding = await browser.$('.onboarding-backdrop')
  if (await onboarding.isExisting()) {
    await browser.$('button=启用御案').click()
    await onboarding.waitForExist({ reverse: true, timeout: 20_000 })
  }

  await browser.execute(() => { window.location.hash = '#/todos?quick=1' })
  const editor = await browser.$('h2=新拟奏折')
  await editor.waitForDisplayed({ timeout: 10_000 })

  const titleInput = await browser.$('input[placeholder="所奏何事"]')
  await titleInput.setValue('桌面端端到端测试')
  if ((await titleInput.getValue()) !== '桌面端端到端测试') throw new Error('待办编辑器无法输入')
  await browser.$('button=朱批入案').click()
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('桌面端端到端测试'), {
    timeout: 10_000,
    timeoutMsg: '待办保存后未出现在列表中',
  })

  await browser.deleteSession()
  await new Promise((resolve) => setTimeout(resolve, 800))
  browser = await connect()
  await selectWindow(browser, '.app-shell')
  await browser.execute(() => { window.location.hash = '#/todos' })
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('桌面端端到端测试'), {
    timeout: 20_000,
    timeoutMsg: '应用重启后待办未从 SQLite 恢复',
  })
} finally {
  try { await browser.deleteSession() } catch { /* session may already be closed */ }
}
