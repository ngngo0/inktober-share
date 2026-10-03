/* ==========================================================================
   Site settings. Edit this file; you shouldn't need to touch app.js.
   ========================================================================== */
const CONFIG = {
  // Apps Script web app URL. Each item: { id, title, artist, inktoberDay, imageUrl, caption}.
  // Leave empty to preview with demo data.
  API_URL: "https://script.google.com/macros/s/AKfycbycxrB4ayR1ipycB7lojIeaKuBmP-31oS93trxwioAP93nvlxKRlQGeI18XiDD30eTf/exec",

  YEAR: 2026,
  MONTH: 9, // October (months start at 0)

  // One word per day. Day 1 = first word.
  PROMPTS: [
    "Apple", "Relic", "Miniature", "Cactus", "Smack", "Ogre", "Panic", "Stinky", "Ram", "Mystical",
    "Rescue", "Toss", "Flimsy", "Lady", "Hooray", "Gangly", "Contraption", "Flightless", "Confused",
    "Lounge", "Hero", "Beacon", "Dapper", "Bake", "Fracture", "Zip", "Dumb", "Trophy", "Tusk", "Cookie", "Flex",
  ],

  // Give people their own color. Use the artist's name exactly as it appears in the sheet
  // (capitals don't matter). Any CSS hex color works; pastels read best because text sits on top.
  // Anyone not listed gets the next color from DEFAULT_COLORS.
  ARTIST_COLORS: {
    Geo: "#f2c94c", // chalk yellow
    Yash: "#7cc4e0",  // chalk blue
    Danny: "#f29bb8",    // chalk pink
    // "Jules": "#9bd18b",
  },

  DEFAULT_COLORS: ["#f2c94c", "#7cc4e0", "#f29bb8", "#9bd18b", "#f4a261"],
};
