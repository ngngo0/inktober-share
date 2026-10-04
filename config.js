/* ==========================================================================
   Site settings. Edit this file; you shouldn't need to touch app.js.
   ========================================================================== */
const CONFIG = {
  // the rules in supabase/schema.sql are what protect your data. Leave URL empty to preview with demo data.
  SUPABASE: { URL: "https://tahrozavekcliomqiqev.supabase.co", ANON_KEY: "sb_publishable_E3ZeFCShjrviOcMMIVVO3g_0ApfnjL9", BUCKET: "drawings" },

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
    Khoai: "#f2c94c", // chalk yellow
    Danny: "#7cc4e0",  // chalk blue
    Yash: "#f29bb8",    // chalk pink
    Geo: "#9bd18b",   // chalk green
  },

  // Drawings are uploaded exactly as chosen (JPEG, PNG or WebP). Larger files take longer on slow connections.
  UPLOAD: { MAX_FILE_MB: 15 },

  // Emoji people can react with. If you change these, update the "emoji in (...)" list in supabase/schema.sql too.
  REACTIONS: ["❤️", "🔥", "👏", "✨"],

  DEFAULT_COLORS: ["#f2c94c", "#7cc4e0", "#f29bb8", "#9bd18b", "#f4a261"],
};
