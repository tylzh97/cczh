// 区分手打与粘贴：提交时手打段包 <input>，粘贴段包 <paste>
import { installTracker, takeParts } from './tracker.js'
import { mark } from './segments.js'

export function register(on) {
  installTracker(on)

  on('prompt.submit', async ($, e, next) => {
    // 只处理用户在终端输入的 prompt，通知、peer 消息等原样放行
    if (e.origin.kind !== 'composer') return next(e)
    const text = mark(takeParts(e))

    // 视觉反馈：$.ui.log 不发给模型；它只画一行，所以逐行输出
    for (const line of text.split('\n')) $.ui.log(line)
    return next({ ...e, text })
  })
}
