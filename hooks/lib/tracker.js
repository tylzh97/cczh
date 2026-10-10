// Thin stateful shell: maintains the input box segments via prompt.edit and hands them over on submit
// There's only one input box, so module-level state is enough
// The loader requires `on` to be passed only to named-import functions, so no factories/object methods
import { applyEdit, resync, align } from './segments.js'

let segs = []

export function installTracker(on) {
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    // Downstream hooks may have rewritten the result; the final input box is the source of truth
    segs = resync(applyEdit(segs, e), r.text)
    return r
  })
}

// The input box is already cleared on submit, so only the segments from the last edit are available
export function takeParts(e) {
  const parts = align(segs, e.text)
  segs = []
  return parts
}
