# TODO

- [ ] 回答译文持久化：现在存在 `hooks/register.js` 的模块级 `Map` 里，插件热重载或重启后，历史回答的译文会丢。
  可以改用 `$.state`（跨热重载保留，写入后自动重画）或 `$.store`（跨会话），需要声明 state contract。
