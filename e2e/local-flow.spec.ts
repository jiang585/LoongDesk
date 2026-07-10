import { expect, test } from '@playwright/test'

test('onboards and creates a local todo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '御案' })).toBeVisible()
  await page.getByRole('button', { name: '启用御案' }).click()
  await page.getByRole('link', { name: /待批奏折/ }).click()
  await page.getByRole('button', { name: '新拟奏折' }).click()
  await page.getByPlaceholder('所奏何事').fill('完成御案验收')
  await page.getByRole('button', { name: '朱批入案' }).click()
  await expect(page.getByText('完成御案验收')).toBeVisible()
})

