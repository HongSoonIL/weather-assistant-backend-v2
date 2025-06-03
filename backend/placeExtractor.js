// locationExtractor.js
function extractLocationFromText(text) {
  // ✅ 시간 표현 제거 (장소 혼동 방지)
  const timePattern = /(오늘|내일|모레|이번주\s?[월화수목금토일]요일?|다음주\s?[월화수목금토일]요일?|[월화수목금토일]요일|하루|이틀|삼일|사흘|닷새|엿새|뒤|\d{1,2}일\s?뒤|\d{1,2}시간\s?뒤|\d{1,2}분\s?뒤)/g;

  const cleanText = text.replace(timePattern, '').trim();

  // ✅ 주소 추출 패턴 (시/도/군/구/동/읍/면 단위까지)
  const locationMatch = cleanText.match(/([가-힣]+)(시|도|군|구|동|읍|면)?/);
  if (!locationMatch) return null;

  // ✅ 예: "하남시", "안성", "서울" → 보정
  let location = locationMatch[0];

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