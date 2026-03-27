import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("LINEからメッセージ来た👇");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("サーバー動いてます！");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
