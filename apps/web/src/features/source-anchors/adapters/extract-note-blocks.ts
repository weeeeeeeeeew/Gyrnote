import type { JSONContent } from '@tiptap/core'

export interface NoteBlockForCompile {
  id: string
  text: string
}

/**
 * M3.L+ 用户学习检查点：从 TipTap JSON 提取带稳定 blockId 的文本块。
 *
 * 约束：
 * - 只收集 type 为 paragraph / heading 且 attrs.blockId 为非空字符串的节点；
 * - text 为该块内全部 text 节点拼接（忽略 marks）；
 * - text trim 后为空的块跳过；
 * - 递归遍历 content，不要只看第一层；
 * - 不要抛异常；没有块时返回 []。
 *
 * 验证：
 * `pnpm exec vitest run src/features/source-anchors/adapters/extract-note-blocks.spec.ts`
 */
export function extractNoteBlocks(_doc: JSONContent): NoteBlockForCompile[] {
  const blocks: NoteBlockForCompile[] = [];

  function traverse(node: JSONContent) {
    // 检查当前节点
    if (node.type === 'paragraph' || node.type === 'heading') {
      const blockId = node.attrs?.blockId
      if (typeof blockId === 'string' && blockId.length > 0) {
        // 拼接 text 子节点
        const textParts: string[] = []
        for (const child of node.content ?? []) {
          if (child.type === 'text' && typeof child.text === 'string') {
            textParts.push(child.text)
          }
        }
        const text = textParts.join('').trim()
        
        // trim 后为空则跳过
        if (text.length > 0) {
          blocks.push({ id: blockId, text })
        }
      }
    }
    
    // 递归进入子节点
    for (const child of node.content ?? []) {
      traverse(child)
    }
  }

  traverse(_doc)
  return blocks
}
