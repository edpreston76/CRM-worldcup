// CRM World Cup Sweepstake 2026 - real-time draft server
// One shared draft state, broadcast to every connected client over websockets.

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PLAYERS = ["Ed", "Maria", "Alex", "Millie"];

// 48 qualified teams, FIFA world ranking, 4 tiers of 12
const TEAMS = [
  { name: "France", flag: "🇫🇷", rank: 1, tier: 1 },
  { name: "Spain", flag: "🇪🇸", rank: 2, tier: 1 },
  { name: "Argentina", flag: "🇦🇷", rank: 3, tier: 1 },
  { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", rank: 4, tier: 1 },
  { name: "Portugal", flag: "🇵🇹", rank: 5, tier: 1 },
  { name: "Brazil", flag: "🇧🇷", rank: 6, tier: 1 },
  { name: "Netherlands", flag: "🇳🇱", rank: 7, tier: 1 },
  { name: "Morocco", flag: "🇲🇦", rank: 8, tier: 1 },
  { name: "Belgium", flag: "🇧🇪", rank: 9, tier: 1 },
  { name: "Germany", flag: "🇩🇪", rank: 10, tier: 1 },
  { name: "Croatia", flag: "🇭🇷", rank: 11, tier: 1 },
  { name: "Colombia", flag: "🇨🇴", rank: 13, tier: 1 },
  { name: "Senegal", flag: "🇸🇳", rank: 14, tier: 2 },
  { name: "Mexico", flag: "🇲🇽", rank: 15, tier: 2 },
  { name: "USA", flag: "🇺🇸", rank: 16, tier: 2 },
  { name: "Uruguay", flag: "🇺🇾", rank: 17, tier: 2 },
  { name: "Japan", flag: "🇯🇵", rank: 18, tier: 2 },
  { name: "Switzerland", flag: "🇨🇭", rank: 19, tier: 2 },
  { name: "Iran", flag: "🇮🇷", rank: 21, tier: 2 },
  { name: "Turkiye", flag: "🇹🇷", rank: 22, tier: 2 },
  { name: "Ecuador", flag: "🇪🇨", rank: 23, tier: 2 },
  { name: "Austria", flag: "🇦🇹", rank: 24, tier: 2 },
  { name: "South Korea", flag: "🇰🇷", rank: 25, tier: 2 },
  { name: "Australia", flag: "🇦🇺", rank: 27, tier: 2 },
  { name: "Algeria", flag: "🇩🇿", rank: 28, tier: 3 },
  { name: "Egypt", flag: "🇪🇬", rank: 29, tier: 3 },
  { name: "Canada", flag: "🇨🇦", rank: 30, tier: 3 },
  { name: "Norway", flag: "🇳🇴", rank: 31, tier: 3 },
  { name: "Panama", flag: "🇵🇦", rank: 33, tier: 3 },
  { name: "Ivory Coast", flag: "🇨🇮", rank: 34, tier: 3 },
  { name: "Sweden", flag: "🇸🇪", rank: 38, tier: 3 },
  { name: "Paraguay", flag: "🇵🇾", rank: 40, tier: 3 },
  { name: "Czechia", flag: "🇨🇿", rank: 41, tier: 3 },
  { name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", rank: 43, tier: 3 },
  { name: "Tunisia", flag: "🇹🇳", rank: 44, tier: 3 },
  { name: "DR Congo", flag: "🇨🇩", rank: 46, tier: 3 },
  { name: "Uzbekistan", flag: "🇺🇿", rank: 50, tier: 4 },
  { name: "Qatar", flag: "🇶🇦", rank: 55, tier: 4 },
  { name: "Iraq", flag: "🇮🇶", rank: 57, tier: 4 },
  { name: "South Africa", flag: "🇿🇦", rank: 60, tier: 4 },
  { name: "Saudi Arabia", flag: "🇸🇦", rank: 61, tier: 4 },
  { name: "Jordan", flag: "🇯🇴", rank: 63, tier: 4 },
  { name: "Bosnia & Herz.", flag: "🇧🇦", rank: 65, tier: 4 },
  { name: "Cape Verde", flag: "🇨🇻", rank: 69, tier: 4 },
  { name: "Ghana", flag: "🇬🇭", rank: 74, tier: 4 },
  { name: "Curacao", flag: "🇨🇼", rank: 82, tier: 4 },
  { name: "Haiti", flag: "🇭🇹", rank: 83, tier: 4 },
  { name: "New Zealand", flag: "🇳🇿", rank: 85, tier: 4 },
];

// Rounds 1-3 = tier 4, 4-6 = tier 3, 7-9 = tier 2, 10-12 = tier 1.
// Everyone draws once per round, so everyone gets exactly 3 teams per tier.
const tierForRound = (round) => (round <= 3 ? 4 : round <= 6 ? 3 : round <= 9 ? 2 : 1);

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------------------
// Game state (in memory - a server restart resets the draft)
// ---------------------------------------------------------------------------
const freshState = () => ({
  phase: "lobby", // lobby | order | draft | results
  order: [],
  revealedCount: 0,
  decks: null,
  picks: { Ed: [], Maria: [], Alex: [], Millie: [] },
  pickIndex: 0,
  drawState: "ready", // ready | drawing | revealed
  currentCard: null,
});

let game = freshState();
// claims: player name -> secret token. A device that claims a name controls it.
let claims = {};
let revealTimer = null;

const currentPlayer = () => game.order[game.pickIndex % 4] || null;

// State sent to clients (decks stay secret, claims sent as claimed names only)
const publicState = () => ({
  phase: game.phase,
  order: game.order,
  revealedCount: game.revealedCount,
  picks: game.picks,
  pickIndex: game.pickIndex,
  drawState: game.drawState,
  currentCard: game.currentCard,
  currentPlayer: currentPlayer(),
  claimedPlayers: Object.keys(claims),
  players: PLAYERS,
});

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const broadcast = () => {
  const msg = JSON.stringify({ type: "state", state: publicState() });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
};

const tokenOwns = (token, playerName) => claims[playerName] && claims[playerName] === token;

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
  ws.send(JSON.stringify({ type: "state", state: publicState() }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "claim": {
        const name = msg.name;
        if (!PLAYERS.includes(name)) return;
        // Re-claim with the same token is fine (reconnects)
        if (claims[name] && claims[name] !== msg.token) {
          ws.send(JSON.stringify({ type: "error", msg: `${name} is already claimed on another device.` }));
          return;
        }
        const token = claims[name] || crypto.randomBytes(12).toString("hex");
        claims[name] = token;
        ws.send(JSON.stringify({ type: "claimed", name, token }));
        broadcast();
        break;
      }

      case "unclaim": {
        const name = msg.name;
        if (PLAYERS.includes(name) && tokenOwns(msg.token, name)) {
          delete claims[name];
          broadcast();
        }
        break;
      }

      case "startOrder": {
        if (game.phase !== "lobby") return;
        game.phase = "order";
        game.order = shuffle(PLAYERS);
        game.revealedCount = 0;
        broadcast();
        break;
      }

      case "revealOrder": {
        if (game.phase !== "order" || game.revealedCount >= 4) return;
        game.revealedCount += 1;
        broadcast();
        break;
      }

      case "startDraft": {
        if (game.phase !== "order" || game.revealedCount < 4) return;
        game.phase = "draft";
        game.decks = {
          1: shuffle(TEAMS.filter((t) => t.tier === 1)),
          2: shuffle(TEAMS.filter((t) => t.tier === 2)),
          3: shuffle(TEAMS.filter((t) => t.tier === 3)),
          4: shuffle(TEAMS.filter((t) => t.tier === 4)),
        };
        game.picks = { Ed: [], Maria: [], Alex: [], Millie: [] };
        game.pickIndex = 0;
        game.drawState = "ready";
        game.currentCard = null;
        broadcast();
        break;
      }

      case "draw": {
        if (game.phase !== "draft" || game.drawState !== "ready") return;
        const onClock = currentPlayer();
        // Only the player on the clock can draw (if their name is claimed).
        // If nobody has claimed that name, anyone may draw on their behalf.
        if (claims[onClock] && !tokenOwns(msg.token, onClock)) {
          ws.send(JSON.stringify({ type: "error", msg: `Only ${onClock} can draw right now.` }));
          return;
        }
        game.drawState = "drawing";
        broadcast();
        // Shared suspense: everyone sees the spinner, then the reveal together
        clearTimeout(revealTimer);
        revealTimer = setTimeout(() => {
          const tier = tierForRound(Math.floor(game.pickIndex / 4) + 1);
          const team = game.decks[tier].pop();
          game.currentCard = team;
          game.picks[onClock] = [...game.picks[onClock], team];
          game.drawState = "revealed";
          broadcast();
        }, 1400);
        break;
      }

      case "next": {
        if (game.phase !== "draft" || game.drawState !== "revealed") return;
        game.currentCard = null;
        game.drawState = "ready";
        game.pickIndex += 1;
        if (game.pickIndex >= 48) game.phase = "results";
        broadcast();
        break;
      }

      case "reset": {
        clearTimeout(revealTimer);
        game = freshState();
        broadcast();
        break;
      }
    }
  });
});

// Keep connections alive (Render closes idle connections)
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sweepstake draft live on port ${PORT}`));
