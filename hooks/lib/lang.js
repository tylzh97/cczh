// Language checks deciding whether a template needs translating at all: pure functions, never touches $
import { stripMarkers } from './template.js'

// If the text portion is all ASCII there's no need to translate into English
export function needsEnglish(template) {
  return /[^\x00-\x7F]/.test(stripMarkers(template))
}

// Only translate into Chinese when the text portion has more Latin letters than CJK characters
export function needsChinese(template) {
  const t = stripMarkers(template)
  const cjk = (t.match(/[一-鿿]/g) ?? []).length
  const latin = (t.match(/[A-Za-z]/g) ?? []).length
  return latin > cjk
}
