const express = require("express");
const https = require("https");

const app = express();
const port = process.env.PORT || 3000;
const subscribeTemplateId = "22C8PNofZUjrU24koEcfpkMZJX0qjr3Matg4PgZGdo4";

const reminderMessages = {
  breakfast: "宝宝，早餐吃稳一点。",
  workout: "宝宝，今天轻轻动一下。",
  checkin: "宝宝，今天的小结可以记一下。"
};

const reminderNames = {
  breakfast: "早餐打卡",
  workout: "运动打卡",
  checkin: "今日小结"
};

function getReminderPreview(type, nickname) {
  const name = nickname || "宝宝";
  const key = reminderMessages[type] ? type : "checkin";
  return reminderMessages[key].replace("宝宝", name);
}

function getOpenidFromRequest(req) {
  return req.get("x-wx-openid") || "";
}

function requestJson(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = https.request(url, {
      method: options.method || "GET",
      headers: Object.assign({
        "Content-Type": "application/json"
      }, payload ? { "Content-Length": Buffer.byteLength(payload) } : {}, options.headers || {})
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (err) {
          reject({
            message: "微信接口返回不是 JSON",
            statusCode: res.statusCode,
            raw
          });
          return;
        }
        if (res.statusCode >= 400) {
          reject({
            message: "微信接口 HTTP 请求失败",
            statusCode: res.statusCode,
            data
          });
          return;
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken(appid, appsecret) {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", appsecret);

  const result = await requestJson(url);
  if (!result.access_token) {
    throw {
      message: "获取 access_token 失败",
      detail: result
    };
  }
  return result.access_token;
}

function buildSubscribeMessageData(type, reminderTime) {
  const key = reminderMessages[type] ? type : "checkin";
  const normalizedReminderTime = reminderTime
    ? reminderTime.replace(/^(\d{4})-(\d{2})-(\d{2})\s+(.+)$/, "$1年$2月$3日 $4")
    : new Date().toLocaleString("zh-CN", { hour12: false });
  return {
    thing1: {
      value: reminderNames[key]
    },
    time2: {
      value: normalizedReminderTime
    },
    thing3: {
      value: reminderMessages[key]
    }
  };
}

async function sendSubscribeMessage({ accessToken, openid, type, reminderTime }) {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/message/subscribe/send");
  url.searchParams.set("access_token", accessToken);
  const payload = {
    touser: openid,
    template_id: subscribeTemplateId,
    page: "pages/reminders/reminders",
    data: buildSubscribeMessageData(type, reminderTime)
  };
  return requestJson(url, { method: "POST" }, payload);
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

app.post("/api/reminders/send-test", async (req, res) => {
  const { type, reminderTime } = req.body || {};
  const appid = process.env.WECHAT_APPID;
  const appsecret = process.env.WECHAT_APPSECRET;
  const openid = getOpenidFromRequest(req);

  if (!openid) {
    res.status(400).json({
      ok: false,
      error: "OPENID_NOT_FOUND",
      detail: "没有从微信云托管请求 header x-wx-openid 中获取到 openid，请确认小程序通过 wx.cloud.callContainer 调用，并检查云托管是否注入该 header。"
    });
    return;
  }

  if (!appid || !appsecret) {
    res.status(500).json({
      ok: false,
      error: "WECHAT_ENV_NOT_CONFIGURED",
      detail: "请在微信云托管环境变量中配置 WECHAT_APPID 和 WECHAT_APPSECRET。"
    });
    return;
  }

  try {
    const accessToken = await getAccessToken(appid, appsecret);
    const result = await sendSubscribeMessage({
      accessToken,
      openid,
      type,
      reminderTime
    });
    if (result.errcode) {
      res.status(502).json({
        ok: false,
        error: "SUBSCRIBE_MESSAGE_SEND_FAILED",
        detail: result
      });
      return;
    }
    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : "SEND_TEST_FAILED",
      detail: err
    });
  }
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
