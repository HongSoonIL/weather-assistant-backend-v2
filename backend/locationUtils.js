const axios = require('axios');

const KAKAO_API_KEY = 'ad730d57d614ed3fd525781250b82ab6'; // 또는 .env 사용

async function geocodeKakao(locationName) {
  const res = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
    headers: {
      Authorization: `KakaoAK ${KAKAO_API_KEY}` // ✅ 올바른 형식
    },
    params: {
      query: locationName
    }
  });

  const doc = res.data.documents?.[0];
  if (!doc) return null;

  return {
    name: doc.place_name,
    lat: doc.y,
    lon: doc.x
  };
}

module.exports = { geocodeKakao };
