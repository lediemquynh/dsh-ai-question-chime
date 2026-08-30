// ============================================================================
// dsh-ai-question-chime — Host entry
//
// Plugin này chỉ chạy phía client (Web Audio + bắt event assistant/message),
// không cần code phía host. File này tồn tại để host loader khởi tạo plugin
// đúng cách và để khai báo peer dependency với cordis.
// ============================================================================

export const name = 'dsh-ai-question-chime'

export function apply(_ctx) {
  // No host-side behavior. The plugin reads only client-side state.
  // All UI / sound logic lives in `client/client.js`.
}
