// placeExtractor.js
function extractLocationFromText(text) {
  // ✅ 시간 표현 제거 (장소 혼동 방지)
  const timePattern = /(오늘|내일|모레|이번주\s?[월화수목금토일]요일?|다음주\s?[월화수목금토일]요일?|[월화수목금토일]요일|하루|이틀|삼일|사흘|닷새|엿새|뒤|\d{1,2}일\s?뒤|\d{1,2}시간\s?뒤|\d{1,2}분\s?뒤)/g;

  const cleanText = text.replace(timePattern, '').trim();

  // ✅ "장소로 취급하면 안 되는 일반 질의 단어" 리스트 추가
  const nonLocations = ['날씨', '미세먼지', '꽃가루', '비', '기온', '온도', '주간', '시간', '습도', '바람', '정보', '알려줘', '예보', '예상', '어때', '상태'];

  // ✅ 주소 추출 패턴 (시/도/군/구/동/읍/면 단위까지)
  const locationMatch = cleanText.match(/([가-힣]+)(시|도|군|구|동|읍|면)?/);
  if (!locationMatch) return null;

  let location = locationMatch[0];

  // 👉 일반 키워드면 무조건 제외
  if (nonLocations.includes(location)) return null;

  const corrections = {
    '서울': '서울특별시',
    '부산': '부산광역시',
    '대전': '대전광역시',
    '대구': '대구광역시',
    '광주': '광주광역시',
    '울산': '울산광역시',
    '인천': '인천광역시',
    '세종': '세종특별자치시',
    '제주': '제주특별자치도'
  };

  if (corrections[location]) location = corrections[location];

  return location;
}

module.exports = {
  extractLocationFromText
};