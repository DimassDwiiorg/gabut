import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.SERVER_PORT || process.env.P_SERVER_PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SESSION_DIR = path.join(process.env.HOME || '.', 'overchat-sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const UAS = [
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/147.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/149.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Version/18.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36"
];
const MODEL = "claude-haiku-4-5-20251001";
const API = "https://api.overchat.ai/v1/chat/completions";

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function clean(t) {
  return (t || "")
    .replace(/#/g, "") 
    .replace(/\*\*/g, "") 
    .replace(/\*/g, "") 
    .replace(/__/g, "")
    .replace(/_/g, "") 
    .replace(/`/g, "") 
    .replace(/- /g, "• ")
    .trim();
}

function loadSession(name) {
  const file = path.join(SESSION_DIR, (name || "default") + ".json");
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!s.deviceId) s.deviceId = crypto.randomUUID();
    if (!Array.isArray(s.messages)) s.messages = [];
    return s;
  } catch {
    const s = { chatId: crypto.randomUUID(), deviceId: crypto.randomUUID(), messages: [] };
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
    return s;
  }
}

function saveSession(name, s) {
  const file = path.join(SESSION_DIR, (name || "default") + ".json");
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
}

async function NexaChat(prompt, sessionName = null) {
  await sleep(100 + Math.random() * 300);
  const session = loadSession(sessionName);
  
  const messages = [
    ...session.messages.slice(-10),
    { id: crypto.randomUUID(), role: "user", content: prompt },
    { 
      id: crypto.randomUUID(), 
      role: "system", 
      content: "Kamu adalah NexaPrime AI. Jawab pertanyaan user dengan gaya bahasa gaul Indonesia yang santai, akrab, luwes, dan seperti manusia asli sedang chatting (jangan kaku). JANGAN gunakan format markdown seperti asterik (**), pagar (#), atau strip (-) sama sekali. Gunakan baris baru (enter) untuk memisahkan penjelasan agar enak dibaca." 
    }
  ];

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "sec-ch-ua-platform": '"Android"',
        "x-device-uuid": session.deviceId,
        "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        "sec-ch-ua-mobile": "?1",
        "x-device-language": "id-ID",
        "x-device-platform": "web",
        "x-device-version": "1.0.44",
        "user-agent": pick(UAS),
        accept: "*/*",
        "content-type": "application/json",
        origin: "https://overchat.ai",
        referer: "https://overchat.ai/",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8"
      },
      body: JSON.stringify({
        chatId: session.chatId,
        model: MODEL,
        messages,
        personaId: "claude-haiku-4-5-landing",
        frequency_penalty: 0,
        max_tokens: 2000,
        presence_penalty: 0,
        stream: true,
        temperature: 0.7, // Dinaikin dikit biar makin kreatif & gak kaku jawabannya
        top_p: 0.95
      })
    });

    if (!res.ok) return { status: false, answer: "Aduh, AI-nya lagi pusing bwang, coba sedetik lagi!" };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", answer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const json = JSON.parse(d);
          const content = json.choices?.[0]?.delta?.content;
          if (typeof content === "string") answer += content;
        } catch {}
      }
    }

    // Bersihin sisa-sisa markdown tersembunyi
    answer = clean(answer);
    
    session.messages.push(
      { id: crypto.randomUUID(), role: "user", content: prompt },
      { id: crypto.randomUUID(), role: "assistant", content: answer }
    );
    if (session.messages.length > 20) session.messages = session.messages.slice(-20);
    saveSession(sessionName, session);

    return { status: true, answer };
  } catch (err) {
    return { status: false, answer: "Gagal menyambungkan ke server AI." };
  }
}

app.post('/api/chat', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ answer: "Jangan dikosongin dong bwang!" });
    
    const result = await NexaChat(prompt, "nexaprime-web");
    res.json(result);
});

app.get('/api/status', (req, res) => {
    res.json({ status: "Online", ping: Math.floor(Math.random() * 15) + 5 });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexaPrime udah nyala di http://152.42.252.87:${PORT}`);
});