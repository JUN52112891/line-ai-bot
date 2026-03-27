import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json());

async function classifyIntent(userText) {
  const prompt = `
あなたは美容クリニックのLINE受付AIの分類器です。
ユーザーのメッセージを、次のいずれか1つに分類してください。

- reservation
- reservation_change
- reservation_cancel
- general_faq
- personal_post_treatment_issue
- other_handoff

分類基準:
- reservation:
  新規予約したい
- reservation_change:
  予約変更したい
- reservation_cancel:
  予約キャンセルしたい
- general_faq:
  一般的な施術説明、一般的なダウンタイム、一般的な注意事項、診療時間、アクセス、支払い方法など
- personal_post_treatment_issue:
  個別の症状相談、術後トラブル、強い痛み、強い腫れ、出血、感染疑い、自分の経過相談
- other_handoff:
  上記以外で、スタッフ確認が望ましいもの

重要:
- 「糸リフトの痛みはどれくらい続きますか？」のような一般論は general_faq
- 「昨日糸リフトを受けたがまだかなり痛い」のような個別相談は personal_post_treatment_issue
- 必ずJSONのみで返してください
- 形式: {"intent":"general_faq"}

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
  } catch (error) {
    console.error("CLASSIFY JSON PARSE ERROR:", text);
    return { intent: "other_handoff" };
  }
}

async function loadKnowledge() {
  console.log("KNOWLEDGE_SHEET_URL:", process.env.KNOWLEDGE_SHEET_URL);

  const res = await fetch(process.env.KNOWLEDGE_SHEET_URL);
  console.log("Knowledge fetch status:", res.status);
  console.log("Knowledge fetch content-type:", res.headers.get("content-type"));

  const rawText = await res.text();
  console.log("Knowledge raw first 200 chars:", rawText.slice(0, 200));

  return JSON.parse(rawText);
}

function knowledgeToPromptText(knowledgeRows) {
  return knowledgeRows
    .map(row => `- [${row.category}] ${row.title}: ${row.value}`)
    .join("\n");
}

async function generateAnswerFromKnowledge(userText, knowledgeRows) {
  const knowledgeText = knowledgeToPromptText(knowledgeRows);

  const prompt = `
あなたはLIF SKIN CLINICのLINE受付AIです。
以下の院内情報だけを使って、ユーザーに自然で丁寧な日本語で回答してください。

【院内情報】
${knowledgeText}

【回答ルール】
- 必ず院内情報の範囲内だけで答えてください
- 情報にないことは、勝手に推測せず「スタッフが確認のうえご案内いたします」と伝えてください
- 予約したい内容なら予約URLを案内してください
- 予約変更したい内容なら予約変更URLを案内してください
- キャンセルしたい内容ならキャンセルURLを案内してください
- 丁寧で簡潔に答えてください
- 医学的判断はしないでください
- 一般的な施術説明はしてよいですが、個別症状の判断はしないでください

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
      let intent = "other_handoff";

      try {
        const classified = await classifyIntent(userText);
        intent = classified.intent || "other_handoff";
        console.log("INTENT:", intent);
      } catch (error) {
        console.error("CLASSIFY ERROR:", error);
        intent = "other_handoff";
      }

      if (intent === "personal_post_treatment_issue") {
        replyMessage =
          "症状や術後経過については個別確認が必要なため、スタッフが確認のうえ順次ご返信いたします。お急ぎの場合はお電話でもご連絡ください。";
      } else if (intent === "other_handoff") {
        replyMessage =
          "個別確認が必要な内容のため、スタッフが確認のうえ順次ご返信いたします。";
      } else {
        try {
          const knowledgeRows = await loadKnowledge();
          replyMessage = await generateAnswerFromKnowledge(userText, knowledgeRows);
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
