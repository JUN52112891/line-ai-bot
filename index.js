import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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

      let replyMessage = "お問い合わせありがとうございます。スタッフが確認のうえ順次ご返信いたします。";

      if (userText.includes("予約")) {
        replyMessage =
          "ご予約をご希望ですね。\n下記ページより24時間ご予約いただけます。\n【予約URL】";
      } else if (userText.includes("変更")) {
        replyMessage =
          "ご予約の変更をご希望ですね。\n下記ページよりお手続きをお願いいたします。\n【変更URL】";
      } else if (userText.includes("キャンセル")) {
        replyMessage =
          "ご予約のキャンセルをご希望ですね。\n下記ページよりお手続きをお願いいたします。\n【キャンセルURL】";
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
