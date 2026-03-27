import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post("/webhook", async (req, res) => {
  console.log("LINEからメッセージ来た👇");
  console.log(JSON.stringify(req.body, null, 2));

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message") continue;
    if (event.message?.type !== "text") continue;

    const replyToken = event.replyToken;

    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [
          {
            type: "text",
            text: "メッセージを受け取りました。"
          }
        ]
      })
    });
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("サーバー動いてます！");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
