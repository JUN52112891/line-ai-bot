import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json());

const DANGER_KEYWORDS = [
  "痛い",
  "痛み",
  "腫れ",
  "赤み",
  "出血",
  "膿",
  "熱感",
  "しびれ",
  "違和感",
  "おかしい",
  "感染",
  "アレルギー",
  "息苦しい",
  "苦しい",
  "激痛",
  "トラブル"
];

function isDangerousMessage(userText) {
  return DANGER_KEYWORDS.some(keyword => userText.includes(keyword));
}

async function loadKnowledge() {
  const res = await fetch(process.env.KNOWLEDGE_SHEET_URL);
  if (!res.ok) {
    throw new Error(`Knowledge fetch failed: ${res.status}`);
  }
  return await res.json();
}

function knowledgeToPromptText(knowledgeRows) {
  return knowledgeRows
    .map(row => `- [${row.category}] ${row.title}: ${row.value}`)
    .join("\n");
}

async function generateAnswer(userText, knowledgeRows) {
  const knowledgeText = knowledgeToPromptText(knowledgeRows);

  const prompt = `
あなたはLIF SKIN CLINICのLINE受付AIです。
次の院内情報だけを使って、ユーザーに自然で丁寧な日本語で回答してください。

【院内情報】
${knowledgeText}

【回答ルール】
- 必ず院内情報の範囲内だけで答えてください
- 情報にないことは、勝手に推測せず「スタッフが確認のうえご案内いたします」と伝えてください
- 予約したい、予約変更したい、キャンセルしたいという内容なら、該当するURLを案内してください
- 丁寧で簡潔に答えてください
- 箇条書きにしなくてよい場合は自然な文章で返してください
- 医学的判断はしないでください

【ユーザーの質問】
${userText}
`;

  const response = await openai.responses.create({
    model: "gpt-5",
    input: prompt
  });

  return response.output_text.trim();
}

async function sendLineReply(replyToken, text) {
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
          text
        }
      ]
    })
  });

  const responseText = await lineResponse.text();
  console.log("LINE reply status:", lineResponse.status);
  console.log("LINE reply body:", responseText);
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

      let replyMessage = "";

      if (isDangerousMessage(userText)) {
        replyMessage =
          "症状や術後経過については個別確認が必要なため、スタッフが確認のうえ順次ご返信いたします。お急ぎの場合はお電話でもご連絡ください。";
      } else {
        try {
          const knowledgeRows = await loadKnowledge();
          replyMessage = await generateAnswer(userText, knowledgeRows);
        } catch (error) {
          console.error("KNOWLEDGE / AI ERROR:", error);
          replyMessage =
            "現在システム調整中のため、スタッフが確認のうえ順次ご返信いたします。";
        }
      }

      await sendLineReply(replyToken, replyMessage);
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
