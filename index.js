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
    const timeoutMs = options.timeoutMs || 5000;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject({
        code: "wechat_request_timeout",
        message: `微信接口请求超过 ${timeoutMs}ms`,
        url: url.origin + url.pathname
      });
      req.destroy();
    }, timeoutMs);
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
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
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
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken(appid, appsecret) {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", appsecret);

  const result = await requestJson(url, { timeoutMs: 5000 });
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
  return requestJson(url, { method: "POST", timeoutMs: 5000 }, payload);
}

function getWechatErrorLog(result) {
  const source = result && (result.detail || result.data || result);
  return {
    errcode: source && Object.prototype.hasOwnProperty.call(source, "errcode") ? source.errcode : undefined,
    errmsg: source && source.errmsg ? source.errmsg : undefined
  };
}

function sendJsonOnce(state, res, statusCode, payload) {
  if (state.responded) return;
  state.responded = true;
  clearTimeout(state.timer);
  res.status(statusCode).json(payload);
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
  console.log("[send-test] request received");
  const { type, reminderTime } = req.body || {};
  const appid = process.env.WECHAT_APPID;
  const appsecret = process.env.WECHAT_APPSECRET;
  const openid = getOpenidFromRequest(req);
  const responseState = {
    responded: false,
    timer: setTimeout(() => {
      sendJsonOnce(responseState, res, 504, {
        ok: false,
        error: "wechat_request_timeout",
        detail: "send-test 接口总耗时超过 7500ms，已提前返回，避免前端 callContainer timeout。"
      });
    }, 7500)
  };

  console.log("[send-test] diagnostics", {
    hasAppid: !!appid,
    hasAppsecret: !!appsecret,
    hasOpenid: !!openid,
    headerKeys: Object.keys(req.headers || {})
  });

  if (!openid) {
    sendJsonOnce(responseState, res, 400, {
      ok: false,
      error: "missing_openid",
      detail: "没有从微信云托管请求 header x-wx-openid 中获取到 openid，请确认小程序通过 wx.cloud.callContainer 调用，并检查云托管是否注入该 header。"
    });
    return;
  }

  if (!appid || !appsecret) {
    sendJsonOnce(responseState, res, 500, {
      ok: false,
      error: "missing_env",
      detail: "请在微信云托管环境变量中配置 WECHAT_APPID 和 WECHAT_APPSECRET。"
    });
    return;
  }

  let stage = "access_token";
  try {
    console.log("[send-test] requesting access_token");
    const accessToken = await getAccessToken(appid, appsecret);
    if (responseState.responded) return;
    console.log("[send-test] access_token result", {
      errcode: 0,
      errmsg: ""
    });
    console.log("[send-test] calling subscribeMessage.send");
    stage = "subscribe_message";
    const result = await sendSubscribeMessage({
      accessToken,
      openid,
      type,
      reminderTime
    });
    if (responseState.responded) return;
    console.log("[send-test] subscribeMessage.send result", getWechatErrorLog(result));
    if (result.errcode) {
      sendJsonOnce(responseState, res, 502, {
        ok: false,
        error: "subscribe_message_failed",
        detail: result
      });
      return;
    }
    sendJsonOnce(responseState, res, 200, {
      ok: true,
      result
    });
  } catch (err) {
    if (responseState.responded) return;
    const isTimeout = err && (err.code === "wechat_request_timeout" || err.message === "wechat_request_timeout");
    const error = isTimeout
      ? "wechat_request_timeout"
      : (stage === "subscribe_message" ? "subscribe_message_failed" : "access_token_failed");
    if (stage === "subscribe_message") {
      console.log("[send-test] subscribeMessage.send result", getWechatErrorLog(err));
    } else {
      console.log("[send-test] access_token result", getWechatErrorLog(err));
    }
    sendJsonOnce(responseState, res, isTimeout ? 504 : 500, {
      ok: false,
      error,
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
