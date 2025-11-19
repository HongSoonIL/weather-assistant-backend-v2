// userProfileUtils.js
const { db } = require('./firebaseAdmin');

// 사용자 프로필 저장
async function saveUserProfile(uid, profileData) {
  try {
    await db.collection('users').doc(uid).set(profileData);
    return true;
  } catch (err) {
    console.error('❌ 사용자 정보 저장 실패:', err.message);
    return false;
  }
}

// 사용자 프로필 불러오기 (하위 컬렉션 schedules 포함)
async function getUserProfile(uid) {
  try {
    // 1. 기본 사용자 정보 문서 가져오기
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    
    if (!doc.exists) return null;
    
    const userData = doc.data();

    // 2. 🔥 [중요 수정] 하위 컬렉션 'schedules' 데이터 가져오기
    // Firestore의 하위 컬렉션은 상위 문서를 가져올 때 자동으로 포함되지 않으므로 별도 쿼리가 필요합니다.
    const schedulesSnapshot = await userRef.collection('schedules').get();
    
    let scheduleList = [];
    if (!schedulesSnapshot.empty) {
      scheduleList = schedulesSnapshot.docs.map(doc => {
        const data = doc.data();
        // 예: "2025-12-16: 성수 카페 탐방" 형식으로 변환
        return `${data.date}: ${data.title}`; 
      });
    }

    // 3. 가져온 일정을 하나의 문자열로 합쳐서 userData에 추가
    userData.schedule = scheduleList.length > 0 ? scheduleList.join(', ') : '일정 없음';
    
    console.log(`👤 [UserProfile] ${uid}님의 데이터 로드 완료 (일정 포함):`, userData.schedule);
    
    return userData;

  } catch (err) {
    console.error('❌ 사용자 정보 불러오기 실패:', err.message);
    return null;
  }
}

module.exports = {
  saveUserProfile,
  getUserProfile
};