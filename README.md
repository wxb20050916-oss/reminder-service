# reminder-service

最小 Express 云托管提醒服务雏形。当前只提供接口结构和测试接口，暂不真正调用 `subscribeMessage.send`。

## 本地启动

```bash
npm install
npm start
```

默认端口：`3000`。如果云托管注入 `PORT` 环境变量，会自动使用云托管端口。

## 本地测试

### GET /api/ping

```bash
curl http://localhost:3000/api/ping
```

期望返回：

```json
{
  "ok": true,
  "message": "reminder service is running",
  "time": "当前时间"
}
```

### POST /api/reminders/preview

```bash
curl -X POST http://localhost:3000/api/reminders/preview \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"breakfast\",\"nickname\":\"宝宝\"}"
```

文案规则：

- `breakfast`：宝宝，早餐吃稳一点。
- `workout`：宝宝，今天轻轻动一下。
- `checkin`：宝宝，今天的小结可以记一下。

### POST /api/reminders/send-test

```bash
curl -X POST http://localhost:3000/api/reminders/send-test \
  -H "Content-Type: application/json" \
  -d "{\"openid\":\"OPENID\",\"type\":\"checkin\",\"templateId\":\"TEMPLATE_ID\",\"page\":\"pages/reminders/reminders\",\"data\":{}}"
```

当前接口只返回将要发送的 payload，不会真正发送订阅消息。

## 部署到微信云托管

1. 确认本地 `npm install` 和 `npm start` 正常。
2. 在微信云托管中新建或选择服务。
3. 使用本目录作为构建目录。
4. 确认云托管使用 Dockerfile 构建。
5. 部署成功后测试 `GET /api/ping`。
6. 部署后把小程序提醒页测试接口从 `/api/count` 改成 `/api/ping`。
7. 后续再接真实 `subscribeMessage.send`。

## 后续真实发送提醒需要补齐

- 获取用户 openid。
- 校验用户是否已授权。
- 保存提醒计划和订阅状态。
- 定时扫描 reminders。
- 调用 `subscribeMessage.send`。
- 发送成功后标记本次订阅为 `used`。
