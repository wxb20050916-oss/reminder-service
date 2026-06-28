const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

const reminderMessages = {
  breakfast: "宝宝，早餐吃稳一点。",
  workout: "宝宝，今天轻轻动一下。",
  checkin: "宝宝，今天的小结可以记一下。"
};

function getReminderPreview(type, nickname) {
  const name = nickname || "宝宝";
  const key = reminderMessages[type] ? type : "checkin";
  return reminderMessages[key].replace("宝宝", name);
}

app.use(express.json());

app.get("/api/ping", (req, res) => {
  res.json({
    ok: true,
    message: "reminder service is running",
    time: new Date().toISOString()
  });
});

app.post("/api/reminders/preview", (req, res) => {
  const { type, nickname } = req.body || {};
  res.json({
    ok: true,
    preview: getReminderPreview(type, nickname)
  });
});

app.post("/api/reminders/send-test", (req, res) => {
  const { openid, type, templateId, page, data } = req.body || {};
  const payload = {
    touser: openid || "OPENID_PLACEHOLDER",
    templateId: templateId || "TEMPLATE_ID_PLACEHOLDER",
    page: page || "pages/reminders/reminders",
    data: data || {},
    reminderType: type || "checkin"
  };

  // TODO: 获取 openid。
  // TODO: 校验用户是否已授权。
  // TODO: 调用 subscribeMessage.send 发送订阅消息。
  // TODO: 发送成功后标记本次订阅为 used。
  res.json({
    ok: true,
    dryRun: true,
    message: "send-test only returns payload; subscribeMessage.send is not called yet",
    payload
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "not found"
  });
});

app.listen(port, () => {
  console.log(`reminder service listening on port ${port}`);
});
