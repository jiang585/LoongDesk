import { expect, test } from '@playwright/test'

// Windows Defender can make Vite's first cold transform unusually slow on CI/dev machines.
test.setTimeout(90_000)

test('onboards and creates a local todo', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(page.getByRole('heading', { name: '御案' })).toBeVisible()
  await page.getByRole('button', { name: '启用御案' }).click()
  await page.getByRole('link', { name: '待批奏折', exact: true }).click()
  await page.getByRole('button', { name: '新拟奏折', exact: true }).first().click()
  await page.getByPlaceholder('所奏何事').fill('完成御案验收')
  await page.getByRole('button', { name: '朱批入案' }).click()
  await expect(page.getByText('完成御案验收')).toBeVisible()
})

test('manages, searches, renames and deletes a local chat session without an API key', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByRole('button', { name: '启用御案' }).click()
  await page.getByRole('link', { name: '小太监', exact: true }).click()
  await page.getByRole('button', { name: '新建会话' }).click()
  await page.getByPlaceholder('向小安子下旨…').fill('一条只保存在本地的问答')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('一条只保存在本地的问答')).toBeVisible()

  page.once('dialog', async (dialog) => dialog.accept('春日问答'))
  await page.getByRole('button', { name: '重命名会话' }).click()
  await expect(page.getByText('春日问答')).toBeVisible()
  await page.getByPlaceholder('搜索会话或消息').fill('春日问答')
  await expect(page.getByText('春日问答')).toBeVisible()

  page.once('dialog', async (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除会话' }).click()
  await expect(page.getByText('春日问答')).not.toBeVisible()
})

test('validates a backup and shows a recovery preview before replacing data', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByRole('button', { name: '启用御案' }).click()
  await page.getByRole('link', { name: '宫设', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出 JSON 备份/ }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('备份下载未生成本地文件')
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(path)
  await expect(page.getByRole('heading', { name: '恢复预览' })).toBeVisible()
  await expect(page.getByText(/校验指纹/)).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
})
