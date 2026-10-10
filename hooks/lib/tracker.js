// 有状态的薄壳：用 prompt.edit 维护输入框分段，submit 时取走
// 输入框只有一个，状态放模块级即可
// 加载器要求 on 只能传给具名导入的函数，所以不用工厂/对象方法
import { applyEdit, resync, align } from './segments.js'

let segs = []

export function installTracker(on) {
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    // 下游 hook 可能改写了结果，以最终输入框为准
    segs = resync(applyEdit(segs, e), r.text)
    return r
  })
}

// 提交时输入框已清空，只能用最后一次编辑后的分段
export function takeParts(e) {
  const parts = align(segs, e.text)
  segs = []
  return parts
}
