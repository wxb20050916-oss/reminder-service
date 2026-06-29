const express = require("express");
const https = require("https");

const app = express();
const port = process.env.PORT || 3000;
const BUILD_TAG = "send-test-real-send-20260629-d";
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

async function getAccessTokenData(appid, appsecret) {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", appsecret);

  return requestJson(url, { timeoutMs: 5000 });
}

function buildSubscribeMessageData() {
  return {
    thing1: {
      value: "减脂打卡"
    },
    thing3: {
      value: "今日提醒"
    },
    thing4: {
      value: "宝宝，记得完成小任务"
    },
    time13: {
      value: "08:30"
    }
  };
}

async function sendSubscribeMessage({ accessToken, openid, type, reminderTime }) {
  const url = new URL(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`);
  const data = buildSubscribeMessageData(type, reminderTime);
  const payload = {
    touser: openid,
    template_id: subscribeTemplateId,
    page: "pages/reminders/reminders",
    data
  };
  console.log("[send-test] subscribeMessage data keys", Object.keys(data));
  return requestJson(url, { method: "POST", timeoutMs: 5000 }, payload);
}

function getWechatResultLog(result) {
  return {
    errcode: result && Object.prototype.hasOwnProperty.call(result, "errcode") ? result.errcode : undefined,
    errmsg: result && result.errmsg ? result.errmsg : undefined
  };
}

app.use(express.json());

app.get("/api/ping", (req, res) => {
  res.json({
    ok: true,
    build: BUILD_TAG,
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
  console.log(`[send-test] build tag: ${BUILD_TAG}`);
  try {
    const appid = process.env.WECHAT_APPID;
    const appsecret = process.env.WECHAT_APPSECRET;
    const openid = getOpenidFromRequest(req);

    console.log("[send-test] diagnostics", {
      hasAppid: !!appid,
      hasAppsecret: !!appsecret,
      hasOpenid: !!openid
    });

    if (!openid) {
      return res.json({
        ok: false,
        stage: "missing_openid",
        build: BUILD_TAG
      });
    }

    if (!appid || !appsecret) {
      return res.json({
        ok: false,
        stage: "missing_env",
        build: BUILD_TAG
      });
    }

    console.log("[send-test] before access_token fetch");
    const tokenData = await getAccessTokenData(appid, appsecret);
    console.log("[send-test] after access_token fetch");
    console.log("[send-test] access_token result", {
      errcode: tokenData && Object.prototype.hasOwnProperty.call(tokenData, "errcode") ? tokenData.errcode : undefined,
      errmsg: tokenData && tokenData.errmsg ? tokenData.errmsg : undefined
    });

    if (!tokenData || !tokenData.access_token) {
      return res.json({
        ok: false,
        stage: "access_token_failed",
        build: BUILD_TAG,
        detail: tokenData
      });
    }

    console.log("[send-test] access_token exists: true");
    const accessToken = tokenData.access_token;
    console.log("[send-test] calling subscribeMessage.send");
    const sendResult = await sendSubscribeMessage({
      accessToken,
      openid,
      type: req.body && req.body.type,
      reminderTime: req.body && req.body.reminderTime
    });
    console.log("[send-test] subscribeMessage result", getWechatResultLog(sendResult));

    if (sendResult && sendResult.errcode === 0) {
      return res.json({
        ok: true,
        stage: "subscribe_message_sent",
        build: BUILD_TAG,
        result: sendResult
      });
    }

    return res.json({
      ok: false,
      stage: "subscribe_message_failed",
      build: BUILD_TAG,
      detail: sendResult
    });
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    const logDetail = {
      name: err && err.name ? err.name : undefined,
      code: err && err.code ? err.code : undefined,
      message,
      causeCode: err && err.cause && err.cause.code ? err.cause.code : undefined,
      causeMessage: err && err.cause && err.cause.message ? err.cause.message : undefined
    };
    console.log("[send-test] exception", logDetail);
    const isTlsCertificateError = /self-signed certificate|certificate|unable to verify/i.test(message);
    return res.json({
      ok: false,
      stage: isTlsCertificateError ? "tls_certificate_error" : "exception",
      build: BUILD_TAG,
      detail: message,
      code: err && err.code ? err.code : undefined,
      name: err && err.name ? err.name : undefined
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
