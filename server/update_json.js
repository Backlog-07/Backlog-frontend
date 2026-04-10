const fs = require('fs');
const path = require('path');

const keysToInsert = [
  "WhatsApp Image 2026-04-10 at 11.47.25 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.25 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.26 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.26 PM (2).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.26 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.27 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.27 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.28 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.28 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.29 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.29 PM (2).jpeg"
];

const worldImages = keysToInsert.map((key, i) => {
  return {
    id: Date.now() + i,
    imageUrl: "World%20Images/" + encodeURIComponent(key).replace(/\(/g, "%28").replace(/\)/g, "%29"),
    createdAt: new Date().toISOString()
  };
});

fs.writeFileSync(
  path.join(__dirname, 'data', 'worldImages.json'), 
  JSON.stringify(worldImages, null, 2)
);
console.log("Updated worldImages.json");
