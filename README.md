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
