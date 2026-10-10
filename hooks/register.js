// 探针 mod：验证 prompt.submit 改写（进上下文）与回答追加显示（不进上下文）
//
// 粘贴识别（见 anthropics/claude-code#100443）：
// - 长粘贴折叠成 [Pasted text #n ...]，不触发 prompt.edit，输入框里只有占位符
// - 短粘贴触发 prompt.edit，没有 key
// 做法：用输入框还原“手打段”，在展开后的 e.text 中按顺序定位，没对上的部分即粘贴

const SEP = '_'
const LOG = '/tmp/underscore-probe.log'
// 无 key 的编辑达到该长度（或含换行）才算短粘贴；低于它可能是输入法上屏或连击
const PASTE_MIN = 30
const PLACEHOLDER = /\[Pasted text #\d+[^\]]*\]/

// 本轮记录到的短粘贴、上一次编辑后的输入框，submit 后清空
let inlinePastes = []
let lastBox = ''
// 诊断用：本轮每次 prompt.edit 的摘要
let edits = []

// 按行在字符之间插入分隔符，换行保留；Array.from 按码点切分，中文/emoji 不会被拆坏
function interleave(s) {
  return s.split('\n').map((line) => Array.from(line).join(SEP)).join('\n')
}

// 输入框去掉占位符和短粘贴后，剩下的就是手打段
// trim：提交时 engine 会去掉 prompt 首尾空白，带空白的手打段会对不上
function typedParts(box, pastes) {
  let parts = box.split(PLACEHOLDER)
  for (const p of pastes) parts = parts.flatMap((x) => x.split(p))
  return parts.map((x) => x.trim()).filter((x) => x.length > 0)
}

// 在 text 中按顺序定位手打段：手打段做 interleave，其余（粘贴）原样保留
function transformPrompt(text, typed) {
  let out = ''
  let last = 0
  for (const t of typed) {
    const i = text.indexOf(t, last)
    if (i < 0) continue
    out += text.slice(last, i) + interleave(t)
    last = i + t.length
  }
  return out + text.slice(last)
}

// $.fs 没有 append，读出旧内容后整体写回
async function log($, tag, value) {
  const old = await $.fs.read(LOG).catch(() => '')
  const line = `${new Date().toISOString()} ${tag} ${JSON.stringify(value)}\n`
  await $.fs.write(LOG, old + line)
}

export function register(on) {
  on('prompt.edit', async ($, e, next) => {
    // 只记内存，不碰文件：prompt.edit 只有 50ms
    if (e.inputText) edits.push({ key: e.key ?? null, len: e.inputText.length, head: e.inputText.slice(0, 40) })
    // 短粘贴没有 key；连击/输入法也没有 key，所以再用长度/换行过滤
    if (!e.key && (e.inputText.includes('\n') || e.inputText.length >= PASTE_MIN)) {
      inlinePastes.push(e.inputText)
    }
    const r = await next(e)
    lastBox = r.text
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    // 只处理用户在终端输入的 prompt，通知、peer 消息等原样放行
    if (e.origin.kind !== 'composer') return next(e)

    // 实测 submit 时输入框已清空（$.prompt.read() 为空），只能用最后一次编辑后的快照
    const typed = typedParts(lastBox, inlinePastes)
    const text = transformPrompt(e.text, typed)

    await log($, 'prompt.edits', edits)
    await log($, 'prompt.lastBox', lastBox)
    await log($, 'prompt.inlinePastes', inlinePastes)
    await log($, 'prompt.typed', typed)
    await log($, 'prompt.raw', e.text)
    await log($, 'prompt.rewritten', text)

    inlinePastes = []
    lastBox = ''
    edits = []
    return next({ ...e, text })
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // 只处理主循环的正常回答；子 agent、中断、报错都跳过
    if (e.agentId !== undefined || e.reason !== 'answer' || !e.answer) return r

    // 记录会话里存下的最后一条 assistant 文本，用来核对上下文没被改动
    const stored = (await $.session.messages()).filter((m) => m.role === 'assistant').at(-1)
    await log($, 'turn.stored', stored?.text ?? null)

    // $.ui.log 不发给模型；它只画一行，所以逐行输出
    for (const line of interleave(e.answer).split('\n')) {
      if (line.trim()) $.ui.log(line)
    }
    return r
  })
}
