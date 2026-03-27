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
{"intent":"reserve","reply":"..."}

ルール:
- 新規予約したい内容 → reserve
- 予約変更したい内容 → change
- 予約キャンセルしたい内容 → cancel
- 一般的な質問（営業時間、場所、支払い方法など） → faq
- 症状相談、術後トラブル、クレーム、個別判断が必要な内容、不明瞭な内容 → handoff
- faq のときだけ、短い日本語の返信文を1つ作ってください
- faq 以外のときの reply は空文字でOKです

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
    return {
      intent: "handoff",
      reply: ""
    };
  }
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

      const result = await classifyMessage(userText);
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
        replyMessage =
          result.reply ||
          "お問い合わせありがとうございます。詳細はスタッフが確認のうえご案内いたします。";
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
