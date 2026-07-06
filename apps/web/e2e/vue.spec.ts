import { expect, test } from '@playwright/test'

test('displays the backend health status', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByText(/status:\s*healthy\s+environment:\s*local\s+version:/),
  ).toBeVisible()

  await expect(page.getByRole('button', { name: '重新检查' })).toBeEnabled()
})