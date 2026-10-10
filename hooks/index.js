// 入口：hooks.json 只允许一个模块，两个功能各自注册
// 加载器允许把 on 传给具名导入的函数；$ 则不能跨文件，所以每个功能的 IO 都留在自己的模块里
import { registerPrompt } from './prompt.js'
import { registerAnswer } from './answer.js'

export function register(on) {
  registerPrompt(on) // 手打内容翻译成英文
  registerAnswer(on) // 最后回答翻译成中文
}
