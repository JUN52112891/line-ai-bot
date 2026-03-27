import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json());

async function classifyMessage(userText) {
  const prompt = `
あなたは美容クリニックのLINE受付AIです。
ユーザーのメッセージを次の5つのどれかに分類してください。

- reserve
- change
- cancel
- faq
- handoff

必ずJSONだけで返してください。
形式:
{"intent":"reserve","reply":""}

ルール:
- 新規予約したい内容 → reserve
- 予約変更したい内容 → change
- 予約キャンセルしたい内容 → cancel
- 一般的な質問（営業時間、場所、支払い方法など） → faq
- 症状相談、術後トラブル、クレーム、個別判断が必要な内容、不明瞭な内容 → handoff
- faq のときの reply は空文字でOK
- faq 以外のときの reply も空文字でOK

ユーザーのメッセージ:
${userText}
`;

  const response = await openai.responses.create({
    model: "gpt-5",
    input: prompt
  });

  const text = response.output_text;

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse error:", text);
    return { intent: "handoff", reply: "" };
  }
}

async function loadFaqs() {
  console.log("FAQ_SHEET_URL:", process.env.FAQ_SHEET_URL);

  const res = await fetch(process.env.FAQ_SHEET_URL);
  console.log("FAQ fetch status:", res.status);
  console.log("FAQ fetch content-type:", res.headers.get("content-type"));

  const rawText = await res.text();
  console.log("FAQ raw first 200 chars:", rawText.slice(0, 200));

  return JSON.parse(rawText);
}

function findFaqMatch(userText, faqs) {
  const normalized = userText.toLowerCase().trim();

  for (const faq of faqs) {
    const keywords = String(faq.keywords || "")
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);

    const matched = keywords.some(keyword => normalized.includes(keyword));
    if (matched) {
      return faq;
    }
  }

  return null;
}

app.post("/webhook", async (req, res) => {
  try {
    console.log("LINEからメッセージ来た👇");
    console.log(JSON.stringify(req.body, null, 2));

    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message") continue;
      if (event.message?.type !== "text") continue;

      const userText = event.message.text || "";
      const replyToken = event.replyToken;

      let result;

      try {
        result = await classifyMessage(userText);
      } catch (error) {
        console.error("AI ERROR:", error);
        result = { intent: "handoff", reply: "" };
      }

      console.log("AI分類結果:", result);

      let replyMessage =
        "個別確認が必要な内容のため、スタッフが確認のうえ順次ご返信いたします。";

      if (result.intent === "reserve") {
        replyMessage =
          "ご予約をご希望ですね。\n下記ページより24時間ご予約いただけます。\nhttps://connect.kireipass.jp/clinics/lif-skinclinic-azabu/menus";
      } else if (result.intent === "change") {
        replyMessage =
          "ご予約の変更をご希望ですね。\n下記ページよりお手続きをお願いいたします。\nhttps://connect.kireipass.jp/clinics/lif-skinclinic-azabu/menus";
      } else if (result.intent === "cancel") {
        replyMessage =
          "ご予約のキャンセルをご希望ですね。\n下記ページよりお手続きをお願いいたします。\nhttps://connect.kireipass.jp/clinics/lif-skinclinic-azabu/menus";
      } else if (result.intent === "faq") {
        try {
          const faqs = await loadFaqs();
          const matchedFaq = findFaqMatch(userText, faqs);

          if (matchedFaq) {
            if (String(matchedFaq.handoff_flag).toLowerCase() === "yes") {
              replyMessage =
                "個別確認が必要な内容のため、スタッフが確認のうえ順次ご返信いたします。";
            } else {
              replyMessage = matchedFaq.answer || "詳細はスタッフがご案内いたします。";
            }
          } else {
            replyMessage =
              "該当するご案内が見つからなかったため、スタッフが確認のうえ順次ご返信いたします。";
          }
        } catch (error) {
          console.error("FAQ ERROR:", error);
          replyMessage =
            "現在システム調整中のため、スタッフが確認のうえ順次ご返信いたします。";
        }
      }

      const lineResponse = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          replyToken,
          messages: [
            {
              type: "text",
              text: replyMessage
            }
          ]
        })
      });

      const responseText = await lineResponse.text();
      console.log("LINE reply status:", lineResponse.status);
      console.log("LINE reply body:", responseText);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("ERROR:", error);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("サーバー動いてます！");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
