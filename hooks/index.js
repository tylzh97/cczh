// Entry point: hooks.json allows only one module, so each feature registers itself here
// The loader allows passing `on` to named-import functions; `$` cannot cross files, so each feature keeps its IO in its own module
import { registerPrompt } from './prompt.js'
import { registerAnswer } from './answer.js'

export function register(on) {
  registerPrompt(on) // translate typed input into English
  registerAnswer(on) // translate the final answer into Chinese
}
