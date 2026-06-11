# CRM World Cup Sweepstake 2026

Real-time World Cup sweepstake draft for Ed, Maria, Alex and Millie. Everyone
opens the same URL on their own phone and sees the draft live: order reveal,
card flips, confetti and all.

## How it works

- One shared draft held in server memory, synced to every device over websockets
- Each person claims their name in the lobby (claims survive refreshes via a device token)
- Draw order for 1st-4th pick is decided at random with a reveal moment
- 12 rounds: rounds 1-3 draw Tier 4 (The Dreamers), building up to Tier 1 (The Heavyweights) in rounds 10-12
- Everyone draws once per round, so each player is guaranteed exactly 3 teams from every tier - fair by construction
- Only the player on the clock can hit Draw (anyone can draw for an unclaimed name)
- Results screen has a "Copy results for Slack" button

Note on copy: Alex uses they/them pronouns. All generated copy uses they/them
for every player so nobody is ever misgendered.

## Run locally

```
npm install
npm start
```

Open http://localhost:3000 in two browser windows to see the sync.

## Deploy to Render

1. Push this folder to a GitHub repo
2. In Render: New > Web Service > connect the repo
3. Settings:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free is fine for a one-off draft
4. Share the `.onrender.com` URL with the team

## Things to know

- State lives in memory. If the server restarts mid-draft (free tier instances
  sleep after inactivity), the draft resets. Keep the page open and run the
  draft in one sitting - it takes about 10 minutes.
- The "Reset and run again" button resets the draft for everyone, with a confirm.
- Team list is the actual 48 qualified nations with FIFA rankings as of June 2026.
