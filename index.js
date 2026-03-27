import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("=== WEBHOOK HIT ===");
  console.log("headers:", JSON.stringify(req.headers, null, 2));
  console.log("body:", JSON.stringify(req.body, null, 2));
  res.status(200).send("OK");
});

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("サーバー動いてます！");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
