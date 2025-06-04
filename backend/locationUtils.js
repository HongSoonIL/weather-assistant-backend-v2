const axios = require('axios');
const GOOGLE_API_KEY = 'AIzaSyAP2585Er-J4_WcncTQ02F7ZuyyPAuxeFs';

async function geocodeGoogle(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;
  const res = await axios.get(url);
  const results = res.data.results;

  if (!results || results.length === 0) return null;

  const { lat, lng } = results[0].geometry.location;
  return { lat, lon: lng };
}

module.exports = {
  geocodeGoogle
};