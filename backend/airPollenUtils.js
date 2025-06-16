// airPollenService.js

const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const AMBEE_POLLEN_API_KEY = process.env.AMBEE_POLLEN_API_KEY;

// ✅ 미세먼지 정보 가져오기
async function getAirQuality(lat, lon) {
  try {
    const urlV3 = `https://api.openweathermap.org/data/3.0/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    const res = await axios.get(urlV3);
    const data = res.data;
    const pm25 = data.list[0].components.pm2_5;
    const pm10 = data.list[0].components.pm10;
    return { pm25, pm10 };
  } catch (err) {
    const urlV25 = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    try {
      const res = await axios.get(urlV25);
      const data = res.data;
      const pm25 = data.list[0].components.pm2_5;
      const pm10 = data.list[0].components.pm10;
      return { pm25, pm10 };
    } catch (fallbackErr) {
      console.error('❌ 미세먼지 API 호출 실패:', fallbackErr.message);
      return null;
    }
  }
}

// Ambee Pollen API 호출 함수 (응답 구조에 맞춰 수정됨)
async function getPollenAmbee(lat, lon) {
  try {
    const url = 'https://api.ambeedata.com/latest/pollen/by-lat-lng';

    const res = await axios.get(url, {
      params: { lat, lng: lon },
      headers: {
        'x-api-key': AMBEE_POLLEN_API_KEY,
        'Accept': 'application/json'
      }
    });

    // 응답 전체를 콘솔에 찍어서 실제 구조를 재확인
    console.log('🌲 Ambee 응답 JSON:', JSON.stringify(res.data, null, 2));

    // Ambee 응답 내부의 data 배열
    const arr = res.data?.data;
    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn('🌲 Ambee 응답에 data 배열이 없거나 비어 있습니다.');
      return null;
    }

    // 첫 번째(유일한) 객체를 꺼냄
    const info      = arr[0];
    const risks     = info.Risk;    // { grass_pollen: "Low", tree_pollen: "Low", weed_pollen: "Low" }
    const counts    = info.Count;   // { grass_pollen: 27, tree_pollen: 47, weed_pollen: 13 }
    const updatedAt = info.updatedAt; // "2025-06-04T11:00:00.000Z"

    if (typeof risks !== 'object' || typeof counts !== 'object') {
      console.warn('🌲 Ambee 응답 형식이 예상과 다릅니다. Risk 또는 Count 필드가 없습니다.');
      return null;
    }

    // 위험도 우선순위 매핑
    const priorityMap = { 'High': 3, 'Medium': 2, 'Low': 1 };

    // "가장 높은 위험도"를 찾기 위해 기본값 세팅
    let topType = Object.keys(risks)[0]; // 예: "grass_pollen"
    for (const type of Object.keys(risks)) {
      if (priorityMap[risks[type]] > priorityMap[risks[topType]]) {
        topType = type;
      }
    }

    // 최종 선택된 항목
    const topRisk  = risks[topType];    // “Low”/“Medium”/“High”
    const topCount = counts[topType];   // 숫자
    const topTime  = updatedAt;         // ISO 문자열

    // ex) { type: "grass_pollen", count: 27, risk: "Low", time: "2025-06-04T11:00:00.000Z" }
    return {
      type:  topType,
      count: topCount,
      risk:  topRisk,
      time:  topTime
    };
  } catch (err) {
    console.error('🌲 Ambee Pollen API 호출 오류:', {
      status: err.response?.status,
      data:   err.response?.data || err.message
    });
    return null;
  }
}

module.exports = {
  getAirQuality,
  getPollenAmbee
};
