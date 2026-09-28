require('dotenv').config();
const t = process.env.MAPBOX_SECRET_TOKEN;
if (!t) { console.log('MAPBOX_SECRET_TOKEN: NOT SET locally'); process.exit(0); }
console.log('token prefix:', t.slice(0, 6), 'length:', t.length);
(async () => {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/-0.18,5.6.json?limit=1&access_token=${t}`;
  const r = await fetch(url);
  console.log('mapbox status:', r.status);
  const b = await r.json();
  console.log('place_name:', b.features && b.features[0] && b.features[0].place_name);
})();
