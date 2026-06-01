require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const cors       = require('cors');

const Dish    = require('./models/Dish');
const Message = require('./models/Message');

const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, methods: ['GET', 'POST'] }
});

// ── MongoDB ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

// ── REST: initial load ─────────────────────────────────────────────────────
app.get('/api/dishes', async (_req, res) => {
  const dishes = await Dish.find().sort({ createdAt: -1 });
  res.json(dishes);
});

app.get('/api/messages', async (_req, res) => {
  const messages = await Message.find().sort({ createdAt: 1 }).limit(200);
  res.json(messages);
});

const fetch = require('node-fetch');

// ── YouTube search proxy ───────────────────────────────────────────────────
// Proxied server-side so the API key is never exposed to the client.
// Searches for trending/viral recipe videos and returns clean video objects.
app.get('/api/trending', async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || apiKey === 'YOUR_YOUTUBE_API_KEY_HERE') {
    return res.status(503).json({ error: 'YouTube API key not configured. Add YOUTUBE_API_KEY to server/.env' });
  }

  // Allow custom search query from client, fallback to default
  const rawQ  = (req.query.q || 'trending viral recipe shorts').slice(0, 100);
  const query = encodeURIComponent(rawQ);
  const url   = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&videoDuration=short&maxResults=20&order=viewCount&key=${apiKey}`;

  try {
    const ytRes = await fetch(url);
    if (!ytRes.ok) {
      const err = await ytRes.json();
      return res.status(ytRes.status).json({ error: err?.error?.message || 'YouTube API error' });
    }
    const data = await ytRes.json();
    const videos = (data.items || []).map(item => ({
      id:          item.id.videoId,
      title:       item.snippet.title,
      channel:     item.snippet.channelTitle,
      thumbnail:   item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
    }));
    res.json(videos);
  } catch (e) {
    console.error('YouTube fetch error:', e.message);
    res.status(500).json({ error: 'Failed to fetch from YouTube' });
  }
});


let lastRoastAt = 0;

async function checkRoast(io) {
  const pending = await Dish.find({ done: false });
  const count   = pending.length;
  if (count < 5) return;
  if (count === lastRoastAt) return;
  if ((count - 5) % 3 !== 0) return;

  lastRoastAt = count;
  const tally = {};
  pending.forEach(d => {
    const n = d.addedBy.trim();
    tally[n] = (tally[n] || 0) + 1;
  });
  const [name, theirCount] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const roasts = [
    `${name} has added ${theirCount} dishes. Nani has 2 hands and 1 back. She's not a catering company. 🙏`,
    `${count} dishes pending. ${name} is responsible for ${theirCount} of them. Nani has started a prayer group. 🕯️`,
    `${name} added another one. That's ${theirCount} from ${name} alone. Nani has disowned you in her heart. 💔`,
    `${name} really said "let me add ${theirCount} things." Nani sees. Nani remembers. Nani will bring this up at every family function. 🎤`,
    `Nani looked at the list, saw ${name}'s name ${theirCount} times, and went to lie down. She's fine. Probably. 🛏️`,
    `${name}, ${theirCount} dishes?? Nani didn't survive this long to be treated like a Zomato outlet. With love. 💕`,
    `Breaking news: ${name} has single-handedly given Nani a new career. Nani's will has been updated. 📜`,
    `${count} dishes on the list. ${name} is the main character of this chaos. The audacity. The nerve. The love. 😭`,
  ];
  io.emit('roast', roasts[Math.floor(Math.random() * roasts.length)]);
}

// ── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // ── Dishes ──
  socket.on('add_dish', async (data) => {
    try {
      const dish = await Dish.create({
        name:          data.name.trim(),
        emoji:         data.emoji,
        addedBy:       data.addedBy.trim(),
        addedByAvatar: data.addedByAvatar,
      });
      io.emit('dish_added', dish);
      checkRoast(io);
    } catch (e) { socket.emit('error', e.message); }
  });

  socket.on('toggle_done', async (id) => {
    try {
      const dish = await Dish.findById(id);
      if (!dish) return;
      dish.done = !dish.done;
      await dish.save();
      io.emit('dish_updated', dish);
    } catch (e) { socket.emit('error', e.message); }
  });

  socket.on('delete_dish', async ({ id, requester }) => {
    try {
      const dish = await Dish.findById(id);
      if (!dish) return;
      if (dish.addedBy !== requester.trim()) {
        socket.emit('error', 'You can only delete your own dishes');
        return;
      }
      await Dish.findByIdAndDelete(id);
      io.emit('dish_deleted', id);
    } catch (e) { socket.emit('error', e.message); }
  });

  // ── Chat ──
  socket.on('send_msg', async (data) => {
    try {
      const msg = await Message.create({
        text:   data.text.trim(),
        sender: data.sender.trim(),
        avatar: data.avatar,
      });
      io.emit('new_msg', msg);
    } catch (e) { socket.emit('error', e.message); }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🍱 Nani's Kitchen server running on http://localhost:${PORT}\n`);
});
