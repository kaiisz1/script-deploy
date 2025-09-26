import TelegramBot from "node-telegram-bot-api";
import fs from "fs-extra";
import axios from "axios";
import FormData from "form-data";
import config from "./config.js";

const bot = new TelegramBot(config.botToken, { polling: true });
let premium = JSON.parse(fs.readFileSync("./premium.json"));

// ============= Helper Premium =============
function isOwner(id) {
  return config.owner.includes(id.toString());
}
function isPremium(id) {
  return premium.premium.includes(id.toString());
}
function savePremium() {
  fs.writeFileSync("./premium.json", JSON.stringify(premium, null, 2));
}

// ============= Start Menu =============
bot.onText(/\/start/, async (msg) => {
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👨‍💻 Developer", url: "https://t.me/KaiiGood" }],
        [{ text: "📢 Channel", url: `https://t.me/${config.channel.replace("@", "")}` }]
      ]
    }
  };
  bot.sendPhoto(msg.chat.id, config.thumb, {
    caption: `👋 Halo *${msg.from.first_name}*!\n\n` +
             `Saya adalah bot auto deploy website ke *Vercel & Netlify* 🚀\n\n` +
             `Support by:\n- Kaii\n\nList Command:\n- /addprem <id>\n- /delprem <id>\n- /vercel <namaweb + reply html>\n- /netlify <namaweb + reply html>\n- /bcuser <owner only>`,
    parse_mode: "Markdown",
    ...opts
  });
});

// ============= Add Premium =============
bot.onText(/\/addprem (.+)/, (msg, match) => {
  if (!isOwner(msg.from.id)) return bot.sendMessage(msg.chat.id, "❌ Kamu bukan owner!");
  let id = match[1];
  if (!premium.premium.includes(id)) premium.premium.push(id);
  savePremium();
  bot.sendMessage(msg.chat.id, `✅ Premium ditambahkan ke ${id}`);
});

// ============= Del Premium =============
bot.onText(/\/delprem (.+)/, (msg, match) => {
  if (!isOwner(msg.from.id)) return bot.sendMessage(msg.chat.id, "❌ Kamu bukan owner!");
  let id = match[1];
  premium.premium = premium.premium.filter(x => x !== id);
  savePremium();
  bot.sendMessage(msg.chat.id, `❌ Premium dihapus dari ${id}`);
});

// ============= Broadcast User =============
bot.onText(/\/bcuser (.+)/, async (msg, match) => {
  if (!isOwner(msg.from.id)) return;
  let text = match[1];
  const users = [...new Set([...premium.premium, msg.from.id.toString()])];
  for (let user of users) {
    try { await bot.sendMessage(user, `📢 Owner:\n${text}`); } catch {}
  }
  bot.sendMessage(msg.chat.id, "✅ Broadcast selesai");
});

// ============= Deploy to GitHub + Vercel =============
bot.onText(/\/vercel (.+)/, async (msg, match) => {
  if (!isPremium(msg.from.id)) return bot.sendMessage(msg.chat.id, "❌ Premium only!");
  if (!msg.reply_to_message?.document) return bot.sendMessage(msg.chat.id, "Reply file HTML dengan command ini!");
  const domain = match[1];

  const fileId = msg.reply_to_message.document.file_id;
  const file = await bot.getFileLink(fileId);
  const res = await axios.get(file, { responseType: "arraybuffer" });
  const filePath = `./${msg.from.id}.html`;
  fs.writeFileSync(filePath, res.data);

  // Upload repo ke GitHub
  const repoName = `deploy-${Date.now()}`;
  await axios.post(`https://api.github.com/user/repos`, {
    name: repoName,
    private: false
  }, { headers: { Authorization: `token ${config.githubToken}` } });

  const content = Buffer.from(fs.readFileSync(filePath)).toString("base64");
  await axios.put(`https://api.github.com/repos/${config.githubUsername}/${repoName}/contents/index.html`, {
    message: "initial commit",
    content
  }, { headers: { Authorization: `token ${config.githubToken}` } });

  // Deploy ke Vercel
  const vercelDeploy = await axios.post(`https://api.vercel.com/v13/deployments`, {
    name: repoName,
    gitSource: { type: "github", repoId: `${config.githubUsername}/${repoName}`, ref: "main" }
  }, { headers: { Authorization: `Bearer ${config.vercelToken}` } });

  bot.sendMessage(msg.chat.id, `✅ Website berhasil di deploy!\n🌍 Domain: https://${domain}.vercel.app\n🛠 Repo: https://github.com/${config.githubUsername}/${repoName}`);
  fs.unlinkSync(filePath);
});

// ============= Deploy to GitHub + Netlify =============
bot.onText(/\/netlify (.+)/, async (msg, match) => {
  if (!isPremium(msg.from.id)) return bot.sendMessage(msg.chat.id, "❌ Premium only!");
  if (!msg.reply_to_message?.document) return bot.sendMessage(msg.chat.id, "Reply file HTML dengan command ini!");
  const domain = match[1];

  const fileId = msg.reply_to_message.document.file_id;
  const file = await bot.getFileLink(fileId);
  const res = await axios.get(file, { responseType: "arraybuffer" });
  const filePath = `./${msg.from.id}.html`;
  fs.writeFileSync(filePath, res.data);

  // Upload ke Netlify
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  const netlifyDeploy = await axios.post("https://api.netlify.com/api/v1/sites", form, {
    headers: { 
      Authorization: `Bearer ${config.netlifyToken}`,
      ...form.getHeaders()
    }
  });

  bot.sendMessage(msg.chat.id, `✅ Website berhasil di deploy!\n🌍 Domain: https://${domain}.netlify.app`);
  fs.unlinkSync(filePath);
});
