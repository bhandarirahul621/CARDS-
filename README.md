# Blackjack

A browser Blackjack game built on the free [Deck of Cards API](https://deckofcardsapi.com/).

## How it works

The API is the **dealer's shoe**. It shuffles and hands out cards. Everything else
(scoring, rules, betting) runs in `app.js`.

| API call | When we use it |
| --- | --- |
| `GET /api/deck/new/shuffle/?deck_count=6` | Page load: open a shuffled 6-deck shoe |
| `GET /api/deck/<deck_id>/draw/?count=N` | Deal 4 cards, then 1 per hit or dealer draw |
| `GET /api/deck/<deck_id>/shuffle/` | Reshuffle when fewer than 78 cards remain |

The API's *piles* feature doesn't work with multi-deck shoes, so each hand is kept
in JavaScript instead.

## Google login (Supabase Auth)

Players sign in with Google before they can play. Once signed in, they see a greeting
with their name, email and Google profile picture.

- `auth.js` creates the Supabase client with the project URL and **publishable** key.
  Those are designed to be public; never put the secret/service_role key in this repo.
- Flow: site → Supabase → Google → `https://masrtghpydxbacufdswg.supabase.co/auth/v1/callback` → back to the site.

**One-time Supabase setup** (Dashboard → Authentication → URL Configuration):

- **Site URL:** your Netlify URL, e.g. `https://your-site.netlify.app`
- **Redirect URLs:** add your Netlify URL and `http://localhost:8000` for local testing.
  If a URL isn't listed, Supabase sends people to the Site URL instead.

## House rules

- 6-deck shoe, reshuffled at 25% remaining
- Blackjack pays 3:2
- Dealer stands on all 17s
- Double down on your first two cards
- Your bank is saved in the browser (`localStorage`)

## Files

- `index.html`: page structure
- `style.css`: the green-felt look
- `app.js`: game logic and API calls
- `auth.js`: Google login, greeting, sign out
- `netlify.toml`: Netlify deploy settings

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Deploy to Netlify

No build step. Either drag this folder onto <https://app.netlify.com/drop>, or
connect the GitHub repo in Netlify with branch `main`, an empty build command,
and publish directory `.`.
