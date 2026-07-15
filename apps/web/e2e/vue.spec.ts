import { expect, test } from '@playwright/test'

test('displays the backend health status', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText(/status:\s*healthy\s+environment:\s*local\s+version:/)).toBeVisible()

  await expect(page.getByRole('button', { name: '重新检查' })).toBeEnabled()
})

test('edits a thought node and relationship across outline and graph views', async ({ page }) => {
  const updatedNodeText = '以可解释的前端交互为项目锚点'

  await page.goto('/')

  const nodeOutline = page.getByRole('list', { name: '思维模型节点' })
  await nodeOutline.getByRole('button', { name: /claim.*以复杂前端交互为锚/ }).click()

  const nodeInspector = page.getByRole('complementary', { name: '节点检查器' })
  await nodeInspector.getByLabel('节点文本').fill(updatedNodeText)
  await expect(nodeInspector.getByRole('button', { name: '保存文本' })).toBeEnabled()
  await nodeInspector.getByRole('button', { name: '保存文本' }).click()
  await expect(nodeOutline).toContainText(updatedNodeText)

  const edgeOutline = page.getByRole('list', { name: '思维模型关系' })
  await edgeOutline.getByRole('button').filter({ hasText: 'supports' }).click()

  const edgeInspector = page.getByRole('complementary', { name: '关系检查器' })
  await edgeInspector.getByLabel('关系类型').selectOption('challenges')
  await expect(edgeInspector.getByRole('button', { name: '保存关系' })).toBeEnabled()
  await edgeInspector.getByRole('button', { name: '保存关系' }).click()
  await expect(edgeOutline).toContainText('challenges')

  await page.getByRole('button', { name: '图视图' }).click()

  const graph = page.locator('.thought-graph')
  await expect(graph).toContainText(updatedNodeText)
  await expect(graph).toContainText('challenges')
})
